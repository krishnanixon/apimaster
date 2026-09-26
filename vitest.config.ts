import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  ssr: {
    noExternal: ['graphql-language-service', 'cm6-graphql']
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    server: {
      deps: {
        inline: ['graphql-language-service', 'cm6-graphql']
      }
    }
  },
  resolve: {
    dedupe: ['graphql'],
    alias: {
      '@': resolve('src'),
      '@shared': resolve('shared'),
      graphql: resolve('node_modules/graphql/index.js')
    }
  }
})
