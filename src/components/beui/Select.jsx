import { Check, ChevronDown } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';

// Adapted from the official beUI Select source:
// https://beui.dev/components/motion/select
const Context = createContext(null);
const EASE_OUT = [0.16, 1, 0.3, 1];
const ITEM = { hidden: { opacity: 0, y: -6, filter: 'blur(3px)' }, show: { opacity: 1, y: 0, filter: 'blur(0px)' } };

function useSelect(name) {
  const ctx = useContext(Context);
  if (!ctx) throw new Error(`${name} must be used within <Select>`);
  return ctx;
}

export function Select({ value, defaultValue, onValueChange, disabled = false, children, className = '' }) {
  const reduce = useReducedMotion() ?? false;
  const baseId = useId();
  const rootRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [internal, setInternal] = useState(defaultValue);
  const [labels, setLabels] = useState(new Map());
  const [placement, setPlacement] = useState('bottom');
  const controlled = value !== undefined;
  const current = controlled ? value : internal;
  const select = useCallback((next) => {
    if (!controlled) setInternal(next);
    onValueChange?.(next);
    setOpen(false);
  }, [controlled, onValueChange]);
  const register = useCallback((v, label) => setLabels(m => m.get(v) === label ? m : new Map(m).set(v, label)), []);
  const unregister = useCallback((v) => setLabels(m => { if (!m.has(v)) return m; const n = new Map(m); n.delete(v); return n; }), []);

  useEffect(() => {
    if (!open) return;
    const onKey = e => e.key === 'Escape' && setOpen(false);
    const onPointer = e => rootRef.current && !rootRef.current.contains(e.target) && setOpen(false);
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onPointer);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('pointerdown', onPointer); };
  }, [open]);

  const ctx = useMemo(() => ({
    value: current, open, setOpen, select, register, unregister,
    labelFor: v => v === undefined ? undefined : labels.get(v), reduce,
    triggerId: `${baseId}-trigger`, listId: `${baseId}-list`, disabled, placement, setPlacement
  }), [current, open, select, register, unregister, labels, reduce, baseId, disabled, placement]);

  return <Context.Provider value={ctx}><div ref={rootRef} className={`beui-select ${className}`}>{children}</div></Context.Provider>;
}

export function SelectTrigger({ children, className = '' }) {
  const ctx = useSelect('SelectTrigger');
  return (
    <motion.button
      type="button"
      id={ctx.triggerId}
      disabled={ctx.disabled}
      aria-haspopup="listbox"
      aria-expanded={ctx.open}
      aria-controls={ctx.listId}
      onClick={() => ctx.setOpen(!ctx.open)}
      whileTap={ctx.reduce ? undefined : { scale: 0.98 }}
      className={`beui-select-trigger ${className}`}
    >
      {children}
      <motion.span animate={{ rotate: ctx.open ? 180 : 0 }} transition={ctx.reduce ? { duration: 0 } : { type: 'spring', duration: 0.4, bounce: 0.3 }}>
        <ChevronDown size={15} />
      </motion.span>
    </motion.button>
  );
}

export function SelectValue({ placeholder = '请选择' }) {
  const ctx = useSelect('SelectValue');
  return <span className={ctx.labelFor(ctx.value) ? '' : 'is-placeholder'}>{ctx.labelFor(ctx.value) ?? placeholder}</span>;
}

export function SelectContent({ children, className = '' }) {
  const ctx = useSelect('SelectContent');
  const innerRef = useRef(null);
  const [height, setHeight] = useState(0);
  useLayoutEffect(() => {
    const node = innerRef.current;
    if (!node) return;
    const measure = () => setHeight(node.offsetHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(node);
    return () => ro.disconnect();
  }, [children]);
  useLayoutEffect(() => {
    if (!ctx.open) return;
    const trigger = document.getElementById(ctx.triggerId);
    const node = innerRef.current;
    if (!trigger || !node) return;
    const r = trigger.getBoundingClientRect();
    const below = window.innerHeight - r.bottom;
    ctx.setPlacement(below < node.offsetHeight + 16 && r.top > below ? 'top' : 'bottom');
  }, [ctx.open, ctx.triggerId]);
  const top = ctx.placement === 'top';
  return (
    <motion.div
      id={ctx.listId}
      role="listbox"
      aria-labelledby={ctx.triggerId}
      aria-hidden={!ctx.open}
      inert={!ctx.open ? '' : undefined}
      initial={false}
      animate={{ opacity: ctx.open ? 1 : 0, height: ctx.open ? height : 0, marginTop: !top && ctx.open ? 8 : 0, marginBottom: top && ctx.open ? 8 : 0 }}
      transition={ctx.reduce ? { duration: 0.1 } : { height: { type: 'spring', duration: 0.42, bounce: 0.14 }, opacity: { duration: 0.16, ease: EASE_OUT } }}
      className={`beui-select-content ${top ? 'opens-top' : 'opens-bottom'} ${className}`}
      style={{ pointerEvents: ctx.open ? 'auto' : 'none' }}
    >
      <motion.div ref={innerRef} className="beui-select-items" initial={false} animate={ctx.open ? 'show' : 'hidden'} variants={{ hidden: {}, show: { transition: { staggerChildren: 0.035, delayChildren: 0.04 } } }}>
        {children}
      </motion.div>
    </motion.div>
  );
}

export function SelectItem({ value, disabled = false, children }) {
  const ctx = useSelect('SelectItem');
  const selected = ctx.value === value;
  const label = typeof children === 'string' ? children : String(value);
  useLayoutEffect(() => { ctx.register(value, label); return () => ctx.unregister(value); }, [ctx.register, ctx.unregister, value, label]);
  return (
    <motion.div variants={ctx.reduce ? undefined : ITEM}>
      <button type="button" role="option" aria-selected={selected} disabled={disabled} className={`beui-select-item ${selected ? 'is-selected' : ''}`} onClick={() => ctx.select(value)}>
        <span>{children}</span>{selected && <Check size={14} />}
      </button>
    </motion.div>
  );
}
