import { MotionConfig, motion, useReducedMotion } from 'motion/react';
import { createContext, useCallback, useContext, useId, useMemo, useState } from 'react';

// Adapted from the official beUI Tabs source:
// https://beui.dev/components/motion/tabs
const TabsContext = createContext(null);
const SPRING = { type: 'spring', stiffness: 170, damping: 24, mass: 1.2 };

function useTabs() {
  const ctx = useContext(TabsContext);
  if (!ctx) throw new Error('Tabs.* must be used inside <Tabs>');
  return ctx;
}

export function Tabs({ defaultValue = '', value, onValueChange, variant = 'segment', children, className = '' }) {
  const [internal, setInternal] = useState(defaultValue);
  const layoutId = useId();
  const reduce = useReducedMotion();
  const controlled = value !== undefined;
  const current = controlled ? value : internal;
  const setValue = useCallback((next) => {
    if (!controlled) setInternal(next);
    onValueChange?.(next);
  }, [controlled, onValueChange]);
  const contextValue = useMemo(() => ({ value: current, setValue, layoutId, variant }), [current, setValue, layoutId, variant]);
  return (
    <MotionConfig transition={reduce ? { duration: 0 } : SPRING}>
      <TabsContext.Provider value={contextValue}>
        <motion.div layoutRoot className={`beui-tabs ${className}`}>{children}</motion.div>
      </TabsContext.Provider>
    </MotionConfig>
  );
}

export function TabsList({ children, className = '' }) {
  const { variant } = useTabs();
  return <div role="tablist" className={`beui-tabs-list beui-tabs-${variant} ${className}`}>{children}</div>;
}

export function TabsTrigger({ value, children, className = '' }) {
  const { value: current, setValue, layoutId, variant } = useTabs();
  const active = current === value;
  return (
    <div className="beui-tab-wrap">
      {active && <motion.span layoutId={layoutId} layout="position" className={`beui-tab-indicator beui-tab-indicator-${variant}`} />}
      <button
        type="button"
        role="tab"
        aria-selected={active}
        className={`beui-tab-trigger ${active ? 'is-active' : ''} ${className}`}
        onClick={() => setValue(value)}
      >{children}</button>
    </div>
  );
}
