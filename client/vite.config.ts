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
   * Cible `esnext` : indispensable, et voici pourquoi.
   *
   * satellite.js 7 embarque une implémentation WebAssembly optionnelle. Le fichier
   * `dist/wasm/runtimes/index.js` la charge par imports dynamiques conditionnels :
   *     await import('#wasm-multi-thread')   →  wasm-build/pthreads-release/index.js
   *     await import('#wasm-single-thread')  →  wasm-build/base-release/index.js
   * Ces appels sont à l'intérieur de fonctions async et ne sont donc jamais
   * exécutés tant qu'on n'utilise pas le moteur WASM — ce qui n'est pas notre cas.
   * Mais le scanner de dépendances de Vite suit les imports dynamiques : il tombe
   * sur le build pthreads, qui contient du **top-level await**, et refuse de
   * démarrer avec la cible par défaut (« Top-level await is not available in the
   * configured target environment »). Plus de serveur de développement, donc plus
   * de page du tout.
   *
   * `esnext` autorise le top-level await, à la fois pour la pré-préparation des
   * dépendances et pour le build final. Sans conséquence pratique : le top-level
   * await est pris en charge par tous les navigateurs actuels (Safari 15+,
   * Chrome 89+), et Cesium comme cette application les exigent déjà.
   *
   * À ne pas confondre avec une autre tentative, celle-là inutile et nuisible :
   * ajouter `optimizeDeps.include: ['satellite.js']` ne corrige rien et force
   * l'analyse de tout le paquet.
   */
  optimizeDeps: {
    esbuildOptions: {
      target: 'esnext',
    },
  },
  /* Worker en modules ES, cohérent avec `new Worker(..., { type: 'module' })`. */
  worker: {
    format: 'es',
  },
  build: {
    target: 'esnext',
    // Cesium est volumineux par nature : on relève le seuil d'avertissement.
    chunkSizeWarningLimit: 4000,
  },
});
