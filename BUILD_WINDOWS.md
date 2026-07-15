# Build Windows

## URL admin de production

Copier le fichier d'exemple :

```bash
cp .env.production.example .env
```

Puis modifier `.env.production` :

```env
GAR_API_URL=https://admin.votre-domaine.com
```

Ne pas ajouter `/api` à la fin : l'application ajoute déjà les routes `/api/desktop/...`.

## Build de l'application

Ce build vérifie TypeScript et génère les fichiers Electron dans `out/` :

```bash
npm run build
```

## Installateur Windows

Pour générer un vrai `.exe` installable, utiliser une machine Windows.
C'est important parce que `better-sqlite3` est un module natif et doit être
reconstruit pour Windows.

Sur Windows :

```powershell
cd desktop
npm ci
copy .env.production.example .env.production
notepad .env.production
npm run build
npm install --save-dev electron-builder
npx electron-builder --win nsis --x64
```

Le fichier installable sortira dans `desktop/dist/`.
