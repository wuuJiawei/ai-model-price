import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const models = JSON.parse(fs.readFileSync(path.join(root, 'data/models.json'), 'utf8'));
const modelIds = new Set(models.map(x => x.id));
const dir = path.join(root, 'data/providers');
const files = fs.readdirSync(dir).filter(x => x.endsWith('.json')).sort();
const errors = [];
const providerIds = new Set();

function err(file, msg) { errors.push(`${file}: ${msg}`); }
function isDate(v) { return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v); }
function isPrice(v) { return typeof v === 'number' && Number.isFinite(v) && v >= 0; }
function isUrl(v) {
  if (v == null) return true;
  if (typeof v !== 'string') return false;
  try {
    const u = new URL(v);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

for (const file of files) {
  let data;
  try { data = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')); }
  catch (e) { err(file, `JSON 解析失败: ${e.message}`); continue; }

  const status = data.status || 'priced';
  if (!['priced', 'pending'].includes(status)) err(file, 'status 仅支持 priced / pending');
  if (!data.id || !/^[a-z0-9][a-z0-9-]*$/.test(data.id)) err(file, 'id 格式非法');
  if (providerIds.has(data.id)) err(file, `provider id 重复: ${data.id}`);
  providerIds.add(data.id);
  if (!data.name || typeof data.name !== 'string') err(file, 'name 必填');
  if (!isDate(data.updated_at)) err(file, 'updated_at 必须为 YYYY-MM-DD');
  if (!isUrl(data.website)) err(file, 'website 必须是 http/https URL');
  if (!isUrl(data.source_url)) err(file, 'source_url 必须是 http/https URL');
  if (!Array.isArray(data.models)) err(file, 'models 必须是数组');

  if (status === 'pending') {
    if (data.website == null) err(file, 'pending 平台必须提供 website');
    if (data.currency != null && !['CNY','USD'].includes(data.currency)) err(file, 'pending.currency 仅支持 CNY / USD / null');
  } else {
    if (!['CNY','USD'].includes(data.currency)) err(file, 'currency 仅支持 CNY / USD');
    if (!Array.isArray(data.models) || data.models.length === 0) err(file, 'priced 平台 models 不能为空');
  }

  const seen = new Set();
  for (const item of data.models || []) {
    if (!modelIds.has(item.model)) err(file, `未知模型: ${item.model}`);
    if (seen.has(item.model)) err(file, `模型重复: ${item.model}`);
    seen.add(item.model);
    if (!isPrice(item.input)) err(file, `${item.model}.input 必须是 >= 0 的数字`);
    if (!isPrice(item.output)) err(file, `${item.model}.output 必须是 >= 0 的数字`);
    if (item.cached_input != null && !isPrice(item.cached_input)) err(file, `${item.model}.cached_input 非法`);
  }
}

if (errors.length) {
  console.error('\n数据校验失败：');
  for (const e of errors) console.error(`- ${e}`);
  process.exit(1);
}
console.log(`✓ ${files.length} 个平台数据校验通过，${models.length} 个 canonical models。`);
