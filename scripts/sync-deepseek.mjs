import fs from 'node:fs';
import path from 'node:path';

const PRICE_URL = 'https://api-docs.deepseek.com/zh-cn/quick_start/pricing/';
const root = process.cwd();
const providerPath = path.join(root, 'data/providers/deepseek.json');

function shanghaiDateTime() {
  const shifted = new Date(Date.now() + 8 * 60 * 60 * 1000);
  return shifted.toISOString().replace(/\.\d{3}Z$/, '+08:00');
}

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

function parsePair(text, patterns, label) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const a = Number(match[1]);
    const b = Number(match[2]);
    if (Number.isFinite(a) && Number.isFinite(b) && a >= 0 && b >= 0) return [a, b];
  }
  throw new Error(`DeepSeek 定价页未解析到 ${label}，停止更新。`);
}

const response = await fetch(PRICE_URL, {
  redirect: 'follow',
  headers: {
    'user-agent': 'Mozilla/5.0 (compatible; ai-model-price-bot/1.0; +https://github.com/wuuJiawei/ai-model-price)',
    accept: 'text/html,application/xhtml+xml',
    'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'cache-control': 'no-store',
  },
});

if (!response.ok) {
  throw new Error(`DeepSeek pricing fetch failed: HTTP ${response.status}`);
}

const html = await response.text();
const text = decodeHtml(html);

if (!/deepseek-v4-flash/i.test(text) || !/deepseek-v4-pro/i.test(text)) {
  throw new Error('DeepSeek 定价页未找到当前 V4 Flash / V4 Pro 模型，停止更新。');
}

const cached = parsePair(text, [
  /输入[（(]缓存命中[）)]\s*([0-9]+(?:\.[0-9]+)?)\s*元\s*([0-9]+(?:\.[0-9]+)?)\s*元/i,
  /缓存命中[^0-9]*([0-9]+(?:\.[0-9]+)?)\s*元[^0-9]*([0-9]+(?:\.[0-9]+)?)\s*元/i,
], '缓存命中输入价');

const input = parsePair(text, [
  /输入[（(]缓存未命中[）)]\s*([0-9]+(?:\.[0-9]+)?)\s*元\s*([0-9]+(?:\.[0-9]+)?)\s*元/i,
  /缓存未命中[^0-9]*([0-9]+(?:\.[0-9]+)?)\s*元[^0-9]*([0-9]+(?:\.[0-9]+)?)\s*元/i,
], '缓存未命中输入价');

const output = parsePair(text, [
  /百万\s*tokens?\s*输出\s*([0-9]+(?:\.[0-9]+)?)\s*元\s*([0-9]+(?:\.[0-9]+)?)\s*元/i,
  /tokens?\s*输出[^0-9]*([0-9]+(?:\.[0-9]+)?)\s*元[^0-9]*([0-9]+(?:\.[0-9]+)?)\s*元/i,
], '输出价');

const provider = JSON.parse(fs.readFileSync(providerPath, 'utf8'));
provider.currency = 'CNY';
provider.source_url = PRICE_URL;
provider.models = [
  {
    model: 'deepseek-v4-flash',
    input: input[0],
    output: output[0],
    cached_input: cached[0],
    note: '自动采集 · DeepSeek 官方',
  },
  {
    model: 'deepseek-v4-pro',
    input: input[1],
    output: output[1],
    cached_input: cached[1],
    note: '自动采集 · DeepSeek 官方',
  },
];
provider.auto_sync = { enabled: true, interval: 'hourly' };
delete provider.status;
delete provider.note;

const updatedAtTime = shanghaiDateTime();
provider.updated_at = updatedAtTime.slice(0, 10);
provider.updated_at_time = updatedAtTime;

fs.writeFileSync(providerPath, JSON.stringify(provider, null, 2) + '\n');
console.log(`✓ DeepSeek 官方已同步：V4 Flash ${input[0]}/${output[0]}/${cached[0]}；V4 Pro ${input[1]}/${output[1]}/${cached[1]}；同步时间 ${updatedAtTime}`);
