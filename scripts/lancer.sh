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

# Charger Node.js si installé via nvm
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

# Installation via nvm au premier lancement si Node est absent
NODE_MAJOR=24
if ! command -v npm >/dev/null 2>&1; then
  if [ ! -s "$NVM_DIR/nvm.sh" ]; then
    echo "📥 Node.js est introuvable — installation de nvm (gestionnaire de versions Node)…"
    if ! curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash; then
      echo "❌ Installation de nvm impossible (connexion internet ?)."
      echo "   Alternative : installer Node.js depuis https://nodejs.org puis relancer."
      read -r -p "Appuie sur Entrée pour fermer… "
      exit 1
    fi
    export NVM_DIR="$HOME/.nvm"
    . "$NVM_DIR/nvm.sh"
  fi
  echo "📥 Installation de Node.js ${NODE_MAJOR} via nvm…"
  nvm install "$NODE_MAJOR" && nvm alias default "$NODE_MAJOR"
  echo "✅ Node.js $(node --version) installé via nvm (désinstallation : supprimer ~/.nvm)."
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "❌ Node.js reste introuvable après l'installation."
  read -r -p "Appuie sur Entrée pour fermer… "
  exit 1
fi

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

# Vérification des dépendances (node_modules complet ?)
echo "🔍 Vérification des dépendances…"
if [ ! -d node_modules ] || [ ! -e node_modules/.bin/vite ] || [ ! -e node_modules/.bin/tsc ] \
   || [ ! -d node_modules/cesium ]; then
  echo "📦 Dépendances manquantes ou incomplètes — installation (quelques minutes)…"
  echo "   Cesium et ses textures représentent l'essentiel du téléchargement."
  npm install
  echo "✅ Dépendances installées."
else
  echo "✅ Dépendances déjà installées (node_modules complet)."
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
