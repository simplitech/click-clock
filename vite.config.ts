import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

// https://vitejs.dev/config/
export default defineConfig({
  base: '/click-clock/',
  plugins: [svelte()],
  optimizeDeps: {
    exclude: ['@urql/svelte'],
  },
})
