/** The one piece of jsdom the read-back helper uses (xlsx-read.ts): jsdom ships no types, and @types/jsdom is not a dependency. */
declare module 'jsdom' {
  export class JSDOM {
    constructor(html?: string);
    readonly window: { readonly DOMParser: typeof DOMParser };
  }
}
