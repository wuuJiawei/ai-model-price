import { motion, useReducedMotion } from 'motion/react';
import { forwardRef, useEffect, useState } from 'react';

// Adapted from the official beUI Button source:
// https://beui.dev/components/motion/button
const SPRING_PRESS = { type: 'spring', stiffness: 500, damping: 30, mass: 0.6 };

function useHoverCapable() {
  const [canHover, setCanHover] = useState(false);
  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia('(hover: hover) and (pointer: fine)');
    const update = () => setCanHover(mq.matches);
    update();
    mq.addEventListener?.('change', update);
    return () => mq.removeEventListener?.('change', update);
  }, []);
  return canHover;
}

function cls(...parts) { return parts.filter(Boolean).join(' '); }

export const Button = forwardRef(function Button({
  variant = 'secondary', size = 'md', pressScale = 0.94, className = '', children, ...props
}, ref) {
  const reduce = useReducedMotion();
  const canHover = useHoverCapable();
  return (
    <motion.button
      ref={ref}
      type="button"
      whileTap={reduce ? undefined : { scale: pressScale }}
      whileHover={reduce || !canHover ? undefined : { scale: 1.02 }}
      transition={SPRING_PRESS}
      className={cls('beui-button', `beui-button-${variant}`, `beui-button-${size}`, className)}
      {...props}
    >{children}</motion.button>
  );
});

export const ButtonLink = forwardRef(function ButtonLink({
  variant = 'secondary', size = 'md', pressScale = 0.94, className = '', children, ...props
}, ref) {
  const reduce = useReducedMotion();
  const canHover = useHoverCapable();
  return (
    <motion.a
      ref={ref}
      whileTap={reduce ? undefined : { scale: pressScale }}
      whileHover={reduce || !canHover ? undefined : { scale: 1.02 }}
      transition={SPRING_PRESS}
      className={cls('beui-button', `beui-button-${variant}`, `beui-button-${size}`, className)}
      {...props}
    >{children}</motion.a>
  );
});
