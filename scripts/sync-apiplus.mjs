import fs from 'node:fs';
import path from 'node:path';

const PRICE_URL = 'https://www.aiapisplus.com/pricing';
const API_URLS = [
  'https://www.aiapisplus.com/api/pricing',
  'https://www.aiapisplus.com/api/ratio_config',
];
const root = process.cwd();
const modelsPath = path.join(root, 'data/models.json');
const canonicalModels = JSON.parse(fs.readFileSync(modelsPath, 'utf8'));
const targetNames = new Set(canonicalModels.flatMap(model => [model.id, ...(model.aliases || [])]).map(v => String(v).toLowerCase()));

const headers = {
  accept: 'application/json,text/plain,*/*',
  'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
  'cache-control': 'no-store',
  referer: PRICE_URL,
  'user-agent': 'Mozilla/5.0 (compatible; ai-model-price-bot/1.0; +https://github.com/wuuJiawei/ai-model-price)',
};

for (const url of API_URLS) {
  try {
    const response = await fetch(url, { redirect: 'follow', headers });
    const text = await response.text();
    console.log(`APIPlus ${url}: HTTP ${response.status}, content-type=${response.headers.get('content-type')}, length=${text.length}`);
    if (!response.ok) continue;

    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      console.log(text.slice(0, 3000));
      continue;
    }

    const data = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
    const matched = data.filter(row => targetNames.has(String(row?.model_name || row?.model || row?.name || '').toLowerCase()));
    console.log(`APIPlus matched=${matched.length}`);
    console.log(JSON.stringify({
      group_ratio: payload?.group_ratio || payload?.data?.group_ratio || null,
      auto_groups: payload?.auto_groups || null,
      usable_group: payload?.usable_group || null,
      usd_cny_rate: payload?.usd_cny_rate || null,
      matched,
    }).slice(0, 30000));
  } catch (error) {
    console.warn(`APIPlus ${url} failed: ${String(error?.message || error)}`);
  }
}

throw new Error('diagnostic complete');
