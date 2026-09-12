import fs from 'node:fs';
import path from 'node:path';

const PAGE_URL = 'https://www.zetaapi.ai/en/pricing/';
const root = process.cwd();
const providerPath = path.join(root, 'data/providers/zeta.json');

const targets = new Map([
  ['gpt-6-astra', ['gpt-6-astra', 'GPT-6 Astra']],
  ['gpt-5.6-sol', ['gpt-5.6-sol', 'GPT-5.6 Sol']],
  ['gpt-5.6-terra', ['gpt-5.6-terra', 'GPT-5.6 Terra']],
  ['gpt-5.6-luna', ['gpt-5.6-luna', 'GPT-5.6 Luna']],
  ['gpt-5.5', ['GPT-5.5', 'gpt-5.5']],
  ['gpt-5.4-nano', ['GPT-5.4 Nano', 'gpt-5.4-nano']],
  ['claude-opus-5', ['claude-opus-5', 'Claude Opus 5']],
  ['claude-fable-5-1', ['claude-fable-5-1', 'Claude Fable 5.1']],
  ['claude-fable-5', ['claude-fable-5', 'Claude Fable 5']],
  ['claude-sonnet-5', ['claude-sonnet-5', 'Claude Sonnet 5']],
  ['claude-opus-4-8', ['Claude Opus 4.8', 'claude-opus-4-8']],
  ['claude-opus-4-7', ['Claude Opus 4.7', 'claude-opus-4-7']],
  ['claude-opus-4-6', ['Claude Opus 4.6', 'claude-opus-4-6']],
  ['claude-sonnet-4-6', ['Claude Sonnet 4.6', 'claude-sonnet-4-6']],
  ['claude-haiku-4-5', ['Claude Haiku 4.5', 'claude-haiku-4-5']],
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

function shanghaiDateTime() {
  const shifted = new Date(Date.now() + 8 * 60 * 60 * 1000);
  return shifted.toISOString().replace(/\.\d{3}Z$/, '+08:00');
}

function sameNumber(a, b) {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return Math.abs(Number(a) - Number(b)) < 1e-9;
}

function parseModel(text, labels) {
  const lower = text.toLowerCase();

  for (const label of labels) {
    let from = 0;
    const needle = label.toLowerCase();

    while (true) {
      const index = lower.indexOf(needle, from);
      if (index < 0) break;
      from = index + needle.length;

      // Zeta 定价表每行依次为：Input / Output / Cache read / Cache write / Savings / List price。
      // 当前我们只采集前三个 token 单价；后面的 cache write 与官方价不参与排名。
      const chunk = text.slice(index + label.length, index + label.length + 360);
      const prices = [...chunk.matchAll(/\$\s*([0-9]+(?:\.[0-9]+)?)/g)]
        .map(match => Number(match[1]));

      if (prices.length < 3) continue;
      const [input, output, cachedInput] = prices;

      if (
        Number.isFinite(input) &&
        Number.isFinite(output) &&
        Number.isFinite(cachedInput) &&
        input > 0 &&
        output >= input &&
        cachedInput <= input
      ) {
        return { input, output, cached_input: cachedInput };
      }
    }
  }

  return null;
}

const response = await fetch(PAGE_URL, {
  redirect: 'follow',
  headers: {
    'user-agent': 'Mozilla/5.0 (compatible; ai-model-price-bot/1.0; +https://github.com/wuuJiawei/ai-model-price)',
    accept: 'text/html,application/xhtml+xml',
    'accept-language': 'en-US,en;q=0.9,zh-CN;q=0.8',
    'cache-control': 'no-store',
  },
});

if (!response.ok) {
  throw new Error(`ZetaAPI pricing fetch failed: HTTP ${response.status}`);
}

const html = await response.text();
const text = decodeHtml(html);
if (!/Model pricing/i.test(text) || !/Cache read/i.test(text)) {
  throw new Error('ZetaAPI 定价页结构异常，停止更新。');
}

const provider = JSON.parse(fs.readFileSync(providerPath, 'utf8'));
provider.models ||= [];
const modelMap = new Map(provider.models.map(item => [item.model, item]));

let found = 0;
let changed = false;
const changes = [];

for (const [modelId, labels] of targets) {
  const parsed = parseModel(text, labels);
  if (!parsed) {
    console.warn(`! 未解析到 ${modelId}，保留现有价格`);
    continue;
  }

  found += 1;
  const current = modelMap.get(modelId);
  const note = '自动采集 · 官网定价页';

  if (!current) {
    const next = {
      model: modelId,
      input: parsed.input,
      output: parsed.output,
      cached_input: parsed.cached_input,
      note,
    };
    provider.models.push(next);
    modelMap.set(modelId, next);
    changed = true;
    changes.push(`${modelId}: 新增 ${parsed.input}/${parsed.output}/${parsed.cached_input}`);
    continue;
  }

  const priceChanged =
    !sameNumber(current.input, parsed.input) ||
    !sameNumber(current.output, parsed.output) ||
    !sameNumber(current.cached_input, parsed.cached_input);
  const noteChanged = current.note !== note;

  if (priceChanged || noteChanged) {
    const before = `${current.input}/${current.output}/${current.cached_input ?? '-'}`;
    current.input = parsed.input;
    current.output = parsed.output;
    current.cached_input = parsed.cached_input;
    current.note = note;
    changed = true;
    changes.push(`${modelId}: ${before} -> ${parsed.input}/${parsed.output}/${parsed.cached_input}`);
  }
}

if (found === 0) {
  throw new Error('未从 ZetaAPI 定价页解析到任何目标模型，停止更新，避免覆盖错误数据。');
}

provider.currency = 'USD';
provider.source_url = PAGE_URL;
provider.auto_sync = { enabled: true, interval: 'hourly' };

const updatedAtTime = shanghaiDateTime();
provider.updated_at = updatedAtTime.slice(0, 10);
provider.updated_at_time = updatedAtTime;

fs.writeFileSync(providerPath, JSON.stringify(provider, null, 2) + '\n');

if (changed) {
  console.log(`✓ ZetaAPI 价格已更新：${changes.join('; ')}；同步时间 ${updatedAtTime}`);
} else {
  console.log(`✓ ZetaAPI 已成功校验 ${found} 个模型，价格无变化；同步时间 ${updatedAtTime}`);
}
