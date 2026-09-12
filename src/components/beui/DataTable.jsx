import { AnimatePresence, motion, useReducedMotion } from 'motion/react';

// Lightweight adapter for this small dataset, following beUI Table's motion and
// sticky-header interaction model without pulling in its 10k-row virtualization stack.
// Reference: https://beui.dev/components/motion/table
export function DataTable({ rows, columns, rowKey, className = '' }) {
  const reduce = useReducedMotion();
  return (
    <div className={`beui-table-wrap ${className}`}>
      <table className="beui-table">
        <thead><tr>{columns.map(c => <th key={c.key} style={c.width ? { width: c.width } : undefined}>{c.header}</th>)}</tr></thead>
        <tbody>
          <AnimatePresence initial={false} mode="popLayout">
            {rows.map((row, index) => (
              <motion.tr
                key={rowKey(row, index)}
                layout={!reduce}
                initial={reduce ? false : { opacity: 0, y: 5, filter: 'blur(2px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                exit={reduce ? undefined : { opacity: 0, y: -4, filter: 'blur(2px)' }}
                transition={{ duration: 0.18 }}
              >
                {columns.map(c => <td key={c.key} className={c.className?.(row) || ''}>{c.cell ? c.cell(row, index) : row[c.key]}</td>)}
              </motion.tr>
            ))}
          </AnimatePresence>
        </tbody>
      </table>
    </div>
  );
}
