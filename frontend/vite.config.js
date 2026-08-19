import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  server: {
    host: '0.0.0.0',
    watch: {
      usePolling: true,
    }
  },
  build: {
    target: 'es2020',
    cssCodeSplit: true,
    chunkSizeWarningLimit: 450,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('vue') || id.includes('pinia') || id.includes('vue-router')) {
              return 'vendor-vue';
            }
            if (id.includes('chart.js') || id.includes('vue-chartjs')) {
              return 'vendor-charts';
            }
            if (id.includes('lucide') || id.includes('@heroicons') || id.includes('material-icons')) {
              return 'vendor-icons';
            }
            if (id.includes('axios') || id.includes('lodash') || id.includes('dayjs')) {
              return 'vendor-utils';
            }
            return 'vendor-core';
          }
        }
      }
    }
  }
})
