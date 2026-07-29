# SatelliteTracker — les satellites en temps réel sur un globe 3D

Globe terrestre interactif affichant la position **réelle et instantanée** de plus de
10 000 objets en orbite : stations spatiales, constellations (Starlink, OneWeb, Iridium),
satellites de navigation, météo, observation de la Terre, télécommunications, étages de
lanceur et débris.

Les positions ne sont pas approximées : elles sont calculées avec le modèle **SGP4**,
le propagateur orbital standard, à partir des **éléments orbitaux publics (TLE)** du
catalogue NORAD publié par Celestrak.

## Ce que l'application affiche

- **Globe 3D** (Cesium) avec éclairage jour/nuit réel et atmosphère.
- **Position temps réel** de tout le catalogue, animée de façon fluide (60 images/s).
- **Filtres** par catégorie, régime orbital (LEO / MEO / GEO / HEO) et altitude.
- **Recherche** par nom ou n° NORAD (« ISS », « Starlink », « 25544 »).
- **Fiche détaillée** du satellite sélectionné : latitude, longitude, altitude, vitesse,
  période orbitale, inclinaison, excentricité, époque du TLE, TLE brut.
- **Ellipse orbitale** tracée pour l'objet suivi.
- **Contrôle du temps** : accélération × 10 à × 3 600, retour à l'instant présent.
- **Favoris** et **préférences** conservés dans le navigateur (localStorage).

## Précision

| Élément | Ordre de grandeur |
|---|---|
| SGP4 avec un TLE frais (< 1 jour) | erreur de position ~1 km |
| SGP4 avec un TLE de 7 jours | erreur de quelques km à quelques dizaines de km |
| TLE de plus de 30 jours | écartés automatiquement (`MAX_EPOCH_AGE_DAYS`) |
| Interpolation entre deux trames du worker (500 ms) | erreur < 2 m |

Les TLE sont rafraîchis toutes les 2 heures côté serveur, ce qui correspond au rythme
réel de publication du catalogue. L'application n'est pas un outil de conjonction ni de
poursuite d'antenne : c'est un outil de visualisation.

## Démarrage

Double-clic sur le lanceur correspondant à votre système :

| Système | Fichier |
|---|---|
| macOS | `Lancer-SatelliteTracker-macOS.command` |
| Windows | `Lancer-SatelliteTracker-Windows.bat` |
| Linux | `Lancer-SatelliteTracker-Linux.sh` |

Le lanceur installe Node.js si nécessaire (via nvm sur macOS/Linux, version portable sur
Windows), installe les dépendances au premier lancement, démarre serveur + client puis
ouvre la page. Laisser la fenêtre ouverte pendant l'utilisation ; la fermer arrête tout.

En ligne de commande :

```bash
npm install     # installe server + client (npm workspaces)
npm run dev     # serveur (3001) + client (5173) en parallèle
npm run build   # build serveur (tsc) + client (vite)
```

La page est aussi accessible depuis un autre appareil du réseau local
(`http://IP-de-la-machine:5173`) — l'adresse est affichée par le lanceur.

## Structure du projet

Le serveur est en **NestJS** avec une architecture **hexagonale et CQRS**
(`@nestjs/cqrs` : QueryBus/CommandBus). Point important de conception : **le serveur ne
calcule aucune position**. Il ingère, valide, catégorise et met en cache les éléments
orbitaux ; la propagation SGP4 se fait dans le navigateur, dans un WebWorker. C'est ce
qui permet d'animer 11 000 objets à 60 images/s avec une charge serveur nulle, quel que
soit le nombre d'utilisateurs.

```
SatelliteTracker/
├── package.json                    # workspaces npm
├── scripts/lancer.sh               # lanceur macOS/Linux
├── server/                         # API NestJS (TypeScript) — port 3001
│   └── src/
│       ├── main.ts                     # bootstrap, journalisation, préchargement
│       ├── app.module.ts               # câblage ports -> adapters (DI Nest)
│       ├── app.tokens.ts               # tokens d'injection des ports
│       ├── domain/                     # cœur métier, zéro dépendance technique
│       │   ├── model/types.ts          #   SatelliteRecord, régimes, catégories
│       │   ├── ports/                  #   TleSourcePort, CatalogCachePort
│       │   └── services/               #   parseTle, orbitGeometry, classifySatellite,
│       │                               #   mergeCatalogs (dédup. par n° NORAD)
│       ├── application/                # cas d'utilisation (CQRS)
│       │   ├── queries/                #   GetCatalog, GetFacets, GetSatellite
│       │   ├── commands/               #   RefreshCatalog (force le rechargement)
│       │   └── SatelliteCatalogService.ts  # orchestration + cache du read model
│       ├── infrastructure/             # adapters concrets des ports
│       │   ├── sources/CelestrakSource.ts  # un adapter par groupe GP
│       │   ├── cache/MemoryCatalogCache.ts # cache mémoire (pas de base de données)
│       │   ├── http/fetch.ts               # timeout, retry, pause de courtoisie
│       │   └── config/                     # .env, groupes Celestrak, TTL
│       └── interface/http/              # contrôleur NestJS (aucune logique métier)
└── client/                          # React + Vite + Ant Design — port 5173
    └── src/
        ├── App.tsx                      # composition
        ├── workers/propagation.worker.ts# propagation SGP4 de tout le catalogue
        ├── hooks/                       # useCatalog, usePropagation,
        │                                # useSatelliteFilters, useLocalStorage
        ├── components/                  # GlobeView (Cesium), TopBar, FiltersPanel,
        │                                # SatelliteDetails, StatusBar
        ├── constants.ts                 # couleurs par catégorie, cadences, clés locales
        └── utils/format.ts              # formatage FR des grandeurs
```

## API

| Route | Description |
|---|---|
| `GET /api/health` | sonde de démarrage (utilisée par le lanceur) |
| `GET /api/satellites` | catalogue complet avec les TLE (≈ 3 Mo, gzip ≈ 600 Ko) |
| `GET /api/satellites/facets` | facettes de filtrage et fraîcheur, sans les TLE |
| `GET /api/satellites/:noradId` | fiche d'un objet |
| `POST /api/satellites/refresh` | force le rechargement depuis Celestrak |

## Source des données

[Celestrak](https://celestrak.org) publie les éléments orbitaux du catalogue public,
produits par le 18ᵉ Space Defense Squadron de l'US Space Force. L'application respecte
la politique d'usage du site : **un seul jeu de requêtes toutes les 2 heures**, quel que
soit le nombre d'onglets ouverts (cache serveur + cache navigateur, une seule
récupération concurrente).

Groupes récupérés par défaut : `active` (tout le catalogue actif), `stations`, `visual`,
`last-30-days`. Les catégories (Starlink, navigation, météo…) sont déduites de la
désignation du catalogue et du régime orbital calculé.

## Configuration (`server/.env`, optionnel)

```ini
PORT=3001                    # port de l'API
CELESTRAK_GROUPS=active,stations,visual,last-30-days
CATALOG_TTL_MINUTES=120      # durée de vie du cache serveur
MAX_EPOCH_AGE_DAYS=30        # au-delà, les TLE sont écartés
```

Aucune clé d'API n'est nécessaire, y compris pour Cesium : le fond de carte utilisé est
la texture Natural Earth II livrée avec la bibliothèque, l'application fonctionne donc
sans compte et sans accès à un service tuilé externe.

## Notes techniques

**Pourquoi la propagation côté client ?** Une propagation SGP4 coûte environ 3 µs.
Pour 11 000 objets, une trame complète prend ~36 ms (mesuré). À deux trames par seconde,
cela représente 7 % d'un cœur — négligeable dans un WebWorker, mais multiplié par le
nombre d'utilisateurs si c'était le serveur qui calculait, avec en plus un flux WebSocket
de plusieurs centaines de Ko/s par client. Envoyer les TLE une fois et calculer localement
est deux ordres de grandeur moins coûteux.

**Pourquoi une `PointPrimitiveCollection` plutôt que des entités Cesium ?** Les entités
offrent l'animation déclarative et les info-bulles, mais coûtent trop cher à 11 000
objets rafraîchis 60 fois par seconde. La collection de points est dessinée en un seul
appel GPU ; le rendu se réduit à une écriture de position par objet.

**Pourquoi un masque de visibilité et non un tableau filtré ?** Les filtres changent
souvent. En conservant un tableau de points de taille fixe et en ne modifiant que le
booléen `show`, on évite de reconstruire la scène et on garde une correspondance
index ↔ point stable entre le catalogue, le worker et le rendu.

**Orbite figée dans le repère inertiel.** L'ellipse tracée est échantillonnée sur une
période complète en convertissant tous les points avec le *même* temps sidéral : on
obtient l'orbite telle qu'elle existe dans l'espace, et non la spirale qu'on verrait en
tenant compte de la rotation terrestre. Elle est recalculée toutes les 2 secondes pour
suivre la dérive.
