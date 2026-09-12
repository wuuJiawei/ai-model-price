import fs from 'node:fs';
import path from 'node:path';

const PRICE_URL = 'https://apinebula.ai/zh/fee';
const API_URL = 'https://apinebula.ai/api/pricing';
const root = process.cwd();
const providerPath = path.join(root, 'data/providers/apinebula.json');
const modelsPath = path.join(root, 'data/models.json');

// 只比较可以作为通用 API 使用的公开分组。
// CODEX 是官网快速开始明确使用的 OpenAI 分组；Claude 的 CC-kiro 明确标注“非满血”，
// 满血Claude Code / Claude Code全球高防又限制 CC 客户端，因此采用支持标准 API 的“不限稳定CC- MAX”。
const GROUP_PREFERENCES = {
  OpenAI: ['CODEX'],
  Anthropic: ['不限稳定CC- MAX'],
};

const extraAliases = {
  'claude-haiku-4-5': ['claude-haiku-4-5-20251001'],
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

function normalizeGroupRatio(raw) {
  const out = new Map();
  for (const [key, value] of Object.entries(raw || {})) {
    const n = asNumber(value);
    if (n != null && n > 0) out.set(String(key), n);
  }
  return out;
}

function pickGroup(vendor, enableGroups, groupRatio) {
  const enabled = new Map((Array.isArray(enableGroups) ? enableGroups : []).map(name => [String(name).toLowerCase(), String(name)]));
  for (const preferred of GROUP_PREFERENCES[vendor] || []) {
    const actual = enabled.get(preferred.toLowerCase());
    if (actual && groupRatio.has(actual)) return { name: actual, ratio: groupRatio.get(actual) };
  }
  return null;
}

function parseTieredPricing(row, multiplier) {
  if (row.billing_mode !== 'tiered_expr' || typeof row.billing_expr !== 'string') return null;

  const tiers = [];
  for (const match of row.billing_expr.matchAll(/tier\("([^"]+)"\s*,\s*([^)]*)\)/g)) {
    const [, name, expression] = match;
    const coefficients = {};
    for (const term of expression.matchAll(/\b(p|c|cr|cc)\b\s*\*\s*([0-9]+(?:\.[0-9]+)?)/g)) {
      coefficients[term[1]] = Number(term[2]);
    }
    if (coefficients.p == null || coefficients.c == null) continue;
    tiers.push({
      name,
      input: round(coefficients.p * multiplier),
      output: round(coefficients.c * multiplier),
      cached_input: coefficients.cr == null ? null : round(coefficients.cr * multiplier),
      cache_create: coefficients.cc == null ? null : round(coefficients.cc * multiplier),
    });
  }

  if (!tiers.length) return null;
  const standard = tiers.find(tier => /standard|标准|<|≤/i.test(tier.name)) || tiers[0];
  const longContext = tiers.find(tier => tier !== standard && /long|context|>|≥/i.test(tier.name)) || tiers.find(tier => tier !== standard) || null;
  return { standard, longContext };
}

function regularPricing(row, multiplier) {
  if (Number(row.quota_type) === 1) return null;
  const modelRatio = asNumber(row.model_ratio);
  const completionRatio = asNumber(row.completion_ratio);
  if (modelRatio == null || completionRatio == null) return null;

  const input = modelRatio * 2 * multiplier;
  const output = input * completionRatio;
  const cacheRatio = asNumber(row.cache_ratio);
  const createCacheRatio = asNumber(row.create_cache_ratio);
  return {
    input: round(input),
    output: round(output),
    cached_input: cacheRatio == null ? null : round(input * cacheRatio),
    cache_create: createCacheRatio == null ? null : round(input * createCacheRatio),
  };
}

function pricingFor(row, multiplier) {
  const tiered = parseTieredPricing(row, multiplier);
  if (tiered) return tiered;
  const standard = regularPricing(row, multiplier);
  return standard ? { standard, longContext: null } : null;
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

if (!response.ok) throw new Error(`APINebula pricing API failed: HTTP ${response.status}`);
const payload = await response.json();
if (!payload || payload.success === false || !Array.isArray(payload.data)) {
  throw new Error('APINebula /api/pricing 返回格式异常，停止更新。');
}

const groupRatio = normalizeGroupRatio(payload.group_ratio);
if (!groupRatio.size) throw new Error('APINebula /api/pricing 未返回 group_ratio，停止更新。');

const canonicalModels = JSON.parse(fs.readFileSync(modelsPath, 'utf8'));
const rows = new Map(payload.data.map(row => [String(row.model_name || '').toLowerCase(), row]));
const nextModels = [];
const changes = [];

for (const model of canonicalModels) {
  if (!GROUP_PREFERENCES[model.vendor]) continue;
  const aliases = [model.id, ...(model.aliases || []), ...(extraAliases[model.id] || [])].map(alias => String(alias).toLowerCase());
  const row = aliases.map(alias => rows.get(alias)).find(Boolean);
  if (!row) {
    console.warn(`! APINebula 未找到 ${model.id}，跳过`);
    continue;
  }

  const group = pickGroup(model.vendor, row.enable_groups, groupRatio);
  if (!group) {
    console.warn(`! APINebula ${model.id} 未启用目标通用分组，跳过`);
    continue;
  }

  const price = pricingFor(row, group.ratio);
  if (!price) {
    console.warn(`! APINebula ${model.id} 不是可比较的 token 计费，跳过`);
    continue;
  }

  const standard = price.standard;
  const item = {
    model: model.id,
    input: standard.input,
    output: standard.output,
    ...(standard.cached_input == null ? {} : { cached_input: standard.cached_input }),
    ...(standard.cache_create == null ? {} : { cache_create: standard.cache_create }),
    note: `自动采集 · ${group.name}`,
  };

  if (price.longContext) {
    item.long_context = {
      input: price.longContext.input,
      output: price.longContext.output,
      ...(price.longContext.cached_input == null ? {} : { cached_input: price.longContext.cached_input }),
      ...(price.longContext.cache_create == null ? {} : { cache_create: price.longContext.cache_create }),
      tier: price.longContext.name,
    };
  }

  nextModels.push(item);
  changes.push(`${model.id}: ${standard.input}/${standard.output}/${standard.cached_input ?? '-'} (${group.name})`);
}

// 当前公开接口应能匹配 4 个 OpenAI + 9 个 Claude canonical models。
// 留一定容错，但数量显著下降时拒绝覆盖上一份有效快照。
if (nextModels.length < 10) {
  throw new Error(`APINebula 仅匹配到 ${nextModels.length} 个目标模型，疑似接口结构或分组变化，停止更新。`);
}

const provider = JSON.parse(fs.readFileSync(providerPath, 'utf8'));
provider.currency = 'CNY';
provider.source_url = PRICE_URL;
provider.models = nextModels;
provider.auto_sync = { enabled: true, interval: 'hourly' };
delete provider.status;
delete provider.note;

const updatedAtTime = shanghaiDateTime();
provider.updated_at = updatedAtTime.slice(0, 10);
provider.updated_at_time = updatedAtTime;

fs.writeFileSync(providerPath, JSON.stringify(provider, null, 2) + '\n');
console.log(`✓ APINebula 已同步 ${nextModels.length} 个模型：${changes.join('; ')}；同步时间 ${updatedAtTime}`);
