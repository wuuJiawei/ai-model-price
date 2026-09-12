import fs from 'node:fs';
import path from 'node:path';

const PRICE_URL = 'https://apikey.fun/pricing';
const GROUPS_URL = 'https://apikey.fun/api/v1/pricing/groups';
const root = process.cwd();
const providerPath = path.join(root, 'data/providers/apikey-fun.json');
const modelsPath = path.join(root, 'data/models.json');

const requestHeaders = {
  accept: 'application/json,text/plain,*/*',
  'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
  'cache-control': 'no-store',
  referer: PRICE_URL,
  'user-agent': 'Mozilla/5.0 (compatible; ai-model-price-bot/1.0; +https://github.com/wuuJiawei/ai-model-price)',
};

const platformByVendor = {
  OpenAI: 'openai',
  Anthropic: 'anthropic',
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

async function fetchText(url, accept = '*/*') {
  const response = await fetch(url, {
    redirect: 'follow',
    headers: { ...requestHeaders, accept },
  });
  if (!response.ok) {
    throw new Error(`${url} -> HTTP ${response.status}`);
  }
  return response.text();
}

async function fetchPublicGroups() {
  const response = await fetch(GROUPS_URL, {
    redirect: 'follow',
    headers: requestHeaders,
  });
  if (!response.ok) {
    throw new Error(`APIKEY.FUN public pricing groups failed: HTTP ${response.status}`);
  }

  const payload = await response.json();
  const groups = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.data)
      ? payload.data
      : Array.isArray(payload?.groups)
        ? payload.groups
        : [];

  if (!groups.length) {
    throw new Error('APIKEY.FUN /api/v1/pricing/groups 未返回公开分组。');
  }
  return groups;
}

function isGeneralPurposeGroup(group) {
  if (!group || group.status === 'disabled') return false;
  if (group.is_exclusive === true) return false;
  if (group.subscription_type && group.subscription_type !== 'standard') return false;
  if (group.claude_code_only === true || group.codex_cli_only === true) return false;

  const name = group.name || '';
  const description = group.description || '';
  const text = `${name} ${description}`;

  // 排除明确限制在特定客户端/场景的分组；“支持生图”本身不代表这是生图专用分组。
  if (/仅限|only\b/i.test(text)) return false;
  if (/生图分组|图片分组|image[- ]?only/i.test(name)) return false;

  const multiplier = asNumber(group.rate_multiplier);
  return multiplier != null && multiplier > 0;
}

function pickGroup(groups, platform) {
  const candidates = groups
    .filter(group => group.platform === platform)
    .filter(isGeneralPurposeGroup)
    .sort((a, b) => Number(a.rate_multiplier) - Number(b.rate_multiplier));

  if (!candidates.length) return null;

  if (platform === 'openai') {
    // 优先可外接的 Codex/API 号池，避免把纯生图或“仅限 Codex”价格算进来。
    const preferred = candidates.filter(group => /外接|codex|api/i.test(`${group.name || ''} ${group.description || ''}`));
    if (preferred.length) return preferred[0];
  }

  return candidates[0];
}

async function fetchDashboardPricingBundle() {
  const html = await fetchText(PRICE_URL, 'text/html,application/xhtml+xml');
  const scriptSources = [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)]
    .map(match => match[1]);

  const mainSource = scriptSources.find(src => /\/assets\/index-[^/]+\.js(?:\?|$)/.test(src));
  if (!mainSource) {
    throw new Error('APIKEY.FUN 页面未找到主前端 bundle。');
  }

  const mainUrl = new URL(mainSource, PRICE_URL);
  const mainJs = await fetchText(mainUrl.href);
  const chunkMatch = mainJs.match(/["'](assets\/dashboardPricing-[^"']+\.js)["']/);
  if (!chunkMatch) {
    throw new Error('APIKEY.FUN 主 bundle 未找到 dashboardPricing chunk。');
  }

  const chunkUrl = new URL(`/${chunkMatch[1]}`, PRICE_URL);
  return fetchText(chunkUrl.href);
}

function extractNumber(chunk, property) {
  const match = chunk.match(new RegExp(`${property}:(-?[0-9]+(?:\\.[0-9]+)?)`));
  return match ? asNumber(match[1]) : null;
}

function parseBaseModel(bundle, modelId) {
  const needle = `name:"${modelId}"`;
  let from = 0;

  while (true) {
    const index = bundle.indexOf(needle, from);
    if (index < 0) return null;
    from = index + needle.length;

    const chunk = bundle.slice(index, index + 700);
    const input = extractNumber(chunk, 'inputUsd');
    const output = extractNumber(chunk, 'outputUsd');
    if (input == null || output == null || input <= 0 || output < input) continue;

    return {
      input,
      output,
      cached_input: extractNumber(chunk, 'cacheReadUsd'),
      cache_create: extractNumber(chunk, 'cacheCreateUsd'),
    };
  }
}

const [groups, bundle] = await Promise.all([
  fetchPublicGroups(),
  fetchDashboardPricingBundle(),
]);

const selectedGroups = {
  openai: pickGroup(groups, 'openai'),
  anthropic: pickGroup(groups, 'anthropic'),
};

if (!selectedGroups.openai || !selectedGroups.anthropic) {
  throw new Error(`APIKEY.FUN 未找到可比较的公开分组：openai=${selectedGroups.openai?.name || '-'}, anthropic=${selectedGroups.anthropic?.name || '-'}`);
}

console.log(`✓ APIKEY.FUN OpenAI 分组：${selectedGroups.openai.name} × ${selectedGroups.openai.rate_multiplier}`);
console.log(`✓ APIKEY.FUN Claude 分组：${selectedGroups.anthropic.name} × ${selectedGroups.anthropic.rate_multiplier}`);

const canonicalModels = JSON.parse(fs.readFileSync(modelsPath, 'utf8'));
const nextModels = [];

for (const model of canonicalModels) {
  const platform = platformByVendor[model.vendor];
  if (!platform) continue;

  const base = parseBaseModel(bundle, model.id);
  if (!base) {
    console.warn(`! APIKEY.FUN 定价页未找到 ${model.id}，跳过`);
    continue;
  }

  const group = selectedGroups[platform];
  const multiplier = Number(group.rate_multiplier);
  const item = {
    model: model.id,
    input: round(base.input * multiplier),
    output: round(base.output * multiplier),
  };

  if (base.cached_input != null) item.cached_input = round(base.cached_input * multiplier);
  if (base.cache_create != null) item.cache_create = round(base.cache_create * multiplier);
  item.note = `自动采集 · ${group.name}`;
  nextModels.push(item);
}

// 当前官网公开价页正常情况下可匹配十余个 GPT / Claude canonical models。
// 过低说明前端结构可能已变化，直接失败，不覆盖上一份有效数据。
if (nextModels.length < 8) {
  throw new Error(`APIKEY.FUN 仅解析到 ${nextModels.length} 个目标模型，疑似页面结构变化，停止更新。`);
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
console.log(`✓ APIKEY.FUN 已同步 ${nextModels.length} 个模型；同步时间 ${updatedAtTime}`);
