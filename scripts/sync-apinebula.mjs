import fs from 'node:fs';
import path from 'node:path';

const PAGE_URLS = [
  'https://apinebula.ai/zh/pricing',
  'https://apinebula.ai/zh/fee',
];
const SOURCE_URL = 'https://apinebula.ai/zh/fee';
const root = process.cwd();
const providerPath = path.join(root, 'data/providers/apinebula.json');
const modelsPath = path.join(root, 'data/models.json');

const requestHeaders = {
  accept: 'text/html,application/xhtml+xml,application/json,text/plain,*/*',
  'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
  'cache-control': 'no-store',
  'user-agent': 'Mozilla/5.0 (compatible; ai-model-price-bot/1.0; +https://github.com/wuuJiawei/ai-model-price)',
};

const extraAliases = {
  'claude-haiku-4-5': ['claude-haiku-4-5-20251001'],
};

function shanghaiDateTime() {
  const shifted = new Date(Date.now() + 8 * 60 * 60 * 1000);
  return shifted.toISOString().replace(/\.\d{3}Z$/, '+08:00');
}

function decodeHtml(input) {
  return input
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&yen;|&#165;/gi, '¥')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");
}

function htmlToText(html) {
  return decodeHtml(html)
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, match => ` ${decodeHtml(match)} `)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\\[nrt]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function asNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function findPrice(segment, labels) {
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = segment.match(new RegExp(`${escaped}\\s*[¥￥]?\\s*([0-9]+(?:\\.[0-9]+)?)`, 'i'));
    if (match) return asNumber(match[1]);
  }
  return null;
}

function parseModel(text, model) {
  const aliases = [model.id, ...(model.aliases || []), ...(extraAliases[model.id] || [])];
  const lower = text.toLowerCase();

  for (const alias of aliases) {
    const index = lower.indexOf(alias.toLowerCase());
    if (index < 0) continue;

    const segment = text.slice(index, Math.min(text.length, index + 4200));
    const input = findPrice(segment, ['输入价格']);
    const output = findPrice(segment, ['输出价格', '补全价格']);
    if (input == null || output == null) continue;

    const cachedInput = findPrice(segment, ['缓存读取价格']);
    const cacheCreate = findPrice(segment, ['缓存写入价格', '缓存创建价格']);
    const item = { model: model.id, input, output };
    if (cachedInput != null) item.cached_input = cachedInput;
    if (cacheCreate != null) item.cache_create = cacheCreate;
    item.note = '自动采集 · 官网模型广场';
    return item;
  }
  return null;
}

async function fetchPage(url) {
  const response = await fetch(url, { redirect: 'follow', headers: requestHeaders });
  if (!response.ok) throw new Error(`${url} -> HTTP ${response.status}`);
  const html = await response.text();
  return { url: response.url || url, html, text: htmlToText(html) };
}

function compactSnippet(text, index, before = 500, after = 1200) {
  return text.slice(Math.max(0, index - before), Math.min(text.length, index + after)).replace(/\s+/g, ' ');
}

async function inspectBundles(page) {
  const scripts = [...page.html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)].map(m => m[1]);
  console.log(`! APINebula scripts=${JSON.stringify(scripts)}`);
  const endpointCandidates = new Set();
  let snippetCount = 0;

  for (const src of scripts.slice(0, 30)) {
    try {
      const scriptUrl = new URL(src, page.url);
      if (scriptUrl.origin !== new URL(page.url).origin) continue;
      const response = await fetch(scriptUrl, { redirect: 'follow', headers: { ...requestHeaders, accept: '*/*' } });
      if (!response.ok) continue;
      const js = await response.text();
      console.log(`! APINebula bundle=${scriptUrl.href}, length=${js.length}`);

      for (const match of js.matchAll(/["'`]((?:https?:\/\/[^"'`\s)]+|\/(?:api|v1)[^"'`\s)]*))["'`]/gi)) {
        endpointCandidates.add(match[1]);
      }

      const lower = js.toLowerCase();
      for (const needle of ['pricing', 'fee', 'model_price', 'modelprice', '/api/', 'models', 'group']) {
        if (snippetCount >= 18) break;
        const index = lower.indexOf(needle);
        if (index >= 0) {
          console.log(`! APINebula[${needle}]=${compactSnippet(js, index)}`);
          snippetCount += 1;
        }
      }
    } catch (error) {
      console.warn(`! APINebula bundle inspect failed: ${String(error?.message || error)}`);
    }
  }

  console.log(`! APINebula endpoint candidates=${JSON.stringify([...endpointCandidates].slice(0, 120))}`);
}

const canonicalModels = JSON.parse(fs.readFileSync(modelsPath, 'utf8'));
let bestPage = null;
let bestModels = [];
const errors = [];

for (const url of PAGE_URLS) {
  try {
    const page = await fetchPage(url);
    bestPage ||= page;
    const parsed = canonicalModels.map(model => parseModel(page.text, model)).filter(Boolean);
    console.log(`✓ APINebula ${url} HTTP 页面解析到 ${parsed.length} 个目标模型`);
    if (parsed.length > bestModels.length) {
      bestPage = page;
      bestModels = parsed;
    }
  } catch (error) {
    errors.push(String(error?.message || error));
  }
}

if (bestModels.length < 4) {
  if (bestPage) await inspectBundles(bestPage);
  throw new Error(`APINebula 仅解析到 ${bestModels.length} 个目标模型，停止更新。${errors.length ? ` ${errors.join('; ')}` : ''}`);
}

const provider = JSON.parse(fs.readFileSync(providerPath, 'utf8'));
provider.currency = 'CNY';
provider.source_url = SOURCE_URL;
provider.models = bestModels;
provider.auto_sync = { enabled: true, interval: 'hourly' };
delete provider.status;
delete provider.note;

const updatedAtTime = shanghaiDateTime();
provider.updated_at = updatedAtTime.slice(0, 10);
provider.updated_at_time = updatedAtTime;

fs.writeFileSync(providerPath, JSON.stringify(provider, null, 2) + '\n');
console.log(`✓ APINebula 已同步 ${bestModels.length} 个模型；同步时间 ${updatedAtTime}`);
