import fs from 'node:fs';
import path from 'node:path';

const PAGE_URL = 'https://teamorouter.cn/zh';
const PRICE_URL = 'https://teamorouter.cn/zh#pricing';
const root = process.cwd();
const providerPath = path.join(root, 'data/providers/teamo.json');

const targets = new Map([
  ['GPT-6 Astra', 'gpt-6-astra'],
  ['GPT-5.6 Sol', 'gpt-5.6-sol'],
  ['GPT-5.6 Terra', 'gpt-5.6-terra'],
  ['GPT-5.6 Luna', 'gpt-5.6-luna'],
  ['GPT-5.5', 'gpt-5.5'],
  ['Claude Opus 5', 'claude-opus-5'],
  ['Claude Fable 5.1', 'claude-fable-5-1'],
  ['Claude Fable 5', 'claude-fable-5'],
  ['Claude Sonnet 5', 'claude-sonnet-5'],
  ['Claude Opus 4.8', 'claude-opus-4-8'],
  ['Claude Opus 4.7', 'claude-opus-4-7'],
  ['Claude Opus 4.6', 'claude-opus-4-6'],
  ['Claude Sonnet 4.6', 'claude-sonnet-4-6'],
  ['Claude Haiku 4.5', 'claude-haiku-4-5']
]);

function decodeHtml(html) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function parseModel(text, label) {
  let from = 0;
  const candidates = [];

  while (true) {
    const index = text.indexOf(label, from);
    if (index < 0) break;
    from = index + label.length;

    const chunk = text.slice(index, index + 800);
    if (!/Cache|缓存/i.test(chunk)) continue;

    const prices = [...chunk.matchAll(/\$([0-9]+(?:\.[0-9]+)?)/g)]
      .map(match => Number(match[1]));

    if (prices.length < 6) continue;
    const p = prices.slice(0, 6);
    const [officialInput, officialCache, officialOutput, input, cachedInput, output] = p;

    if (
      officialOutput >= officialInput &&
      output >= input &&
      input <= officialInput * 1.2 &&
      cachedInput <= input * 1.2
    ) {
      candidates.push({ input, output, cached_input: cachedInput, debug: p });
    }
  }

  return candidates[0] || null;
}

function shanghaiDateTime() {
  const shifted = new Date(Date.now() + 8 * 60 * 60 * 1000);
  return shifted.toISOString().replace(/\.\d{3}Z$/, '+08:00');
}

const response = await fetch(PAGE_URL, {
  redirect: 'follow',
  headers: {
    'user-agent': 'Mozilla/5.0 (compatible; ai-model-price-bot/1.0; +https://github.com/wuuJiawei/ai-model-price)',
    'accept': 'text/html,application/xhtml+xml',
    'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8'
  }
});

if (!response.ok) {
  throw new Error(`TeamoRouter pricing fetch failed: HTTP ${response.status}`);
}

const html = await response.text();
const text = decodeHtml(html);
const provider = JSON.parse(fs.readFileSync(providerPath, 'utf8'));
const modelMap = new Map((provider.models || []).map(item => [item.model, item]));

let found = 0;
let changed = false;
const changes = [];

for (const [label, modelId] of targets) {
  const parsed = parseModel(text, label);
  if (!parsed) {
    console.warn(`! 未解析到 ${label}，保留现有价格`);
    continue;
  }

  found += 1;
  const current = modelMap.get(modelId);
  if (!current) {
    provider.models.push({ model: modelId, input: parsed.input, output: parsed.output, cached_input: parsed.cached_input });
    changed = true;
    changes.push(`${modelId}: 新增 ${parsed.input}/${parsed.output}`);
    continue;
  }

  const before = `${current.input}/${current.output}/${current.cached_input ?? '-'}`;
  const after = `${parsed.input}/${parsed.output}/${parsed.cached_input}`;
  if (before !== after) {
    current.input = parsed.input;
    current.output = parsed.output;
    current.cached_input = parsed.cached_input;
    changed = true;
    changes.push(`${modelId}: ${before} -> ${after}`);
  }
}

if (found === 0) {
  throw new Error('未从 TeamoRouter 页面解析到任何目标模型价格，停止更新，避免写入错误数据。');
}

provider.source_url = PRICE_URL;
provider.auto_sync = { enabled: true, interval: 'hourly' };

// 只要本次抓取和解析成功，就记录最后成功同步时间。
// 即使价格没有变化，页面也应该展示真实的自动校验时间。
const updatedAtTime = shanghaiDateTime();
provider.updated_at = updatedAtTime.slice(0, 10);
provider.updated_at_time = updatedAtTime;
fs.writeFileSync(providerPath, JSON.stringify(provider, null, 2) + '\n');

if (changed) {
  console.log(`✓ TeamoRouter 价格已更新：${changes.join('; ')}；同步时间 ${updatedAtTime}`);
} else {
  console.log(`✓ TeamoRouter 已成功校验 ${found} 个模型，价格无变化；同步时间 ${updatedAtTime}`);
}
