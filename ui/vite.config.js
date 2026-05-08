import { defineConfig } from 'vite';
import { resolve } from 'path';
import fs from 'fs';

/**
 * Cocoya Vite 配置
 * 核心目標：在打包時保留原始 src 與 blockly 目錄結構，以維持與 VSIX 的高度相容性
 */
function copyCocoyaAssets() {
  return {
    name: 'copy-cocoya-assets',
    closeBundle: () => {
      const folders = ['src', 'blockly'];
      const distPath = resolve(__dirname, 'dist');
      
      folders.forEach(folder => {
        const src = resolve(__dirname, folder);
        const dest = resolve(distPath, folder);
        
        if (fs.existsSync(src)) {
          console.log(`[Vite] Copying static folder: ${folder} -> dist/${folder}`);
          // Node.js 16.7+ 支援 cpSync
          fs.cpSync(src, dest, { recursive: true });
        }
      });
    }
  };
}

export default defineConfig({
  root: '.',
  base: './', // 關鍵：確保產出的路徑是相對路徑 (./assets/...)，以利於 Tauri 載入
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
      }
    }
  },
  plugins: [
    copyCocoyaAssets()
  ]
});
