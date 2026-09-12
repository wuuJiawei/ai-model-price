import fs from 'node:fs';
import path from 'node:path';

const API_URL = 'https://4router.net/api/pricing';
const PRICE_URL = 'https://4router.net/pricing';
const root = process.cwd();
const providerPath = path.join(root, 'data/providers/4router.json');
const modelsPath = path.join(root, 'data/models.json');

// 4Router 没有统一 default 分组，不同厂商有各自的路由池。
// 对价格对比站只选择明确支持第三方软件接入的公开分组，避免把
// ClaudeMax / ccMax-sale 这类仅限原生 ClaudeCode / 4RouterAI 的价格混进来。
const GROUP_PREFERENCES = {
  OpenAI: ['GptPro', 'GptApi'],
  Anthropic: ['cheapClaude', 'ClaudeApi', 'ClaudeApiV', 'OfficialClaude', 'ClaudeExtern'],
  Google: ['GeminiApi'],
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

function findGroupRatio(groupRatio, groupName) {
  const target = String(groupName).toLowerCase();
  for (const [key, value] of groupRatio) {
    if (String(key).toLowerCase() === target) return { name: key, ratio: value };
  }
  return null;
}

function pickGroup(vendor, enableGroups, groupRatio) {
  const enabled = Array.isArray(enableGroups) ? enableGroups : [];
  const enabledLower = new Map(enabled.map(group => [String(group).toLowerCase(), group]));
  const preferences = GROUP_PREFERENCES[vendor] || [];

  for (const preferred of preferences) {
    const actualEnabled = enabledLower.get(preferred.toLowerCase());
    if (!actualEnabled) continue;
    const resolved = findGroupRatio(groupRatio, actualEnabled);
    if (resolved) return resolved;
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

const response = await fetch(API_URL, {
  redirect: 'follow',
  headers: {
    'user-agent': 'Mozilla/5.0 (compatible; ai-model-price-bot/1.0; +https://github.com/wuuJiawei/ai-model-price)',
    accept: 'application/json,text/plain,*/*',
    'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'cache-control': 'no-store',
    referer: PRICE_URL,
  },
});

if (!response.ok) {
  throw new Error(`4Router pricing fetch failed: HTTP ${response.status}`);
}

const payload = await response.json();
if (!payload || payload.success === false || !Array.isArray(payload.data)) {
  throw new Error('4Router /api/pricing 返回格式异常，停止更新。');
}

const groupRatio = normalizeGroupRatio(payload.group_ratio);
if (!groupRatio.size) {
  throw new Error('4Router /api/pricing 未返回可用 group_ratio，停止更新。');
}

const canonicalModels = JSON.parse(fs.readFileSync(modelsPath, 'utf8'));
const provider = JSON.parse(fs.readFileSync(providerPath, 'utf8'));
const pricingRows = new Map(payload.data.map(item => [String(item.model_name || '').toLowerCase(), item]));
const nextModels = [];
const changes = [];

for (const model of canonicalModels) {
  if (!GROUP_PREFERENCES[model.vendor]) continue;

  const aliases = [model.id, ...(model.aliases || [])].map(alias => String(alias).toLowerCase());
  const row = aliases.map(alias => pricingRows.get(alias)).find(Boolean);
  if (!row) continue;

  const group = pickGroup(model.vendor, row.enable_groups, groupRatio);
  if (!group) {
    console.warn(`! ${model.id} 未启用目标公开分组，跳过`);
    continue;
  }

  const price = pricingFor(row, group.ratio);
  if (!price) {
    console.warn(`! ${model.id} 不是可比较的 token 计费，跳过`);
    continue;
  }

  const item = {
    model: model.id,
    input: price.input,
    output: price.output,
    ...(price.cached_input == null ? {} : { cached_input: price.cached_input }),
    note: `自动采集 · ${group.name}`,
  };
  nextModels.push(item);
  changes.push(`${model.id}: ${price.input}/${price.output}/${price.cached_input ?? '-'} (${group.name})`);
}

if (nextModels.length === 0) {
  throw new Error('未从 4Router /api/pricing 匹配到任何目标模型与公开对比分组，停止更新，避免覆盖错误数据。');
}

// 4Router 是实时 NewAPI 数据源。每次成功同步都重建本站的模型快照，
// 防止已下线模型、已变更分组或旧的误匹配价格残留在页面里。
provider.models = nextModels;
provider.currency = 'USD';
provider.source_url = PRICE_URL;
provider.auto_sync = { enabled: true, interval: 'hourly' };
delete provider.status;
delete provider.note;

const updatedAtTime = shanghaiDateTime();
provider.updated_at = updatedAtTime.slice(0, 10);
provider.updated_at_time = updatedAtTime;

fs.writeFileSync(providerPath, JSON.stringify(provider, null, 2) + '\n');
console.log(`✓ 4Router 已同步 ${nextModels.length} 个模型：${changes.join('; ')}；同步时间 ${updatedAtTime}`);
