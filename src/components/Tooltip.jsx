import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * beUI Tooltip（按项目现有 CSS 体系适配）
 * Hover / focus 触发，使用 blur + spring 进入/退出动画。
 * 参考：https://beui.dev/components/motion/tooltip
 */
export function Tooltip({ content, children, side = 'top', delay = 120 }) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState(null);
  const anchorRef = useRef(null);
  const timerRef = useRef(null);
  const id = useId();
  const reduceMotion = useReducedMotion();

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const updatePosition = () => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const gap = 9;
    const base = {
      top: rect.top + rect.height / 2,
      left: rect.left + rect.width / 2,
    };

    if (side === 'top') base.top = rect.top - gap;
    if (side === 'bottom') base.top = rect.bottom + gap;
    if (side === 'left') base.left = rect.left - gap;
    if (side === 'right') base.left = rect.right + gap;
    setCoords(base);
  };

  const show = () => {
    clearTimer();
    timerRef.current = setTimeout(() => {
      updatePosition();
      setOpen(true);
    }, delay);
  };

  const hide = () => {
    clearTimer();
    setOpen(false);
  };

  useEffect(() => {
    if (!open) return undefined;
    const handle = () => updatePosition();
    window.addEventListener('resize', handle);
    window.addEventListener('scroll', handle, true);
    return () => {
      window.removeEventListener('resize', handle);
      window.removeEventListener('scroll', handle, true);
    };
  }, [open, side]);

  useEffect(() => () => clearTimer(), []);

  const origin = side === 'top'
    ? { y: 6 }
    : side === 'bottom'
      ? { y: -6 }
      : side === 'left'
        ? { x: 6 }
        : { x: -6 };

  const variants = reduceMotion
    ? {
        initial: { opacity: 0 },
        animate: { opacity: 1, transition: { duration: 0.14 } },
        exit: { opacity: 0, transition: { duration: 0.1 } },
      }
    : {
        initial: { opacity: 0, scale: 0.9, filter: 'blur(5px)', ...origin },
        animate: {
          opacity: 1,
          scale: 1,
          filter: 'blur(0px)',
          x: 0,
          y: 0,
          transition: {
            type: 'spring',
            stiffness: 380,
            damping: 30,
            mass: 0.7,
            opacity: { duration: 0.14 },
            filter: { duration: 0.18 },
          },
        },
        exit: {
          opacity: 0,
          scale: 0.94,
          filter: 'blur(3px)',
          x: (origin.x || 0) * 0.6,
          y: (origin.y || 0) * 0.6,
          transition: { duration: 0.12 },
        },
      };

  return (
    <>
      <span
        ref={anchorRef}
        className="beui-tooltip-anchor"
        aria-describedby={open ? id : undefined}
        onPointerEnter={show}
        onPointerLeave={hide}
        onFocusCapture={show}
        onBlurCapture={hide}
      >
        {children}
      </span>
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {open && coords && (
            <motion.div
              id={id}
              role="tooltip"
              className="beui-tooltip"
              data-side={side}
              style={{ top: coords.top, left: coords.left }}
              variants={variants}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              {content}
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}
