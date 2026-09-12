import fs from 'node:fs';
import path from 'node:path';

const PRICE_URL = 'https://www.aiapisplus.com/pricing';
const API_URL = 'https://www.aiapisplus.com/api/pricing';
const root = process.cwd();
const providerPath = path.join(root, 'data/providers/apiplus.json');
const modelsPath = path.join(root, 'data/models.json');

// 只选择公开、可外接的价格分组；避免把仅限原生客户端/套餐专用分组混入对比。
const GROUP_PREFERENCES = {
  OpenAI: ['gpt-pro-tj', 'gpt-pro', 'gpt-pro-v', 'gpt', 'gpt2', 'gpt3', 'vip'],
  Anthropic: ['super_c', 'super_d', 'super_e', 'ccmax-tj', 'ccmax-v', 'default'],
};

function shanghaiDateTime() {
  const shifted = new Date(Date.now() + 8 * 60 * 60 * 1000);
  return shifted.toISOString().replace(/\.\d{3}Z$/, '+08:00');
}

function asNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function round(value) {
  return +Number(value).toFixed(8);
}

function pickGroup(vendor, enableGroups, groupRatio) {
  const enabled = new Set((Array.isArray(enableGroups) ? enableGroups : []).map(v => String(v).toLowerCase()));
  for (const preferred of GROUP_PREFERENCES[vendor] || []) {
    if (!enabled.has(preferred.toLowerCase())) continue;
    const ratio = asNumber(groupRatio?.[preferred]);
    if (ratio != null) return { name: preferred, ratio };
  }
  return null;
}

function pricingFor(row, groupRatio) {
  if (Number(row.quota_type) === 1) return null;

  const modelRatio = asNumber(row.model_ratio);
  const completionRatio = asNumber(row.completion_ratio);
  if (modelRatio == null || completionRatio == null) return null;

  // NewAPI 的 token 计费以 model_ratio × $2 / 1M input 为基础，再乘用户分组倍率。
  const input = modelRatio * 2 * groupRatio;
  const output = input * completionRatio;
  const cacheRatio = asNumber(row.cache_ratio);
  const cacheCreateRatio = asNumber(row.cache_creation_ratio ?? row.create_cache_ratio);

  return {
    input: round(input),
    output: round(output),
    cached_input: cacheRatio == null ? null : round(input * cacheRatio),
    cache_create: cacheCreateRatio == null ? null : round(input * cacheCreateRatio),
  };
}

const response = await fetch(API_URL, {
  redirect: 'follow',
  headers: {
    accept: 'application/json,text/plain,*/*',
    'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'cache-control': 'no-store',
    referer: PRICE_URL,
    'user-agent': 'Mozilla/5.0 (compatible; ai-model-price-bot/1.0; +https://github.com/wuuJiawei/ai-model-price)',
  },
});

if (!response.ok) {
  throw new Error(`APIPlus pricing fetch failed: HTTP ${response.status}`);
}

const payload = await response.json();
if (!payload || payload.success === false || !Array.isArray(payload.data)) {
  throw new Error('APIPlus /api/pricing 返回格式异常，停止更新。');
}
if (!payload.group_ratio || typeof payload.group_ratio !== 'object') {
  throw new Error('APIPlus /api/pricing 未返回 group_ratio，停止更新。');
}

const canonicalModels = JSON.parse(fs.readFileSync(modelsPath, 'utf8'));
const provider = JSON.parse(fs.readFileSync(providerPath, 'utf8'));
const rows = new Map(payload.data.map(item => [String(item.model_name || '').toLowerCase(), item]));
const nextModels = [];
const changes = [];

for (const model of canonicalModels) {
  if (!GROUP_PREFERENCES[model.vendor]) continue;

  const aliases = [model.id, ...(model.aliases || [])].map(v => String(v).toLowerCase());
  const row = aliases.map(alias => rows.get(alias)).find(Boolean);
  if (!row) continue;

  const group = pickGroup(model.vendor, row.enable_groups, payload.group_ratio);
  if (!group) {
    console.warn(`! APIPlus ${model.id} 未找到可外接目标分组，跳过`);
    continue;
  }

  const price = pricingFor(row, group.ratio);
  if (!price) {
    console.warn(`! APIPlus ${model.id} 不是可比较的 token 计费，跳过`);
    continue;
  }

  const item = {
    model: model.id,
    input: price.input,
    output: price.output,
    ...(price.cached_input == null ? {} : { cached_input: price.cached_input }),
    ...(price.cache_create == null ? {} : { cache_create: price.cache_create }),
    note: `自动采集 · ${group.name}`,
  };
  nextModels.push(item);
  changes.push(`${model.id}: ${price.input}/${price.output}/${price.cached_input ?? '-'} (${group.name})`);
}

if (nextModels.length < 4) {
  throw new Error(`APIPlus 仅匹配到 ${nextModels.length} 个目标模型，停止更新，避免覆盖错误数据。`);
}

// 实时 API 是权威快照：模型下线或分组不再可用时，不保留旧价格。
provider.models = nextModels;
provider.currency = 'CNY';
provider.source_url = PRICE_URL;
provider.auto_sync = { enabled: true, interval: 'hourly' };
delete provider.status;
delete provider.note;

const updatedAtTime = shanghaiDateTime();
provider.updated_at = updatedAtTime.slice(0, 10);
provider.updated_at_time = updatedAtTime;

fs.writeFileSync(providerPath, JSON.stringify(provider, null, 2) + '\n');
console.log(`✓ APIPlus 已同步 ${nextModels.length} 个模型：${changes.join('; ')}；同步时间 ${updatedAtTime}`);
