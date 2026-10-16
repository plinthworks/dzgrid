import { intentFor } from '@dzgrid/core';
import type { Suite } from './index.js';

export const keys: Record<string, Suite> = {
  'keyboard-intent': ({ key, ctrl, meta, shift, alt, dir, owner, mac }) => ({
    intent: intentFor({ key, ctrlKey: ctrl, metaKey: meta, shiftKey: shift, altKey: alt }, { dir, owner, mac }),
  }),
};
