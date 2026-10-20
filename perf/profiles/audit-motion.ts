// The audit screen with motion (step 26), informational: the K.8 profile (audit.ts) plus the motion
// shell an opting application adds (`@dzgrid/dom/motion-gsap`, eager, about 800 B); the run chunk
// and GSAP are lazy, printed beside. The K.8 guard stays the audit profile alone, which imports no
// motion (perf/test/audit-profile.test.ts).
export * from './audit.js';
export { motion } from '@dzgrid/dom/motion-gsap';
