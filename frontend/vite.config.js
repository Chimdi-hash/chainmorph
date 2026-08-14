import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        study: resolve(__dirname, 'study.html'),
        activity: resolve(__dirname, 'activity.html')
      }
    }
  }
});
