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
#
# On ne passe volontairement pas --source/--remote/--push à `gh repo create` :
# le remote `origin` est déjà configuré ici, et gh échoue à l'ajouter (« Unable to
# add remote origin ») en laissant le dépôt créé mais vide. On sépare donc
# création et envoi, ce qui rend aussi le script rejouable sans effet de bord.
if command -v gh >/dev/null 2>&1; then
  if gh repo view "${OWNER}/${REPO}" >/dev/null 2>&1; then
    echo "ℹ️  Le dépôt distant existe déjà."
  else
    echo "🆕 Création du dépôt privé ${OWNER}/${REPO}…"
    gh repo create "${OWNER}/${REPO}" --private
  fi
else
  echo "ℹ️  GitHub CLI (gh) absent — créez le dépôt vide ${OWNER}/${REPO} sur github.com,"
  echo "    SANS README ni .gitignore, puis relancez ce script."
fi

# Remise en place du remote au cas où il manquerait ou pointerait ailleurs.
if ! git remote get-url origin >/dev/null 2>&1; then
  git remote add origin "git@github.com:${OWNER}/${REPO}.git"
fi

echo "🚀 Envoi de la branche main…"
git push -u origin main
echo "✅ Terminé : https://github.com/${OWNER}/${REPO}"
