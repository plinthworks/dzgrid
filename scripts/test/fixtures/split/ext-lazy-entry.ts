// Review fixture: a lazy chunk that imports an external package (the framework the app has).
export const go = async () => (await import('./ext-lazy.js')).z();
