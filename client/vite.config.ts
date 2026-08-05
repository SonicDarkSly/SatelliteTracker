import { createRequire } from 'node:module';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import cesium from 'vite-plugin-cesium';

// Le projet est un monorepo npm workspaces : node_modules est remonté à la
// racine, alors que vite-plugin-cesium cherche « node_modules/cesium/Build »
// relativement au dossier client. On résout donc le chemin réel du paquet
// (fonctionne aussi bien avec node_modules hoisté qu'installé localement).
const here = fileURLToPath(new URL('.', import.meta.url));
const require = createRequire(import.meta.url);
const cesiumBuildRootPath = relative(
  here,
  resolve(dirname(require.resolve('cesium/package.json')), 'Build'),
);

export default defineConfig({
  // Le plugin copie les assets Cesium (textures, workers, widgets) et définit
  // CESIUM_BASE_URL — sans lui, le globe reste noir.
  plugins: [
    react(),
    cesium({
      cesiumBuildRootPath,
      cesiumBuildPath: `${cesiumBuildRootPath}/Cesium/`,
    }),
  ],
  server: {
    // Accessible depuis le réseau local (téléphone/tablette : http://IP-de-la-machine:5173)
    host: true,
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        xfwd: true,
      },
    },
  },
  /*
   * Worker en modules ES, cohérent avec `new Worker(..., { type: 'module' })`.
   *
   * NE PAS ajouter `optimizeDeps.include: ['satellite.js']`. Je l'avais fait par
   * précaution, sans vérifier : cela force esbuild à analyser tout le paquet, y
   * compris son dossier `wasm-build/pthreads-release/` qui utilise du top-level
   * await et `node:worker_threads`. Résultat, Vite refusait de démarrer :
   *   « Top-level await is not available in the configured target environment »
   * Or ce dossier n'est jamais atteint par l'import normal — `dist/index.js` ne
   * référence que `./dist/wasm/`, sans top-level await. La pré-préparation était
   * donc à la fois inutile et nuisible.
   */
  worker: {
    format: 'es',
  },
  build: {
    // Cesium est volumineux par nature : on relève le seuil d'avertissement.
    chunkSizeWarningLimit: 4000,
  },
});
