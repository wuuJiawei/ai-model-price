const PRICE_URL = 'https://apikey.fun/pricing';
const API_URL = 'https://apikey.fun/api/v1/pricing/groups';

const response = await fetch(API_URL, {
  redirect: 'follow',
  headers: {
    accept: 'application/json,text/plain,*/*',
    'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'cache-control': 'no-store',
    referer: PRICE_URL,
    'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36',
  },
});

const text = await response.text();
console.log(`APIKEY.FUN public groups: HTTP ${response.status}, content-type=${response.headers.get('content-type')}, length=${text.length}`);
console.log(text.slice(0, 30000));

if (!response.ok) {
  throw new Error(`APIKEY.FUN public pricing groups failed: HTTP ${response.status}`);
}

throw new Error('diagnostic complete');
