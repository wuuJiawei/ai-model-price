import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useState } from 'react';
import { AnimatedNumber } from './components/AnimatedNumber.jsx';
import { Tooltip } from './components/Tooltip.jsx';

const GITHUB = 'https://github.com/wuuJiawei/ai-model-price';

function fmt(v) {
  if (v == null || Number.isNaN(v)) return '—';
  if (v < 1) return v.toFixed(3).replace(/0+$/,'').replace(/\.$/,'');
  if (v < 10) return v.toFixed(2).replace(/0+$/,'').replace(/\.$/,'');
  return v.toFixed(2).replace(/\.00$/,'');
}

function formatUpdateTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(date).replaceAll('/', '-');
}

function autoSyncText(interval) {
  if (interval === 'hourly') return '定期自动抓取 · 每小时同步';
  if (interval === 'daily') return '定期自动抓取 · 每日同步';
  return '定期自动抓取';
}

function ExternalIcon() {
  return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7 5h-2v10h10v-2M10 5h5v5M15 5l-7 7" /></svg>;
}

function RefreshIcon() {
  return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M15.5 7A6 6 0 1 0 16 12" /><path d="M15.5 3.5V7h-3.5" /></svg>;
}

function Pill({ children, tone = 'default' }) {
  return <span className={`pill pill-${tone}`}>{children}</span>;
}

function StatCard({ label, value, provider, currency, fx }) {
  const symbol = currency === 'CNY' ? '¥' : '$';
  const display = currency === 'CNY' ? value : value / fx;
  return (
    <motion.div className="stat-card" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .28 }}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">
        <span>{symbol}</span>
        <AnimatedNumber value={display} format={fmt} />
      </div>
      <div className="stat-provider">{provider}</div>
    </motion.div>
  );
}

export default function App() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [vendor, setVendor] = useState('OpenAI');
  const [modelId, setModelId] = useState('gpt-5.6-sol');
  const [currency, setCurrency] = useState('CNY');
  const [sort, setSort] = useState('combined');

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}data/prices.json`)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(setData)
      .catch(e => setError(e.message));
  }, []);

  const models = useMemo(() => {
    if (!data) return [];
    return data.models.filter(m => !vendor || m.vendor === vendor);
  }, [data, vendor]);

  useEffect(() => {
    if (!models.length) return;
    if (!models.some(m => m.id === modelId)) {
      setModelId(models.find(m => m.id === 'gpt-5.6-sol')?.id || models[0].id);
    }
  }, [models, modelId]);

  const rows = useMemo(() => {
    if (!data || !modelId) return [];
    const list = data.rows.filter(x => x.model_id === modelId);
    return [...list].sort((a, b) => {
      if (sort === 'name') return a.provider_name.localeCompare(b.provider_name, 'zh-CN');
      if (sort === 'input') return a.input_cny - b.input_cny;
      if (sort === 'output') return a.output_cny - b.output_cny;
      return a.combined_cny - b.combined_cny;
    });
  }, [data, modelId, sort]);

  const ranked = useMemo(() => [...rows].sort((a,b) => a.combined_cny - b.combined_cny), [rows]);
  const cheapest = ranked[0]?.combined_cny ?? 0;
  const inputMin = rows.length ? Math.min(...rows.map(x => x.input_cny)) : 0;
  const outputMin = rows.length ? Math.min(...rows.map(x => x.output_cny)) : 0;
  const bestInput = rows.find(x => x.input_cny === inputMin);
  const bestOutput = rows.find(x => x.output_cny === outputMin);
  const pending = data?.providers.filter(p => p.status === 'pending') || [];
  const fx = data?.fx.usd_cny || 1;
  const latestTime = formatUpdateTime(data?.data_updated_at_time);

  const money = cny => {
    if (cny == null) return '—';
    const value = currency === 'CNY' ? cny : cny / fx;
    return `${currency === 'CNY' ? '¥' : '$'}${fmt(value)}`;
  };

  if (error) return <div className="state-screen">数据加载失败：{error}</div>;
  if (!data) return <div className="state-screen"><span className="loader-dot" /> 正在加载价格数据</div>;

  return (
    <div className="page-shell">
      <header className="nav">
        <a className="brand" href="./">AI MODEL PRICE</a>
        <div className="nav-meta">
          <Tooltip content={latestTime ? `最近一次价格更新时间：${latestTime}` : `更新时间：${data.data_updated_at || '—'}`} side="bottom">
            <span className="pill">更新时间 {data.data_updated_at || '—'}</span>
          </Tooltip>
          <Pill>USD/CNY {fx}</Pill>
          <a className="ghost-link" href={GITHUB} target="_blank" rel="noreferrer">GitHub <ExternalIcon /></a>
        </div>
      </header>

      <main className="container">
        <section className="hero">
          <h1>中转站价格对比</h1>
        </section>

        <section className="panel filters">
          <div className="field field-wide">
            <label>厂商</label>
            <div className="segmented">
              {[{id:'',name:'全部'}, ...(data.vendors || [])].map(v => (
                <button key={v.id || 'all'} className={vendor === v.id ? 'active' : ''} onClick={() => setVendor(v.id)}>
                  {vendor === v.id && <motion.span className="segment-bg" layoutId="vendor-tab" transition={{ type:'spring', stiffness:420, damping:34 }} />}
                  <span>{v.name}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <label htmlFor="model">模型</label>
            <select id="model" value={modelId} onChange={e => setModelId(e.target.value)} disabled={!models.length}>
              {models.length ? models.map(m => <option key={m.id} value={m.id}>{m.name}</option>) : <option>暂无模型</option>}
            </select>
          </div>
          <div className="field">
            <label>币种</label>
            <div className="mini-segment">
              {['CNY','USD'].map(c => <button key={c} className={currency === c ? 'active' : ''} onClick={() => setCurrency(c)}>{c}</button>)}
            </div>
          </div>
          <div className="field">
            <label htmlFor="sort">排序</label>
            <select id="sort" value={sort} onChange={e => setSort(e.target.value)}>
              <option value="combined">综合成本</option>
              <option value="input">输入价格</option>
              <option value="output">输出价格</option>
              <option value="name">平台名称</option>
            </select>
          </div>
        </section>

        {rows.length > 0 ? (
          <>
            <section className="stats-grid">
              <StatCard label="最低综合成本" value={ranked[0].combined_cny} provider={ranked[0].provider_name} currency={currency} fx={fx} />
              <StatCard label="最低输入价格" value={bestInput.input_cny} provider={bestInput.provider_name} currency={currency} fx={fx} />
              <StatCard label="最低输出价格" value={bestOutput.output_cny} provider={bestOutput.provider_name} currency={currency} fx={fx} />
            </section>

            <section className="panel table-panel">
              <div className="table-headline">
                <div>
                  <span className="eyebrow">PRICE TABLE</span>
                  <h2>{data.models.find(m => m.id === modelId)?.name}</h2>
                </div>
                <Pill>{rows.length} 个报价</Pill>
              </div>
              <div className="table-scroll">
                <table>
                  <thead><tr><th>#</th><th>中转站</th><th>输入 /1M</th><th>输出 /1M</th><th>综合</th><th>缓存读取</th><th>相对最低</th><th>更新时间</th></tr></thead>
                  <tbody>
                    <AnimatePresence initial={false}>
                      {rows.map(r => {
                        const rank = ranked.findIndex(x => x.provider_id === r.provider_id) + 1;
                        const ratio = cheapest ? r.combined_cny / cheapest : 1;
                        const fullUpdateTime = formatUpdateTime(r.updated_at_time);
                        return (
                          <motion.tr key={`${modelId}-${r.provider_id}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                            <td><span className="rank">{String(rank).padStart(2,'0')}</span></td>
                            <td>
                              <div className="provider-cell">
                                <div><strong>{r.provider_name}</strong><small>{r.native_currency}</small></div>
                                {r.website && (
                                  <Tooltip content={`访问 ${r.provider_name}`}>
                                    <a className="visit" href={r.website} target="_blank" rel="noreferrer" aria-label={`访问 ${r.provider_name}`}><ExternalIcon /></a>
                                  </Tooltip>
                                )}
                              </div>
                            </td>
                            <td className={r.input_cny === inputMin ? 'best' : ''}>{money(r.input_cny)}<small>原价 {r.native_currency === 'CNY' ? '¥' : '$'}{fmt(r.input_native)}</small></td>
                            <td className={r.output_cny === outputMin ? 'best' : ''}>{money(r.output_cny)}<small>原价 {r.native_currency === 'CNY' ? '¥' : '$'}{fmt(r.output_native)}</small></td>
                            <td className={r.combined_cny === cheapest ? 'best' : ''}>{money(r.combined_cny)}</td>
                            <td>{r.cached_input_cny == null ? '—' : money(r.cached_input_cny)}</td>
                            <td>{ratio === 1 ? <Pill tone="success">最低价</Pill> : `${ratio.toFixed(2)}×`}</td>
                            <td>
                              <div className="update-cell">
                                {r.auto_sync && (
                                  <Tooltip content={autoSyncText(r.auto_sync_interval)}>
                                    <span className="auto-sync-mark" aria-label={autoSyncText(r.auto_sync_interval)}>
                                      <RefreshIcon />
                                    </span>
                                  </Tooltip>
                                )}
                                <Tooltip content={fullUpdateTime ? `更新时间：${fullUpdateTime}` : `更新时间：${r.updated_at || '—'}`}>
                                  <span className="update-date">{r.updated_at || '—'}</span>
                                </Tooltip>
                              </div>
                            </td>
                          </motion.tr>
                        );
                      })}
                    </AnimatePresence>
                  </tbody>
                </table>
              </div>
            </section>
          </>
        ) : <section className="panel empty-panel">这个厂商暂时还没有已录入的价格。</section>}

        <section className="pending-section">
          <div className="section-title">
            <div><span className="eyebrow">QUEUE</span><h2>待录入价格</h2></div>
            <Pill>{pending.length} 家</Pill>
          </div>
          <div className="pending-grid">
            {pending.map((p, i) => (
              <motion.a key={p.id} className="pending-card" href={p.website || '#'} target={p.website ? '_blank' : undefined} rel="noreferrer" initial={{ opacity:0, y:6 }} whileInView={{ opacity:1, y:0 }} viewport={{ once:true }} transition={{ delay: Math.min(i, 8) * .025 }}>
                <div><strong>{p.name}</strong><span>{p.updated_at}</span></div>
                <Pill>价格登记中</Pill>
                <ExternalIcon />
              </motion.a>
            ))}
          </div>
        </section>

        <footer><span>DATA-DRIVEN · OPEN SOURCE · BEUI MOTION</span><span>Generated {new Date(data.generated_at).toLocaleString()}</span></footer>
      </main>
    </div>
  );
}
