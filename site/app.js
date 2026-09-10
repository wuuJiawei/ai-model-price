const data = await fetch('./data/prices.json').then(r => {
  if (!r.ok) throw new Error(`load data failed: ${r.status}`);
  return r.json();
});

const $ = s => document.querySelector(s);
const modelSelect = $('#modelSelect');
const currencySelect = $('#currencySelect');
const sortSelect = $('#sortSelect');
const body = $('#priceBody');
const stats = $('#stats');
const fx = data.fx.usd_cny;

$('#fxText').textContent = `USD/CNY ${fx} · ${data.fx.updated_at}`;
$('#generatedAt').textContent = `GENERATED ${new Date(data.generated_at).toLocaleString()}`;

for (const m of data.models) {
  const opt = document.createElement('option');
  opt.value = m.id;
  opt.textContent = m.name;
  if (m.id === 'gpt-5.6-sol') opt.selected = true;
  modelSelect.appendChild(opt);
}

function num(v) {
  if (v == null) return '—';
  if (v < 1) return v.toFixed(3).replace(/0+$/,'').replace(/\.$/,'');
  if (v < 10) return v.toFixed(2).replace(/0+$/,'').replace(/\.$/,'');
  return v.toFixed(2);
}
function money(cny) {
  if (cny == null) return '—';
  const isCny = currencySelect.value === 'CNY';
  const value = isCny ? cny : cny / fx;
  return `${isCny ? '¥' : '$'}${num(value)}`;
}
function native(row, key) {
  const v = row[`${key}_native`];
  const symbol = row.native_currency === 'CNY' ? '¥' : '$';
  return `${symbol}${num(v)} ${row.native_currency}`;
}

function render() {
  const modelId = modelSelect.value;
  let rows = data.rows.filter(x => x.model_id === modelId);
  const cheapest = Math.min(...rows.map(x => x.combined_cny));
  const inputMin = Math.min(...rows.map(x => x.input_cny));
  const outputMin = Math.min(...rows.map(x => x.output_cny));

  const sort = sortSelect.value;
  rows.sort((a,b) => {
    if (sort === 'name') return a.provider_name.localeCompare(b.provider_name);
    if (sort === 'input') return a.input_cny - b.input_cny;
    if (sort === 'output') return a.output_cny - b.output_cny;
    return a.combined_cny - b.combined_cny;
  });

  const bestCombined = [...rows].sort((a,b)=>a.combined_cny-b.combined_cny)[0];
  const bestInput = [...rows].sort((a,b)=>a.input_cny-b.input_cny)[0];
  const bestOutput = [...rows].sort((a,b)=>a.output_cny-b.output_cny)[0];
  stats.innerHTML = `
    <div class="stat"><small>最低综合成本</small><strong>${money(bestCombined.combined_cny)}</strong><em>${bestCombined.provider_name}</em></div>
    <div class="stat"><small>最低输入价格</small><strong>${money(bestInput.input_cny)}</strong><em>${bestInput.provider_name}</em></div>
    <div class="stat"><small>最低输出价格</small><strong>${money(bestOutput.output_cny)}</strong><em>${bestOutput.provider_name}</em></div>`;

  body.innerHTML = rows.map((r, i) => {
    const ratio = r.combined_cny / cheapest;
    const delta = ratio === 1 ? '最低价' : `${ratio.toFixed(2)}×`;
    const rank = [...rows].sort((a,b)=>a.combined_cny-b.combined_cny).findIndex(x=>x.provider_id===r.provider_id)+1;
    return `<tr>
      <td class="rank">${String(rank).padStart(2,'0')}</td>
      <td><span class="provider">${r.provider_name}</span><span class="native">${r.native_currency}</span></td>
      <td class="${r.input_cny===inputMin?'best':''}">${money(r.input_cny)}<span class="native">原价 ${native(r,'input')}</span></td>
      <td class="${r.output_cny===outputMin?'best':''}">${money(r.output_cny)}<span class="native">原价 ${native(r,'output')}</span></td>
      <td class="${r.combined_cny===cheapest?'best':''}">${money(r.combined_cny)}</td>
      <td>${r.cached_input_cny == null ? '—' : money(r.cached_input_cny)}</td>
      <td>${delta}</td>
      <td>${r.updated_at}</td>
    </tr>`;
  }).join('');
}

[modelSelect,currencySelect,sortSelect].forEach(el => el.addEventListener('change', render));
render();
