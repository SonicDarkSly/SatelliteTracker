#!/bin/bash
#
# Publication du dépôt sur GitHub (même compte que SwissJobsSearch).
# À lancer depuis la machine hôte : le sandbox n'a ni clé SSH ni accès à github.com.
#
set -e
cd "$(dirname "$0")/.."

REPO="SatelliteTracker"
OWNER="SonicDarkSly"

echo "📦 Dépôt local : $(git log --oneline -1)"
echo "🔗 Distant     : $(git remote get-url origin 2>/dev/null || echo 'non configuré')"

# Création du dépôt distant si le CLI GitHub est disponible et connecté.
if command -v gh >/dev/null 2>&1; then
  if ! gh repo view "${OWNER}/${REPO}" >/dev/null 2>&1; then
    echo "🆕 Création du dépôt privé ${OWNER}/${REPO}…"
    gh repo create "${OWNER}/${REPO}" --private --source=. --remote=origin --push
    echo "✅ Dépôt créé et poussé."
    exit 0
  fi
  echo "ℹ️  Le dépôt distant existe déjà."
else
  echo "ℹ️  GitHub CLI (gh) absent — créez le dépôt vide ${OWNER}/${REPO} sur github.com,"
  echo "    SANS README ni .gitignore, puis relancez ce script."
fi

echo "🚀 Envoi de la branche main…"
git push -u origin main
echo "✅ Terminé : https://github.com/${OWNER}/${REPO}"
