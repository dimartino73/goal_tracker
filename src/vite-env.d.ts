/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

declare module "*.cjs?raw" {
  const src: string;
  export default src;
}
