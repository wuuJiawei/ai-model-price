import fs from 'node:fs';
import path from 'node:path';

const API_URL = 'https://9527.codes/api/pricing';
const PRICE_URL = 'https://9527.codes/pricing';
const root = process.cwd();
const providerPath = path.join(root, 'data/providers/9527code.json');
const modelsPath = path.join(root, 'data/models.json');

const GROUP_RULES = {
  OpenAI: [
    /^codex[-_\s·]*特惠活动$/i,
    /^codex[-_\s·]*特惠$/i,
    /codex.*特惠/i,
  ],
  Anthropic: [
    /^claude[-_\s·]*特惠活动$/i,
    /^claude[-_\s·]*特惠$/i,
    /claude.*特惠/i,
  ],
};

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
    if (n != null) out.set(key, n);
  }
  return out;
}

function pickGroup(vendor, enableGroups, groupRatio) {
  const rules = GROUP_RULES[vendor] || [];
  if (!rules.length) return null;
  const enabled = Array.isArray(enableGroups) ? enableGroups : [];
  const candidates = enabled.filter(group => groupRatio.has(group));

  for (const rule of rules) {
    const match = candidates.find(group => rule.test(group));
    if (match) return match;
  }
  return null;
}

function pricingFor(row, groupMultiplier) {
  // New API /api/pricing：token 计费的 model_ratio 以 $2 / 1M input 为基准。
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

const response = await fetch(API_URL, {
  redirect: 'follow',
  headers: {
    'user-agent': 'Mozilla/5.0 (compatible; ai-model-price-bot/1.0; +https://github.com/wuuJiawei/ai-model-price)',
    accept: 'application/json,text/plain,*/*',
    'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
  },
});

if (!response.ok) {
  throw new Error(`9527CODE pricing fetch failed: HTTP ${response.status}`);
}

const payload = await response.json();
if (!payload || payload.success === false || !Array.isArray(payload.data)) {
  throw new Error('9527CODE /api/pricing 返回格式异常，停止更新。');
}

const groupRatio = normalizeGroupRatio(payload.group_ratio);
if (!groupRatio.size) {
  throw new Error('9527CODE /api/pricing 未返回可用 group_ratio，停止更新。');
}

const canonicalModels = JSON.parse(fs.readFileSync(modelsPath, 'utf8'));
const provider = JSON.parse(fs.readFileSync(providerPath, 'utf8'));
const currentMap = new Map((provider.models || []).map(item => [item.model, item]));
const pricingRows = new Map(payload.data.map(item => [String(item.model_name || ''), item]));

let found = 0;
let changed = false;
const changes = [];

for (const model of canonicalModels) {
  if (!GROUP_RULES[model.vendor]) continue;

  const aliases = [model.id, ...(model.aliases || [])];
  const row = aliases.map(alias => pricingRows.get(alias)).find(Boolean);
  if (!row) continue;

  const group = pickGroup(model.vendor, row.enable_groups, groupRatio);
  if (!group) {
    console.warn(`! ${model.id} 未找到目标特惠分组，保留现有价格`);
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
  throw new Error('未从 9527CODE /api/pricing 匹配到任何目标模型与特惠分组，停止更新，避免覆盖错误数据。');
}

provider.source_url = PRICE_URL;
provider.auto_sync = { enabled: true, interval: 'hourly' };

// 只要本次抓取和解析成功，就记录“最后成功同步时间”。
// 即使价格没有变化，页面也能准确显示这条数据最近一次被自动校验的时间。
const updatedAtTime = shanghaiDateTime();
provider.updated_at = updatedAtTime.slice(0, 10);
provider.updated_at_time = updatedAtTime;

fs.writeFileSync(providerPath, JSON.stringify(provider, null, 2) + '\n');

if (changed) {
  console.log(`✓ 9527CODE 价格已更新：${changes.join('; ')}；同步时间 ${updatedAtTime}`);
} else {
  console.log(`✓ 9527CODE 已成功校验 ${found} 个模型，价格无变化；同步时间 ${updatedAtTime}`);
}
