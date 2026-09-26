import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ include: ['typescript'] })],
    build: {
      lib: {
        entry: resolve('electron/main/index.ts')
      },
      rollupOptions: {
        // Kokoro loads ONNX Runtime's platform-specific .node binding at runtime.
        // Keep it out of Rollup so the native module can resolve its own path.
        external: ['@huggingface/transformers', 'kokoro-js', 'onnxruntime-node']
      }
    },
    resolve: {
      extensions: ['.ts', '.tsx', '.mts', '.mjs', '.js', '.jsx', '.json'],
      alias: {
        '@main': resolve('electron/main'),
        '@shared': resolve('shared'),
        '@vps': resolve('src/modules/vps-manager'),
        '@clipboard': resolve('src/modules/clipboard-manager')
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      lib: {
        entry: resolve('electron/preload/index.ts')
      }
    },
    resolve: {
      extensions: ['.ts', '.tsx', '.mts', '.mjs', '.js', '.jsx', '.json'],
      alias: {
        '@shared': resolve('shared')
      }
    }
  },
  renderer: {
    root: '.',
    base: './',
    build: {
      rollupOptions: {
        input: resolve('index.html')
      }
    },
    resolve: {
      extensions: ['.ts', '.tsx', '.mts', '.mjs', '.js', '.jsx', '.json'],
      alias: {
        '@': resolve('src'),
        '@shared': resolve('shared')
      }
    },
    plugins: [react()]
  }
})
