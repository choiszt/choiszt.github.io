import { defineConfig } from 'vite'
import { execSync } from 'child_process'

const gitDate = (() => {
  try {
    return execSync('git log -1 --format=%ci').toString().trim()
  } catch {
    return new Date().toISOString()
  }
})()

export default defineConfig({
  define: {
    __BUILD_TIME__: JSON.stringify(gitDate),
  },
  build: {
    outDir: 'dist',
  },
})
