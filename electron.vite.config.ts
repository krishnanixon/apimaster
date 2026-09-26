import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve('electron/main/index.ts'),
          'mcp-stdio': resolve('electron/main/mcp/stdio-bridge.ts')
        }
      }
    },
    resolve: {
      extensions: ['.ts', '.tsx', '.mts', '.mjs', '.js', '.jsx', '.json'],
      alias: {
        '@main': resolve('electron/main'),
        '@shared': resolve('shared')
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
      dedupe: ['graphql'],
      extensions: ['.ts', '.tsx', '.mts', '.mjs', '.js', '.jsx', '.json'],
      alias: {
        '@': resolve('src'),
        '@shared': resolve('shared'),
        graphql: resolve('node_modules/graphql/index.js')
      }
    },
    plugins: [react()]
  }
})
