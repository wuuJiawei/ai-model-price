import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const config = JSON.parse(fs.readFileSync(path.join(root, 'data/config.json'), 'utf8'));
const models = JSON.parse(fs.readFileSync(path.join(root, 'data/models.json'), 'utf8'));
const modelMap = new Map(models.map(x => [x.id, x]));
const providerDir = path.join(root, 'data/providers');
const providers = fs.readdirSync(providerDir)
  .filter(x => x.endsWith('.json'))
  .sort()
  .map(file => JSON.parse(fs.readFileSync(path.join(providerDir, file), 'utf8')));

const rows = [];
for (const p of providers) {
  const rate = p.currency === 'USD' ? config.usd_cny : 1;
  for (const price of p.models || []) {
    const model = modelMap.get(price.model);
    if (!model) continue;
    const inputCny = price.input * rate;
    const outputCny = price.output * rate;
    const cachedCny = price.cached_input == null ? null : price.cached_input * rate;
    rows.push({
      provider_id: p.id,
      provider_name: p.name,
      website: p.website || null,
      source_url: p.source_url || null,
      updated_at: p.updated_at,
      native_currency: p.currency,
      model_id: price.model,
      model_name: model.name,
      model_vendor: model.vendor,
      input_native: price.input,
      output_native: price.output,
      cached_input_native: price.cached_input ?? null,
      input_cny: +inputCny.toFixed(6),
      output_cny: +outputCny.toFixed(6),
      cached_input_cny: cachedCny == null ? null : +cachedCny.toFixed(6),
      combined_cny: +(inputCny + outputCny).toFixed(6),
      note: price.note || null
    });
  }
}

for (const model of models) {
  const group = rows.filter(x => x.model_id === model.id).sort((a,b) => a.combined_cny - b.combined_cny);
  group.forEach((row, index) => row.rank = index + 1);
}

const providerMeta = providers.map(({models, ...p}) => ({
  status: p.status || 'priced',
  ...p
}));
const dates = providerMeta.map(p => p.updated_at).filter(Boolean).sort();
const dataUpdatedAt = dates.at(-1) || null;

const out = {
  generated_at: new Date().toISOString(),
  data_updated_at: dataUpdatedAt,
  unit: '1M tokens',
  fx: { usd_cny: config.usd_cny, updated_at: config.fx_updated_at },
  vendors: config.vendors || [],
  models,
  providers: providerMeta,
  rows
};

const outDir = path.join(root, '.generated/data');
fs.rmSync(path.join(root, '.generated'), { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'prices.json'), JSON.stringify(out, null, 2) + '\n');
console.log(`✓ 已生成 .generated/data/prices.json，共 ${rows.length} 条价格，${providerMeta.length} 个平台。`);
