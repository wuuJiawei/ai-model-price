const PRICE_URL = 'https://apinebula.ai/zh/fee';
const API_URL = 'https://apinebula.ai/api/pricing';

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

const text = await response.text();
console.log(`APINebula pricing API: HTTP ${response.status}, content-type=${response.headers.get('content-type')}, length=${text.length}`);
console.log(text.slice(0, 40000));

if (!response.ok) {
  throw new Error(`APINebula pricing API failed: HTTP ${response.status}`);
}

throw new Error('diagnostic complete');
