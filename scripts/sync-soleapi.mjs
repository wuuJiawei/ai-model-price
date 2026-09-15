import fs from 'node:fs';
import path from 'node:path';

const PAGE_URL = 'https://soleapi.com/zh/models';
const root = process.cwd();
const providerPath = path.join(root, 'data/providers/soleapi.json');
const modelsPath = path.join(root, 'data/models.json');

const extraAliases = {
  'claude-haiku-4-5': ['claude-haiku-4-5-20251001'],
};

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

function parsePriceNear(text, aliases) {
  const lower = text.toLocaleLowerCase('zh-CN');

  for (const alias of aliases) {
    const needle = String(alias).toLocaleLowerCase('zh-CN');
    let from = 0;

    while (true) {
      const index = lower.indexOf(needle, from);
      if (index < 0) break;
      from = index + needle.length;

      const chunk = text.slice(index, index + 900);
      const inputMatch = chunk.match(/(?:输入|Input(?:\s*\(prompt\))?)\s*([0-9]+(?:\.[0-9]+)?)\s*Credits\s*\/\s*M/i);
      const outputMatch = chunk.match(/(?:输出|Output(?:\s*\(completion\))?)\s*([0-9]+(?:\.[0-9]+)?)\s*Credits\s*\/\s*M/i);
      if (!inputMatch || !outputMatch) continue;

      const cacheMatch = chunk.match(/(?:缓存读取|Cache read)\s*([0-9]+(?:\.[0-9]+)?)\s*Credits\s*\/\s*M/i);
      const input = Number(inputMatch[1]);
      const output = Number(outputMatch[1]);
      const cachedInput = cacheMatch ? Number(cacheMatch[1]) : null;

      if (!Number.isFinite(input) || !Number.isFinite(output) || input < 0 || output < 0) continue;
      if (cachedInput != null && (!Number.isFinite(cachedInput) || cachedInput < 0)) continue;

      return {
        input,
        output,
        cached_input: cachedInput,
      };
    }
  }

  return null;
}

const response = await fetch(PAGE_URL, {
  redirect: 'follow',
  headers: {
    accept: 'text/html,application/xhtml+xml',
    'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'cache-control': 'no-store',
    'user-agent': 'Mozilla/5.0 (compatible; ai-model-price-bot/1.0; +https://github.com/wuuJiawei/ai-model-price)',
  },
});

if (!response.ok) {
  throw new Error(`SoleAPI pricing fetch failed: HTTP ${response.status}`);
}

const html = await response.text();
const text = decodeHtml(html);
if (!/Credits\s*\/\s*M/i.test(text) || !/(浏览全部模型|Browse all models)/i.test(text)) {
  throw new Error('SoleAPI 模型页结构异常，停止更新。');
}

const canonicalModels = JSON.parse(fs.readFileSync(modelsPath, 'utf8'));
const nextModels = [];
const changes = [];

for (const model of canonicalModels) {
  const aliases = [model.id, ...(model.aliases || []), ...(extraAliases[model.id] || [])];
  const parsed = parsePriceNear(text, aliases);
  if (!parsed) {
    console.warn(`! SoleAPI 未找到 ${model.id}，跳过`);
    continue;
  }

  const item = {
    model: model.id,
    input: parsed.input,
    output: parsed.output,
    ...(parsed.cached_input == null ? {} : { cached_input: parsed.cached_input }),
    note: '自动采集 · SoleAPI 模型页',
  };
  nextModels.push(item);
  changes.push(`${model.id}: ${parsed.input}/${parsed.output}/${parsed.cached_input ?? '-'}`);
}

// SoleAPI 当前应至少覆盖 OpenAI、Claude、DeepSeek 三类主流模型。
// 匹配数量明显下降时拒绝覆盖上一份有效快照，避免页面结构变化导致误写。
if (nextModels.length < 8) {
  throw new Error(`SoleAPI 仅匹配到 ${nextModels.length} 个目标模型，疑似页面结构变化，停止更新。`);
}

const provider = JSON.parse(fs.readFileSync(providerPath, 'utf8'));
provider.currency = 'CNY';
provider.source_url = PAGE_URL;
provider.models = nextModels;
provider.auto_sync = { enabled: true, interval: 'hourly' };
delete provider.status;
delete provider.note;

const updatedAtTime = shanghaiDateTime();
provider.updated_at = updatedAtTime.slice(0, 10);
provider.updated_at_time = updatedAtTime;

fs.writeFileSync(providerPath, JSON.stringify(provider, null, 2) + '\n');
console.log(`✓ SoleAPI 已同步 ${nextModels.length} 个模型：${changes.join('; ')}；同步时间 ${updatedAtTime}`);
