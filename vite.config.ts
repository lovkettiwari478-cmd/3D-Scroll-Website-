import { defineConfig } from 'vite';
// BASE_PATH is set by the GitHub Pages workflow (/<repo>/); defaults to root.
export default defineConfig({
  base: process.env.BASE_PATH || '/',
  server: { host: '0.0.0.0', allowedHosts: true },
  preview: { host: '0.0.0.0', allowedHosts: true },
  build: { target: 'es2020', cssMinify: true },
});
