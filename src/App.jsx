import { ExternalLink, Github, RefreshCw } from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useMemo, useState } from 'react';
import { AnimatedNumber } from './components/AnimatedNumber.jsx';
import { Tooltip } from './components/Tooltip.jsx';
import { ButtonLink } from './components/beui/Button.jsx';
import { DataTable } from './components/beui/DataTable.jsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './components/beui/Select.jsx';
import { Tabs, TabsList, TabsTrigger } from './components/beui/Tabs.jsx';

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
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  }).format(date).replaceAll('/', '-');
}

function autoSyncText(interval) {
  if (interval === 'hourly') return '定期自动抓取 · 每小时同步';
  if (interval === 'daily') return '定期自动抓取 · 每日同步';
  return '定期自动抓取';
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
      <div className="stat-value"><span>{symbol}</span><AnimatedNumber value={display} format={fmt} /></div>
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
      .then(setData).catch(e => setError(e.message));
  }, []);

  const models = useMemo(() => data ? data.models.filter(m => !vendor || m.vendor === vendor) : [], [data, vendor]);
  useEffect(() => {
    if (models.length && !models.some(m => m.id === modelId)) setModelId(models.find(m => m.id === 'gpt-5.6-sol')?.id || models[0].id);
  }, [models, modelId]);

  const rows = useMemo(() => {
    if (!data || !modelId) return [];
    const list = data.rows.filter(x => x.model_id === modelId);
    return [...list].sort((a,b) => sort === 'name'
      ? a.provider_name.localeCompare(b.provider_name, 'zh-CN')
      : sort === 'input' ? a.input_cny - b.input_cny
      : sort === 'output' ? a.output_cny - b.output_cny
      : a.combined_cny - b.combined_cny);
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

  const tableColumns = [
    { key:'rank', header:'#', width:'56px', cell:r => <span className="rank">{String(ranked.findIndex(x => x.provider_id === r.provider_id) + 1).padStart(2,'0')}</span> },
    { key:'provider', header:'中转站', width:'190px', cell:r => <div className="provider-cell"><div><strong>{r.provider_name}</strong><small>{r.native_currency}</small></div>{r.website && <Tooltip content={`访问 ${r.provider_name}`}><ButtonLink className="visit" variant="outline" size="icon" href={r.website} target="_blank" rel="noreferrer" aria-label={`访问 ${r.provider_name}`}><ExternalLink size={14}/></ButtonLink></Tooltip>}</div> },
    { key:'input', header:'输入 /1M', cell:r => <div className={r.input_cny === inputMin ? 'best' : ''}>{money(r.input_cny)}<small>原价 {r.native_currency === 'CNY' ? '¥' : '$'}{fmt(r.input_native)}</small></div> },
    { key:'output', header:'输出 /1M', cell:r => <div className={r.output_cny === outputMin ? 'best' : ''}>{money(r.output_cny)}<small>原价 {r.native_currency === 'CNY' ? '¥' : '$'}{fmt(r.output_native)}</small></div> },
    { key:'combined', header:'综合', cell:r => <span className={r.combined_cny === cheapest ? 'best' : ''}>{money(r.combined_cny)}</span> },
    { key:'cache', header:'缓存读取', cell:r => r.cached_input_cny == null ? '—' : money(r.cached_input_cny) },
    { key:'ratio', header:'相对最低', cell:r => { const ratio = cheapest ? r.combined_cny / cheapest : 1; return ratio === 1 ? <Pill tone="success">最低价</Pill> : `${ratio.toFixed(2)}×`; } },
    { key:'updated', header:'更新时间', width:'150px', cell:r => {
      const full = formatUpdateTime(r.updated_at_time);
      return <div className="update-cell">{r.auto_sync && <Tooltip content={autoSyncText(r.auto_sync_interval)}><span className="auto-sync-mark"><RefreshCw size={13}/></span></Tooltip>}<Tooltip content={full ? `更新时间：${full}` : `更新时间：${r.updated_at}`}><span className="update-date">{r.updated_at}</span></Tooltip></div>;
    }}
  ];

  return (
    <div className="page-shell">
      <header className="nav">
        <a className="brand" href="./">AI MODEL PRICE</a>
        <div className="nav-meta">
          <Tooltip content={latestTime ? `最近一次价格更新时间：${latestTime}` : `更新时间：${data.data_updated_at || '—'}`}><span><Pill>更新时间 {data.data_updated_at || '—'}</Pill></span></Tooltip>
          <Pill>USD/CNY {fx}</Pill>
          <Tooltip content="查看 GitHub 仓库"><ButtonLink className="github-link" variant="outline" size="sm" href={GITHUB} target="_blank" rel="noreferrer"><Github size={14}/> GitHub</ButtonLink></Tooltip>
        </div>
      </header>

      <main className="container">
        <section className="hero"><h1>中转站价格对比</h1></section>

        <section className="panel filters">
          <div className="field field-wide">
            <label>厂商</label>
            <Tabs value={vendor} onValueChange={setVendor} variant="segment"><TabsList>{[{id:'',name:'全部'}, ...(data.vendors || [])].map(v => <TabsTrigger key={v.id || 'all'} value={v.id}>{v.name}</TabsTrigger>)}</TabsList></Tabs>
          </div>
          <div className="field">
            <label>模型</label>
            <Select value={modelId} onValueChange={setModelId} disabled={!models.length}>
              <SelectTrigger><SelectValue placeholder="暂无模型" /></SelectTrigger>
              <SelectContent>{models.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="field">
            <label>币种</label>
            <Tabs value={currency} onValueChange={setCurrency} variant="segment"><TabsList>{['CNY','USD'].map(c => <TabsTrigger key={c} value={c}>{c}</TabsTrigger>)}</TabsList></Tabs>
          </div>
          <div className="field">
            <label>排序</label>
            <Select value={sort} onValueChange={setSort}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="combined">综合成本</SelectItem><SelectItem value="input">输入价格</SelectItem><SelectItem value="output">输出价格</SelectItem><SelectItem value="name">平台名称</SelectItem></SelectContent>
            </Select>
          </div>
        </section>

        {rows.length > 0 ? <>
          <section className="stats-grid"><StatCard label="最低综合成本" value={ranked[0].combined_cny} provider={ranked[0].provider_name} currency={currency} fx={fx}/><StatCard label="最低输入价格" value={bestInput.input_cny} provider={bestInput.provider_name} currency={currency} fx={fx}/><StatCard label="最低输出价格" value={bestOutput.output_cny} provider={bestOutput.provider_name} currency={currency} fx={fx}/></section>
          <section className="panel table-panel"><div className="table-headline"><div><span className="eyebrow">PRICE TABLE</span><h2>{data.models.find(m => m.id === modelId)?.name}</h2></div><Pill>{rows.length} 个报价</Pill></div><DataTable rows={rows} columns={tableColumns} rowKey={r => `${modelId}-${r.provider_id}`} /></section>
        </> : <section className="panel empty-panel">这个厂商暂时还没有已录入的价格。</section>}

        <section className="pending-section"><div className="section-title"><div><span className="eyebrow">QUEUE</span><h2>待录入价格</h2></div><Pill>{pending.length} 家</Pill></div><div className="pending-grid">{pending.map((p,i) => <motion.a key={p.id} className="pending-card" href={p.website || '#'} target={p.website ? '_blank' : undefined} rel="noreferrer" initial={{opacity:0,y:6}} whileInView={{opacity:1,y:0}} whileHover={{y:-2}} viewport={{once:true}} transition={{delay:Math.min(i,8)*.025}}><div><strong>{p.name}</strong><span>{p.updated_at}</span></div><Pill>价格登记中</Pill><ExternalLink size={14}/></motion.a>)}</div></section>

        <footer><span>DATA-DRIVEN · OPEN SOURCE · beUI</span><span>Generated {new Date(data.generated_at).toLocaleString()}</span></footer>
      </main>
    </div>
  );
}
