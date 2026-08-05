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
   * Worker en modules ES et satellite.js pré-préparé.
   *
   * satellite.js 7 est un paquet ESM pur (`"type": "module"`, exports sans point
   * d'entrée CommonJS). Sans pré-préparation explicite, son chargement depuis un
   * module worker peut échouer — et un worker qui échoue meurt en silence : c'est
   * ce qui a laissé l'application sur un voile « initialisation » perpétuel.
   */
  worker: {
    format: 'es',
  },
  optimizeDeps: {
    include: ['satellite.js'],
  },
  build: {
    // Cesium est volumineux par nature : on relève le seuil d'avertissement.
    chunkSizeWarningLimit: 4000,
  },
});
