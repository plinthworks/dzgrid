/**
 * `@dzgrid/dom/motion-gsap`: motion with GSAP (docs/behaviors/motion.md, step 26), a feature. Small
 * and eager; the tweens and GSAP (an optional peer the application installs, under GSAP's own
 * licence) are a chunk (`motion-gsap/run/`) loaded in idle time after the first rows are painted.
 */
export { motion } from './motion-gsap/index.js';
export type { CellMotion, Gsap, Motion, MotionEffects, MotionOptions, RowMotion } from './motion-gsap/index.js';
