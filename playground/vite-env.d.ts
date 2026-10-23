// Vite's `?inline` imports, as the playground uses them (a stylesheet as text: main.ts's showcase theme switch).
declare module '*.css?inline' {
  const css: string;
  export default css;
}
