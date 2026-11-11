// BINJGB-SHELF-1 G1(a) (Cyber A6): `?raw` imports are a file's text as a string — Vite (vitest) does this natively and
// next.config.js adds the matching webpack 5 asset/source rule, scoped to third_party/binjgb/LICENSE.
declare module '*?raw' {
  const text: string;
  export default text;
}
