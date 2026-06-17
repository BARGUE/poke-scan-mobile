# Proxy Pokémon Scanner (Cloudflare Worker)

Ce petit serveur détient les clés API **secrètes** (Anthropic + Pokémon TCG).
L'app mobile n'appelle que ce Worker : les clés ne quittent jamais le serveur,
donc on ne peut plus les extraire du bundle de l'app.

```
App  ──(image / requête)──►  Worker (clés secrètes)  ──►  api.anthropic.com
App  ◄────(résultat)─────────  Worker  ◄──────────────────  api.pokemontcg.io
```

## Déploiement (une seule fois, ~5 min)

> Tout se fait depuis le dossier `proxy/`.

### 1. Installer les dépendances

```powershell
cd proxy
npm install
```

### 2. Se connecter à Cloudflare

Crée un compte gratuit sur [dash.cloudflare.com](https://dash.cloudflare.com) si
besoin, puis :

```powershell
npx wrangler login
```

### 3. Enregistrer les clés comme secrets chiffrés

> ⚠️ Utilise une **NOUVELLE** clé Anthropic (révoque l'ancienne sur
> [console.anthropic.com](https://console.anthropic.com/settings/keys) — elle a
> été exposée).

```powershell
npx wrangler secret put ANTHROPIC_API_KEY
# colle ta nouvelle clé sk-ant-... puis Entrée

npx wrangler secret put POKEMONTCG_API_KEY
# colle ta clé Pokémon TCG puis Entrée
```

### 4. Déployer

```powershell
npm run deploy
```

Wrangler affiche l'URL publique du Worker, par ex. :

```
https://pokemon-scanner-proxy.TON-SOUS-DOMAINE.workers.dev
```

### 5. Brancher l'app sur le proxy

Dans le fichier `.env` **à la racine du projet** (pas dans `proxy/`), mets cette
URL :

```
EXPO_PUBLIC_PROXY_URL=https://pokemon-scanner-proxy.TON-SOUS-DOMAINE.workers.dev
```

Puis relance Expo (`npx expo start -c` pour vider le cache). C'est tout : aucune
clé secrète ne se trouve plus dans l'app.

## Développement local

```powershell
# Pour tester en local, crée un fichier proxy/.dev.vars (déjà gitignoré) :
#   ANTHROPIC_API_KEY=sk-ant-...
#   POKEMONTCG_API_KEY=...
npm run dev
```

## Routes

| Méthode | Route       | Corps / paramètres                  | Cible              |
|---------|-------------|-------------------------------------|--------------------|
| `POST`  | `/identify` | `{ "image": "<base64>" }`           | Claude Vision      |
| `GET`   | `/prices`   | `?q=<requête lucene>&pageSize=20`   | Pokémon TCG API    |
