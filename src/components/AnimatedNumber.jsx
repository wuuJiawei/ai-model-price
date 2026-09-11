import { animate, useInView, useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';

// Adapted from beUI Animated Number: https://beui.dev/components/motion/number
const EASE_OUT = [0.16, 1, 0.3, 1];

export function AnimatedNumber({ value, duration = 0.7, format = n => String(Math.round(n)), className = '' }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, amount: 0.4 });
  const reduce = useReducedMotion();
  const [display, setDisplay] = useState(0);
  const fromRef = useRef(0);

  useEffect(() => {
    if (!inView) return;
    if (reduce) {
      fromRef.current = value;
      setDisplay(value);
      return;
    }
    const controls = animate(fromRef.current, value, {
      duration,
      ease: EASE_OUT,
      onUpdate: setDisplay
    });
    fromRef.current = value;
    return () => controls.stop();
  }, [value, duration, inView, reduce]);

  return <span ref={ref} className={`tabular ${className}`}>{format(display)}</span>;
}
