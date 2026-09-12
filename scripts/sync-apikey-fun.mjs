import fs from 'node:fs';
import path from 'node:path';

const API_URLS = [
  'https://api.apikey.fun/api/pricing',
  'https://apikey.fun/api/pricing',
];
const PRICE_URL = 'https://apikey.fun/pricing';
const root = process.cwd();
const providerPath = path.join(root, 'data/providers/apikey-fun.json');
const modelsPath = path.join(root, 'data/models.json');

const GROUP_PATTERNS = {
  OpenAI: [/^default$/i, /^默认$/, /^standard$/i, /^标准$/, /openai/i, /gpt/i, /codex/i],
  Anthropic: [/^default$/i, /^默认$/, /^standard$/i, /^标准$/, /anthropic/i, /claude/i],
};

const EXCLUDED_GROUPS = /vip|会员|订阅|套餐|内部|测试|test|private|专属|enterprise|企业|max|sale/i;

function shanghaiDateTime() {
  const shifted = new Date(Date.now() + 8 * 60 * 60 * 1000);
  return shifted.toISOString().replace(/\.\d{3}Z$/, '+08:00');
}

function asNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeGroupRatio(raw) {
  const out = new Map();
  for (const [key, value] of Object.entries(raw || {})) {
    const n = asNumber(value);
    if (n != null && n > 0) out.set(key, n);
  }
  return out;
}

function pickGroup(vendor, enableGroups, groupRatio) {
  const enabled = (Array.isArray(enableGroups) ? enableGroups : [])
    .filter(group => groupRatio.has(group));
  if (!enabled.length) return null;

  for (const pattern of GROUP_PATTERNS[vendor] || []) {
    const match = enabled.find(group => pattern.test(group) && !EXCLUDED_GROUPS.test(group));
    if (match) return match;
  }

  const publicCandidates = enabled
    .filter(group => !EXCLUDED_GROUPS.test(group))
    .sort((a, b) => groupRatio.get(a) - groupRatio.get(b));

  return publicCandidates[0] || null;
}

function pricingFor(row, groupMultiplier) {
  if (Number(row.quota_type) === 1) return null;

  const modelRatio = asNumber(row.model_ratio);
  const completionRatio = asNumber(row.completion_ratio);
  if (modelRatio == null || completionRatio == null) return null;

  const input = modelRatio * 2 * groupMultiplier;
  const output = input * completionRatio;
  const cacheRatio = asNumber(row.cache_ratio);
  const cachedInput = cacheRatio == null ? null : input * cacheRatio;

  return {
    input: +input.toFixed(8),
    output: +output.toFixed(8),
    cached_input: cachedInput == null ? null : +cachedInput.toFixed(8),
  };
}

function sameNumber(a, b) {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return Math.abs(Number(a) - Number(b)) < 1e-9;
}

async function fetchPricingPayload() {
  const errors = [];
  for (const apiUrl of API_URLS) {
    const response = await fetch(apiUrl, {
      redirect: 'follow',
      headers: {
        accept: 'application/json,text/plain,*/*',
        'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'cache-control': 'no-store',
        referer: PRICE_URL,
        'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36',
      },
    });

    if (!response.ok) {
      errors.push(`${apiUrl} -> HTTP ${response.status}`);
      continue;
    }

    const payload = await response.json();
    if (!payload || payload.success === false || !Array.isArray(payload.data)) {
      errors.push(`${apiUrl} -> invalid payload`);
      continue;
    }

    console.log(`✓ APIKEY.FUN pricing API: ${apiUrl}`);
    return payload;
  }

  throw new Error(`APIKEY.FUN pricing API unavailable: ${errors.join('; ')}`);
}

const payload = await fetchPricingPayload();
const groupRatio = normalizeGroupRatio(payload.group_ratio);
if (!groupRatio.size) {
  throw new Error('APIKEY.FUN pricing API 未返回可用 group_ratio，停止更新。');
}

const canonicalModels = JSON.parse(fs.readFileSync(modelsPath, 'utf8'));
const provider = JSON.parse(fs.readFileSync(providerPath, 'utf8'));
provider.models ||= [];
const currentMap = new Map(provider.models.map(item => [item.model, item]));
const pricingRows = new Map(payload.data.map(item => [String(item.model_name || ''), item]));

let found = 0;
let changed = false;
const changes = [];

for (const model of canonicalModels) {
  if (!GROUP_PATTERNS[model.vendor]) continue;

  const aliases = [model.id, ...(model.aliases || [])];
  const row = aliases.map(alias => pricingRows.get(alias)).find(Boolean);
  if (!row) continue;

  const group = pickGroup(model.vendor, row.enable_groups, groupRatio);
  if (!group) {
    console.warn(`! ${model.id} 未找到明确公开分组，保留现有价格；groups=${JSON.stringify(row.enable_groups || [])}`);
    continue;
  }

  const price = pricingFor(row, groupRatio.get(group));
  if (!price) {
    console.warn(`! ${model.id} 不是可比较的 token 计费，保留现有价格`);
    continue;
  }

  found += 1;
  const note = `自动采集 · ${group}`;
  const current = currentMap.get(model.id);

  if (!current) {
    const next = {
      model: model.id,
      input: price.input,
      output: price.output,
      ...(price.cached_input == null ? {} : { cached_input: price.cached_input }),
      note,
    };
    provider.models.push(next);
    currentMap.set(model.id, next);
    changed = true;
    changes.push(`${model.id}: 新增 ${price.input}/${price.output} (${group})`);
    continue;
  }

  const priceChanged =
    !sameNumber(current.input, price.input) ||
    !sameNumber(current.output, price.output) ||
    !sameNumber(current.cached_input, price.cached_input);
  const noteChanged = current.note !== note;

  if (priceChanged || noteChanged) {
    const before = `${current.input}/${current.output}/${current.cached_input ?? '-'}`;
    current.input = price.input;
    current.output = price.output;
    if (price.cached_input == null) delete current.cached_input;
    else current.cached_input = price.cached_input;
    current.note = note;
    changed = true;
    changes.push(`${model.id}: ${before} -> ${price.input}/${price.output}/${price.cached_input ?? '-'} (${group})`);
  }
}

if (found === 0) {
  throw new Error('未从 APIKEY.FUN pricing API 匹配到任何目标模型与公开分组，停止更新，避免覆盖错误数据。');
}

provider.currency = 'CNY';
provider.source_url = PRICE_URL;
provider.auto_sync = { enabled: true, interval: 'hourly' };
delete provider.status;
if (provider.note === '价格正在努力登记中') delete provider.note;

const updatedAtTime = shanghaiDateTime();
provider.updated_at = updatedAtTime.slice(0, 10);
provider.updated_at_time = updatedAtTime;

fs.writeFileSync(providerPath, JSON.stringify(provider, null, 2) + '\n');

if (changed) {
  console.log(`✓ APIKEY.FUN 价格已更新：${changes.join('; ')}；同步时间 ${updatedAtTime}`);
} else {
  console.log(`✓ APIKEY.FUN 已成功校验 ${found} 个模型，价格无变化；同步时间 ${updatedAtTime}`);
}
