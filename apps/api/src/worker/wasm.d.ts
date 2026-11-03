// The workerd Prisma client imports its query compiler as a module, which
// wrangler supports and TypeScript needs told about.
declare module '*.wasm?module' {
  const module: WebAssembly.Module
  export default module
}
