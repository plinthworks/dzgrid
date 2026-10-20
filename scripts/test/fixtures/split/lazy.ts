import { b } from './b.js';
export const lazy = () => `lazy: downloaded on first use only, ${b()}`;
