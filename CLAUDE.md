# SatelliteTracker — consignes pour la reprise (Claude Code)

Globe 3D **local** affichant en temps réel la position de plus de 10 000 objets en orbite
terrestre, à partir des éléments orbitaux publics (TLE Celestrak) propagés par SGP4.
Même esprit que le projet SwissJobsSearch : monorepo npm workspaces, NestJS hexagonal +
CQRS côté serveur, React + Vite + Ant Design côté client, lanceurs double-clic.

## Principes directeurs (important — l'utilisateur y tient)

- **100 % local** : aucun compte, aucune clé d'API, aucun service payant. Le seul appel
  sortant est la récupération des TLE sur celestrak.org. Le fond de carte Cesium est la
  texture Natural Earth II livrée avec la bibliothèque → fonctionne hors ligne.
- **Ne pas spammer Celestrak — leçon apprise à la dure.** Celestrak renvoie **HTTP 403
  pendant une à deux heures** quand on redemande les mêmes données trop souvent. C'est
  arrivé en développement : `node --watch` redémarrait le serveur à chaque édition, et
  chaque redémarrage retéléchargeait 5 fichiers. Les protections en place, à ne pas
  retirer :
  - cache **disque** (`server/data/`) pour le catalogue et le SATCAT → un redémarrage ne
    déclenche aucun appel réseau ;
  - backoff d'1 h par source après un 403 (`CelestrakSource.blockedUntil`) ;
  - intervalle minimal de 5 min entre deux rafraîchissements forcés ;
  - une seule récupération concurrente (`inFlight`), pause de courtoisie entre requêtes ;
  - deux groupes par défaut seulement (`active` contient déjà tout le reste).
- **Ne jamais persister un catalogue partiel.** Un résultat accompagné d'avertissements et
  de moins de 1 000 objets n'est pas mis en cache, et un résultat 10 % plus pauvre que le
  cache existant ne le remplace pas. Sans ces règles, un seul 403 sur `active` fige un
  catalogue de 22 objets pendant des heures — c'est exactement le bug qu'on a eu.
- **Aucun calcul de position côté serveur.** C'est la décision d'architecture centrale :
  le serveur sert des TLE, le navigateur propage. Ne pas introduire de WebSocket qui
  pousserait des positions — ce serait un recul de deux ordres de grandeur en coût.
- **Persistance minimale, par nécessité** : deux fichiers JSON dans `server/data/`
  (gitignoré) via `FileCatalogCache` et `CachedMetadataSource`. Pas de base de données.
  Côté client, uniquement les préférences en localStorage — **jamais le catalogue** :
  6 Mo dépassent le quota, l'écriture échouait en silence et une copie partielle restait
  servie des heures.
- Réponses et échanges **en français**.
- **Commentaires de code** : garder le « pourquoi » et les en-têtes d'architecture, éviter
  les commentaires qui répètent le code.

## Stack & architecture

- Monorepo npm workspaces : `server/` (NestJS 11, TypeScript, hexagonal + CQRS
  `@nestjs/cqrs`) et `client/` (React 18 + Vite 6 + Ant Design v5 + Cesium, TypeScript).
- Serveur port **3001**, client Vite port **5173** (proxy `/api` → 3001).
- Server : `domain/` (SatelliteRecord, ports, parseTle / orbitGeometry / classifySatellite /
  mergeCatalogs) · `application/` (queries GetCatalog / GetFacets / GetSatellite + command
  RefreshCatalog + SatelliteCatalogService) · `infrastructure/` (CelestrakSource,
  MemoryCatalogCache, config, http) · `interface/http/` (contrôleur).
- Client : `App.tsx` (compo) · `workers/propagation.worker.ts` (SGP4) · `hooks/`
  (useCatalog, usePropagation, useSatelliteFilters, useLocalStorage) · `components/`
  (GlobeView, TopBar, FiltersPanel, SatelliteDetails, StatusBar) · `constants.ts` · `utils/`.

## Commandes

```bash
npm install                 # installe server + client (workspaces)
npm run dev                 # serveur + client en parallèle
npm run build               # build serveur (tsc) + client (vite)
# Vérif type sans build (utile après édition) :
node_modules/.bin/tsc -p server/tsconfig.json --noEmit
node_modules/.bin/tsc -p client/tsconfig.json --noEmit
```

Lanceurs double-clic : `Lancer-SatelliteTracker-{macOS.command,Windows.bat,Linux.sh}`
→ `scripts/lancer.sh` (installent Node via nvm/portable au 1er lancement).

## Points de vigilance

- **`vite.config.ts` et le hoisting npm workspaces** : `vite-plugin-cesium` cherche
  `node_modules/cesium/Build` relativement au dossier `client/`, alors que node_modules est
  remonté à la racine. Le chemin est résolu dynamiquement (`require.resolve`) et passé via
  `cesiumBuildRootPath` **et** `cesiumBuildPath` — les deux options ont des valeurs par
  défaut indépendantes, oublier la seconde casse la copie des assets.
- **Fond de carte** : `TileMapServiceImageryProvider` sur
  `buildModuleUrl('Assets/Textures/NaturalEarthII')`, via `ImageryLayer.fromProviderAsync`.
  Ne pas repasser sur un fournisseur Cesium ion (compte + jeton requis).
- **Repères — point délicat du projet.** SGP4 sort de l'ECI/TEME (inertiel) ; Cesium
  affiche en ECEF (tournant).
  - **Positions des marqueurs** : converties dans le worker par
    `eciToEcf(vecteur, gmst)`, sur la position **et** la vitesse, puis km → m.
  - **Traces orbitales** (satellites et Lune) : laissées en **repère inertiel** et
    tournées à chaque image par la `modelMatrix` de leur `PolylineCollection`
    (`Transforms.computeTemeToPseudoFixedMatrix` pour les satellites,
    `computeIcrfToFixedMatrix` pour la Lune). Ne pas revenir à une conversion figée au
    moment du calcul : la Terre continuant de tourner sous une trace immobile, le
    satellite s'écartait de sa propre trace d'environ **0,5 km par seconde** écoulée.
    Vérifié que les deux conventions coïncident au mètre près (écart mesuré : 0,0 m).
  - Les traces sont **refermées** sur leur premier point : après une période, précession
    et traînée ont déplacé l'orbite, ce qui laissait un trou pile à l'endroit du
    satellite.
- **Extrapolation entre deux trames** : `p + v·Δt` où Δt est le temps **simulé**, soit
  Δt réel × facteur d'accélération. Oublier le facteur laissait le marqueur très loin
  derrière sa position réelle en × 60 et au-delà.
- **Deux collections de marqueurs** (`PointPrimitiveCollection` et `BillboardCollection`),
  une seule alimentée et visible à la fois selon le réglage et le nombre d'objets
  (`ICON_MAX_COUNT`). Toujours interroger la collection **active** (`activeMarkers()`)
  pour le survol, l'étiquette et le recentrage : l'autre porte des positions périmées.
- **Boucle de rendu** : les positions ne passent pas par l'état React (11 000 objets ×
  60 Hz). Le worker écrit dans des `Float32Array` transférés, `GlobeView` les lit dans
  `scene.preUpdate` via `frameRef`. Seuls les compteurs et la fiche du satellite suivi
  passent par `useState`.
- **Extrapolation** : trames toutes les 500 ms, position affichée = `p + v·Δt`. Ne pas
  augmenter l'intervalle au-delà de ~2 s sans revoir ce calcul (l'erreur croît en t²).
- **Somme de contrôle TLE** : `parseTle` rejette les lignes dont le checksum modulo 10 est
  faux. Le catalogue public contient régulièrement des lignes tronquées — c'est voulu, ne
  pas assouplir sans vérifier le nombre d'objets écartés dans les logs.
- **Nommage des catégories** : déduit du nom de catalogue (`classifySatellite.ts`), donc
  imparfait par nature. Un objet marqué `debris` ou `rocket-body` perd ses autres
  catégories (ce n'est pas une charge utile).
- **StrictMode** monte deux fois les effets en développement : le `Viewer` Cesium est
  détruit puis recréé par le nettoyage de son effet. Normal, ne pas « corriger ».
- **Sandbox Linux** : `vite build` échoue si `client/dist` contient un build précédent que
  le sandbox n'a pas le droit de supprimer (`EPERM unlink`). Contourner avec
  `--outDir /tmp/... --emptyOutDir`. `tsc --noEmit` reste la vérif fiable.

## Vérifications déjà passées

- `tsc --noEmit` serveur et client : OK.
- `vite build` : OK (worker émis en chunk séparé, assets Cesium et textures Natural Earth II
  copiés, ~15 Mo).
- Chaîne complète serveur validée contre une source TLE locale : fetch → parse → fusion
  (dédoublonnage par n° NORAD sur deux groupes) → facettes → API, plus les cas d'erreur
  (source injoignable → `stale`/`warnings`, n° NORAD inconnu → 404) et la compression gzip
  (2 393 o → 995 o sur l'échantillon).
- Parsing contrôlé sur TLE réels : ISS → LEO 353 km / 91,6 min / catégorie `stations`,
  Hubble → LEO 537 km / `science`, GOES 16 → GEO 35 787 km / `weather`, GPS BIIF-2 →
  MEO 20 182 km / `navigation`. Ligne au checksum invalide correctement écartée.
- Propagation SGP4 de l'ISS à l'époque de son TLE : altitude 355 km, vitesse 7,705 km/s.
- Coût mesuré : 11 000 propagations en 36 ms → 7 % d'un cœur à 2 trames/s.

## Pistes non implémentées (si l'utilisateur les demande)

- Trace au sol (ground track) et prévision de passages au-dessus d'une position donnée.
- Mode « suivi caméra » verrouillé sur un satellite (actuellement recentrage ponctuel).
- Groupes Celestrak supplémentaires activables depuis l'UI (aujourd'hui via `.env`).
- Persistance des TLE sur disque pour un démarrage hors ligne côté serveur.
