import path from 'path';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { defineConfig, type Plugin } from 'vite';

const require = createRequire(import.meta.url);

function localOcrData(): Plugin {
    const assets = ['ara', 'eng'].map(language => ({
        url: `ocr-data/${language}.traineddata.gz`,
        source: require.resolve(`@tesseract.js-data/${language}/4.0.0_best_int/${language}.traineddata.gz`),
    }));
    return {
        name: 'local-ocr-data',
        configureServer(server) {
            server.middlewares.use((req, res, next) => {
                const entry = assets.find(asset => req.url === '/' + asset.url);
                if (!entry) return next();
                res.setHeader('Content-Type', 'application/octet-stream');
                res.end(readFileSync(entry.source));
            });
        },
        generateBundle() {
            for (const asset of assets) {
                this.emitFile({ type: 'asset', fileName: asset.url, source: readFileSync(asset.source) });
            }
        },
    };
}
import react from '@vitejs/plugin-react';

export default defineConfig(() => {
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react(), localOcrData()],
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
