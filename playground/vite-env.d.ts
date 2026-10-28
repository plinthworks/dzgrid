// Vite's `?inline` imports, as the playground uses them (a stylesheet as text: main.ts's showcase theme switch).
declare module '*.css?inline' {
  const css: string;
  export default css;
}
// `?raw`: a file's text untouched (real-app.ts: Tailwind 3's preflight, its theme() calls written out by the page).
declare module '*.css?raw' {
  const text: string;
  export default text;
}
