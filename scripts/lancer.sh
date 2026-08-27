#!/bin/bash
#
# Lanceur SatelliteTracker (macOS et Linux).
# Laisse la fenêtre ouverte pendant l'utilisation ; la fermer arrête tout.
#
set -m  # groupes de processus : permet d'arrêter serveur + client d'un coup
cd "$(dirname "$0")/.."

# Ouverture du navigateur selon l'OS
if [ "$(uname)" = "Darwin" ]; then
  OPEN=open
else
  OPEN=xdg-open
fi

# ---------------------------------------------------------------------------
# Node.js : le projet exige la version 24 (voir .nvmrc et le champ "engines").
#
# Il ne suffit pas d'installer Node quand il est absent : si une autre version
# est active via nvm, elle serait utilisée telle quelle. On active donc
# explicitement la version du .nvmrc, et on l'installe si elle manque.
# ---------------------------------------------------------------------------
NODE_MAJOR=$(tr -dc '0-9' < .nvmrc 2>/dev/null || echo 24)
NODE_MAJOR=${NODE_MAJOR:-24}

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

# Majeure de la version de Node actuellement active, ou 0 si Node est absent.
node_major() {
  command -v node >/dev/null 2>&1 || { echo 0; return; }
  node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0
}

# Installation de nvm si nécessaire (aucun Node, ou version trop ancienne).
if ! command -v nvm >/dev/null 2>&1 && [ ! -s "$NVM_DIR/nvm.sh" ]; then
  if [ "$(node_major)" -lt "$NODE_MAJOR" ]; then
    echo "📥 Node.js ${NODE_MAJOR} requis — installation de nvm (gestionnaire de versions Node)…"
    if ! curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash; then
      echo "❌ Installation de nvm impossible (connexion internet ?)."
      echo "   Alternative : installer Node.js ${NODE_MAJOR} depuis https://nodejs.org puis relancer."
      read -r -p "Appuie sur Entrée pour fermer… "
      exit 1
    fi
    export NVM_DIR="$HOME/.nvm"
    . "$NVM_DIR/nvm.sh"
  fi
fi

# Activation de la version du .nvmrc. `nvm use` et `nvm install` sans argument
# lisent ce fichier, ce qui évite de dupliquer le numéro de version ici.
if command -v nvm >/dev/null 2>&1; then
  if ! nvm use >/dev/null 2>&1; then
    echo "📥 Installation de Node.js ${NODE_MAJOR} via nvm…"
    nvm install >/dev/null 2>&1
    nvm use >/dev/null 2>&1
    nvm alias default "$NODE_MAJOR" >/dev/null 2>&1
  fi
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "❌ Node.js reste introuvable après l'installation."
  read -r -p "Appuie sur Entrée pour fermer… "
  exit 1
fi

ACTIVE_MAJOR=$(node_major)
if [ "$ACTIVE_MAJOR" -lt "$NODE_MAJOR" ]; then
  echo "❌ Node.js ${NODE_MAJOR} est requis, or la version active est $(node --version)."
  echo "   Avec nvm :  nvm install ${NODE_MAJOR} && nvm use ${NODE_MAJOR}"
  read -r -p "Appuie sur Entrée pour fermer… "
  exit 1
fi
echo "✅ Node.js $(node --version) · npm $(npm --version)"

# Déjà lancé ? On ouvre juste la page.
if curl -s --max-time 2 http://localhost:3001/api/health | grep -q ok \
   && curl -s -o /dev/null --max-time 2 http://localhost:5173; then
  echo "✅ SatelliteTracker tourne déjà — ouverture de la page."
  "$OPEN" http://localhost:5173
  exit 0
fi

# Une instance à moitié morte (serveur seul, sans la page) ? On la nettoie.
if curl -s --max-time 2 http://localhost:3001/api/health | grep -q ok; then
  echo "🧹 Nettoyage d'une instance précédente…"
  pkill -f "node --watch dist/main.js" 2>/dev/null
  pkill -f "vite" 2>/dev/null
  sleep 2
fi

# Binaires natifs attendus pour CETTE machine. Vite s'appuie sur rollup et esbuild,
# qui embarquent du code compilé par plateforme : un node_modules copié depuis une
# autre machine (ou installé dans un conteneur) fait échouer le client au démarrage
# avec « Cannot find module @rollup/rollup-… ». On le détecte avant de lancer.
case "$(uname -s)-$(uname -m)" in
  Darwin-arm64)  NATIF_ROLLUP="rollup-darwin-arm64";     NATIF_ESBUILD="darwin-arm64" ;;
  Darwin-x86_64) NATIF_ROLLUP="rollup-darwin-x64";       NATIF_ESBUILD="darwin-x64" ;;
  Linux-x86_64)  NATIF_ROLLUP="rollup-linux-x64-gnu";    NATIF_ESBUILD="linux-x64" ;;
  Linux-aarch64) NATIF_ROLLUP="rollup-linux-arm64-gnu";  NATIF_ESBUILD="linux-arm64" ;;
  *)             NATIF_ROLLUP="";                        NATIF_ESBUILD="" ;;
esac

# Le paquet doit contenir son binaire .node / son exécutable, pas seulement le dossier.
natifs_ok() {
  [ -z "$NATIF_ROLLUP" ] && return 0  # plateforme non reconnue : on ne bloque pas
  ls node_modules/@rollup/"$NATIF_ROLLUP"/*.node >/dev/null 2>&1 \
    && [ -x "node_modules/@esbuild/$NATIF_ESBUILD/bin/esbuild" ]
}

# Vérification des dépendances (node_modules complet et adapté à la machine ?)
echo "🔍 Vérification des dépendances…"
BESOIN_INSTALL=0
if [ ! -d node_modules ] || [ ! -e node_modules/.bin/vite ] || [ ! -e node_modules/.bin/tsc ] \
   || [ ! -d node_modules/cesium ]; then
  echo "📦 Dépendances manquantes ou incomplètes — installation (quelques minutes)…"
  BESOIN_INSTALL=1
elif ! natifs_ok; then
  echo "📦 node_modules ne correspond pas à cette machine ($(uname -s) $(uname -m))."
  echo "   Réinstallation propre (npm et ses dépendances optionnelles par plateforme)…"
  rm -rf node_modules package-lock.json
  BESOIN_INSTALL=1
fi

if [ "$BESOIN_INSTALL" = "1" ]; then
  echo "   Cesium et ses textures représentent l'essentiel du téléchargement."
  npm install
  if ! natifs_ok; then
    echo "❌ Les binaires natifs de rollup/esbuild sont toujours absents."
    echo "   Réessayer : rm -rf node_modules package-lock.json && npm install"
    read -r -p "Appuie sur Entrée pour fermer… "
    exit 1
  fi
  echo "✅ Dépendances installées."
else
  echo "✅ Dépendances déjà installées (node_modules complet)."
fi

# Cache de pré-préparation de Vite : un démarrage interrompu (erreur de config,
# Ctrl+C pendant l'optimisation) y laisse un état partiel qui fait échouer les
# lancements suivants avec des erreurs sans lien apparent. Il se régénère en
# quelques secondes, autant repartir propre quand le dernier lancement a échoué.
VITE_CACHE="node_modules/.vite"
if [ -d "$VITE_CACHE" ] && [ ! -f "$VITE_CACHE/deps/_metadata.json" ]; then
  echo "🧹 Cache Vite incomplet — remise à zéro…"
  rm -rf "$VITE_CACHE"
fi

echo "🚀 Démarrage de SatelliteTracker…"
npm run dev &
DEV_PID=$!

cleanup() {
  echo ""
  echo "🛑 Arrêt de SatelliteTracker…"
  kill -- -"$DEV_PID" 2>/dev/null
  wait "$DEV_PID" 2>/dev/null
  exit 0
}
trap cleanup INT TERM HUP EXIT

# Attendre que le serveur (API) ET la page répondent, puis ouvrir le navigateur
echo "⏳ Préparation en cours (compilation du serveur, récupération des éléments orbitaux)…"
for _ in $(seq 1 90); do
  if curl -s --max-time 2 http://localhost:3001/api/health | grep -q ok \
     && curl -s -o /dev/null --max-time 2 http://localhost:5173; then
    # Double contrôle une seconde plus tard (évite une instance mourante)
    sleep 1
    if curl -s --max-time 2 http://localhost:3001/api/health | grep -q ok; then
      "$OPEN" http://localhost:5173
      break
    fi
  fi
  sleep 1
done

# Adresse IP locale (accès depuis un autre appareil du réseau)
if [ "$(uname -s)" = "Darwin" ]; then
  LOCAL_IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null)"
else
  LOCAL_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
fi

echo ""
echo "✅ SatelliteTracker est ouvert : http://localhost:5173"
if [ -n "$LOCAL_IP" ]; then
  echo "📱 Accès réseau local (autre appareil du même réseau) : http://${LOCAL_IP}:5173"
fi
echo "   Le premier affichage télécharge ~11 000 jeux d'éléments orbitaux (quelques secondes)."
echo "   Laisse cette fenêtre ouverte pendant l'utilisation."
echo "   Pour arrêter : ferme cette fenêtre (ou Ctrl+C)."
wait "$DEV_PID"
