// Serves the S4 / S10 pages for a manual screen-reader session (protocol.md). Ctrl+C to stop.
//   node spikes/s4-a11y/serve.mjs
import { serve } from '../kit.mjs';
const site = await serve(import.meta.url);
const pages = ['lang=fr', 'lang=ar', 'lang=fr&mode=treegrid', 'lang=ar&mode=treegrid', 'lang=fr&mode=detail', 'lang=ar&mode=detail', 'lang=fr&mode=paged', 'lang=ar&mode=paged'];
for (const p of pages) console.log(site.url(`index.html?${p}&manual=1`));
console.log('Port:', new URL(site.url()).port, '— Android: adb reverse tcp:<port> tcp:<port>');
