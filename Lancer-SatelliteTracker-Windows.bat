@echo off
rem Lanceur SatelliteTracker (Windows).
rem Laissez cette fenetre ouverte pendant l'utilisation ; la fermer arrete tout.
chcp 65001 >nul
cd /d "%~dp0"

rem Node portable local. Le projet exige Node 24 (voir .nvmrc et "engines").
rem Comme sous macOS/Linux, il ne suffit pas d'installer Node quand il est
rem absent : une version plus ancienne deja presente serait utilisee telle
rem quelle. On verifie donc la version majeure active.
set NODE_VERSION=24.18.0
set NODE_MAJOR=24
if exist "%CD%\.node\node.exe" set "PATH=%CD%\.node;%PATH%"

where npm >nul 2>nul
if errorlevel 1 goto installnode

rem Node est present : sa version majeure est-elle suffisante ?
for /f %%v in ('node -p "process.versions.node.split('.')[0]" 2^>nul') do set ACTIVE_MAJOR=%%v
if not defined ACTIVE_MAJOR set ACTIVE_MAJOR=0
if %ACTIVE_MAJOR% GEQ %NODE_MAJOR% goto nodeok
echo [!] Node.js %NODE_MAJOR% requis - version active trop ancienne, installation portable...

:installnode
echo [..] Installation portable de Node.js %NODE_VERSION% dans le dossier de l'app...
curl -fL -o node-portable.zip https://nodejs.org/dist/v%NODE_VERSION%/node-v%NODE_VERSION%-win-x64.zip
if errorlevel 1 (
  echo [X] Telechargement de Node.js impossible - connexion internet ?
  echo     Alternative : installer Node.js depuis https://nodejs.org puis relancer.
  pause
  exit /b 1
)
tar -xf node-portable.zip
ren node-v%NODE_VERSION%-win-x64 .node
del node-portable.zip
set "PATH=%CD%\.node;%PATH%"
echo [OK] Node.js installe localement dans .node\ - supprimer ce dossier pour desinstaller.

where npm >nul 2>nul
if errorlevel 1 (
  echo [X] Node.js reste introuvable apres l'installation portable.
  pause
  exit /b 1
)
:nodeok
for /f "delims=" %%v in ('node --version') do echo [OK] Node.js %%v

rem Deja lance ? On ouvre juste la page.
curl -s --max-time 2 http://localhost:3001/api/health 2>nul | findstr ok >nul
if not errorlevel 1 (
  echo [OK] SatelliteTracker tourne deja - ouverture de la page.
  start "" http://localhost:5173
  exit /b 0
)

echo [1/3] Verification des dependances...
if not exist node_modules\.bin\vite.cmd goto installdeps
if not exist node_modules\.bin\tsc.cmd goto installdeps
if not exist node_modules\cesium goto installdeps
echo [OK] Dependances deja installees - node_modules complet.
goto depsok
:installdeps
echo [..] Dependances manquantes ou incompletes - installation, quelques minutes...
echo      Cesium et ses textures representent l'essentiel du telechargement.
call npm install
echo [OK] Dependances installees.
:depsok

echo [2/3] Demarrage de SatelliteTracker...
start /b cmd /c "npm run dev"

echo [3/3] Preparation en cours - compilation du serveur, recuperation des elements orbitaux...
set /a tries=0
:wait
set /a tries+=1
curl -s --max-time 2 http://localhost:3001/api/health 2>nul | findstr ok >nul && goto ready
if %tries% geq 90 goto ready
timeout /t 1 /nobreak >nul
goto wait

:ready
start "" http://localhost:5173
echo.
echo [OK] SatelliteTracker est ouvert : http://localhost:5173
echo      Le premier affichage telecharge ~11 000 jeux d'elements orbitaux.
echo      Laissez cette fenetre ouverte pendant l'utilisation.
echo      Pour arreter : fermez cette fenetre.
pause >nul
