const PRICE_URL = 'https://www.aiapisplus.com/pricing';
const headers = {
  accept: 'text/html,application/javascript,application/json,text/plain,*/*',
  'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
  'cache-control': 'no-store',
  'user-agent': 'Mozilla/5.0 (compatible; ai-model-price-bot/1.0; +https://github.com/wuuJiawei/ai-model-price)',
};

const pageRes = await fetch(PRICE_URL, { redirect: 'follow', headers });
const html = await pageRes.text();
console.log(`APIPlus pricing page: HTTP ${pageRes.status}, length=${html.length}`);
if (!pageRes.ok) throw new Error(`pricing page HTTP ${pageRes.status}`);

const scripts = [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)].map(m => m[1]);
console.log(`APIPlus scripts=${JSON.stringify(scripts)}`);

for (const src of scripts.slice(0, 30)) {
  const url = new URL(src, PRICE_URL);
  if (url.origin !== new URL(PRICE_URL).origin) continue;
  const res = await fetch(url, { redirect: 'follow', headers: { ...headers, referer: PRICE_URL } });
  if (!res.ok) continue;
  const js = await res.text();
  console.log(`APIPlus bundle=${url.href}, length=${js.length}`);
  const lower = js.toLowerCase();
  for (const needle of ['tiered_pricing', 'tier_count', '/api/pricing', 'pricing/tier', 'tiered']) {
    let from = 0;
    let found = 0;
    while (found < 3) {
      const index = lower.indexOf(needle, from);
      if (index < 0) break;
      console.log(`APIPlus[${needle}]#${found + 1}=${js.slice(Math.max(0, index - 900), Math.min(js.length, index + 2200)).replace(/\s+/g, ' ')}`);
      from = index + needle.length;
      found += 1;
    }
  }
}

throw new Error('diagnostic complete');
