<div align="center">

# 🃏 Pokémon Scanner

**Scannez vos cartes Pokémon et obtenez leur valeur en temps réel grâce à l'IA.**

Pointez la caméra sur une carte → Claude Vision l'identifie → les prix réels, recoupés sur plusieurs sources (Pokémon TCG, JustTCG, Pokémon Price Tracker), s'affichent → tout est sauvegardé dans votre historique et votre collection.

[![Expo SDK 54](https://img.shields.io/badge/Expo-SDK%2054-000020?logo=expo&logoColor=white)](https://expo.dev)
[![React Native](https://img.shields.io/badge/React%20Native-0.81-61DAFB?logo=react&logoColor=white)](https://reactnative.dev)
[![Claude Vision](https://img.shields.io/badge/IA-Claude%20Sonnet%204.6-D97757)](https://anthropic.com)
[![Cloudflare Worker](https://img.shields.io/badge/Proxy-Cloudflare%20Worker-F38020?logo=cloudflare&logoColor=white)](https://workers.cloudflare.com)

</div>

---

## ✨ Fonctionnalités

| | |
|---|---|
| 📷 **Scanner caméra** | Pointez votre téléphone sur une carte, même depuis une photo d'écran (reflets / angle gérés). |
| 🖼️ **Import galerie** | Analysez une carte à partir d'une image existante. |
| 🤖 **Identification IA** | Claude Vision détecte nom, set, numéro, rareté, type, HP, année et condition. |
| 💰 **Prix réels multi-sources** | Cotes recoupées sur Pokémon TCG, JustTCG et Pokémon Price Tracker (TCGplayer/USD, Cardmarket/EUR), avec « meilleur prix » et lien vers la fiche. |
| 📊 **Historique** | Vos 50 derniers scans avec leur valeur estimée. |
| 📚 **Collection** | Marquez les cartes que vous possédez. |
| 🌓 **Thème clair / sombre** | Bascule automatique ou manuelle dans les Réglages. |
| 🔒 **Clés API protégées** | Aucune clé secrète dans l'app : tout passe par un proxy Cloudflare Worker. |

---

## 🏗️ Architecture

```
┌────────────┐   image (base64)    ┌─────────────────────────┐   x-api-key   ┌──────────────────┐
│            │ ──────────────────► │                         │ ────────────► │ api.anthropic.com │
│  App Expo  │                     │  Cloudflare Worker      │               │  (Claude Vision)  │
│  (iPhone / │ ◄────────────────── │  « proxy/ »             │ ◄──────────── └──────────────────┘
│  Android)  │   nom, set, rareté… │  détient les CLÉS       │
│            │                     │  API secrètes           │   X-Api-Key   ┌──────────────────┐
│            │ ──── requête prix ► │                         │ ────────────► │ api.pokemontcg.io │
│            │ ◄──── prix réels ── │                         │ ◄──────────── │   (prix réels)    │
└────────────┘                     └─────────────────────────┘               └──────────────────┘
```

> **Pourquoi un proxy ?** Une clé API embarquée dans un bundle mobile est toujours extractible. Les clés (Anthropic + Pokémon TCG) vivent donc côté serveur, dans un petit Cloudflare Worker gratuit. L'app ne connaît que l'URL publique du Worker — aucun secret.

---

## 📁 Structure du projet

```
pokemon-scanner/
├── App.js                      # Navigation à onglets + ThemeProvider
├── app.json                    # Config Expo (permissions, icône, EAS, updates)
├── babel.config.js
├── .env                        # EXPO_PUBLIC_PROXY_URL (URL du Worker, AUCUN secret)
│
├── src/
│   ├── ThemeContext.js         # Thème clair/sombre + conversion de devise
│   ├── theme.js                # Couleurs, typo, espacements
│   ├── screens/
│   │   ├── ScannerScreen.js    # Caméra + analyse + résultats
│   │   ├── HistoryScreen.js    # Historique des scans
│   │   ├── CollectionScreen.js # Cartes possédées
│   │   └── SettingsScreen.js   # Réglages (thème, devise, infos)
│   ├── components/
│   │   └── CardResultView.js   # Affichage d'une carte identifiée + prix
│   └── services/
│       ├── anthropic.js        # POST proxy /identify → Claude Vision
│       ├── prices.js           # GET proxy /prices  → API Pokémon TCG
│       └── storage.js          # AsyncStorage (historique + collection)
│
└── proxy/                      # Cloudflare Worker — détient les clés secrètes
    ├── src/index.js            # Routes /identify et /prices
    ├── wrangler.toml           # Config du Worker
    └── README.md               # Étapes de déploiement détaillées
```

---

## 🚀 Démarrage rapide

### Prérequis

- **Node.js** LTS — [nodejs.org](https://nodejs.org)
- **Expo Go** sur votre téléphone ([App Store](https://apps.apple.com/app/expo-go/id982107779) / [Play Store](https://play.google.com/store/apps/details?id=host.exp.exponent))
- Un compte **Cloudflare** (gratuit) — pour héberger le proxy
- Une clé **Anthropic** — [console.anthropic.com](https://console.anthropic.com/settings/keys)
- *(optionnel)* une clé **Pokémon TCG** — [dev.pokemontcg.io](https://dev.pokemontcg.io/) (évite le rate limiting)
- *(optionnel)* une clé **JustTCG** — [justtcg.com](https://justtcg.com/) (source de prix supplémentaire)
- *(optionnel)* une clé **Pokémon Price Tracker** — [pokemonpricetracker.com](https://www.pokemonpricetracker.com/) (source de prix supplémentaire)

### 1. Cloner et installer

```powershell
git clone <url-du-repo> pokemon-scanner
cd pokemon-scanner
npm install
```

### 2. Déployer le proxy (clés secrètes)

Le proxy doit être déployé **avant** de lancer l'app. Les étapes complètes sont dans [`proxy/README.md`](proxy/README.md). En résumé :

```powershell
cd proxy
npm install
npx wrangler login                          # connexion à Cloudflare
npx wrangler secret put ANTHROPIC_API_KEY    # colle ta clé sk-ant-...
npx wrangler secret put POKEMONTCG_API_KEY   # colle ta clé Pokémon TCG (optionnel)
npx wrangler secret put JUSTTCG_API_KEY      # colle ta clé JustTCG tcg_... (optionnel)
npx wrangler secret put POKEMONPRICETRACKER_API_KEY  # clé Pokémon Price Tracker (optionnel)
npm run deploy                               # affiche l'URL publique du Worker
```

Notez l'URL affichée, par ex. `https://pokemon-scanner-proxy.<sous-domaine>.workers.dev`.

### 3. Brancher l'app sur le proxy

À la **racine** du projet, créez (ou éditez) le fichier `.env` :

```ini
EXPO_PUBLIC_PROXY_URL=https://pokemon-scanner-proxy.<sous-domaine>.workers.dev
```

### 4. Lancer l'app

```powershell
cd ..
npx expo start -c        # -c vide le cache (utile après un changement de .env)
```

Scannez le QR code affiché avec **Expo Go**.

> ⚠️ Le téléphone et le PC doivent être sur le **même réseau Wi-Fi**. Réseau restrictif ? Utilisez `npx expo start --tunnel`.

---

## 🔐 Variables d'environnement

### App (racine — fichier `.env`)

| Variable | Requis | Description |
|----------|:------:|-------------|
| `EXPO_PUBLIC_PROXY_URL` | ✅ | URL publique du Cloudflare Worker. **Seule** valeur expédiée dans l'app — ne contient aucun secret. Le préfixe `EXPO_PUBLIC_` la rend lisible côté client. |

> `.env` est gitignoré. Aucune clé API ne doit y figurer.

### Proxy (secrets Cloudflare — jamais versionnés)

Définis via `npx wrangler secret put <NOM>` depuis `proxy/` :

| Secret | Requis | Description |
|--------|:------:|-------------|
| `ANTHROPIC_API_KEY` | ✅ | Clé Anthropic (`sk-ant-...`) pour Claude Vision. |
| `POKEMONTCG_API_KEY` | ⚪️ | Clé Pokémon TCG. Facultative — sert uniquement à éviter le rate limiting. |
| `JUSTTCG_API_KEY` | ⚪️ | Clé JustTCG (`tcg_...`). Active la source de prix JustTCG (cotes TCGplayer / USD). |
| `POKEMONPRICETRACKER_API_KEY` | ⚪️ | Clé Pokémon Price Tracker. Active la source TCGplayer (USD) + CardMarket (EUR). |

> Une source dont le secret n'est pas défini est simplement ignorée : l'app affiche les autres cotes disponibles.
>
> Pour le **dev local** du proxy, créez `proxy/.dev.vars` (déjà gitignoré) avec ces variables, puis `npm run dev`.

---

## 🛠️ Commandes

### Application (racine)

| Commande | Action |
|----------|--------|
| `npm install` | Installe les dépendances. |
| `npx expo start` | Lance le serveur de dev (QR code). |
| `npx expo start -c` | Idem, en vidant le cache (après un changement de `.env`). |
| `npx expo start --tunnel` | Lance via un tunnel (réseau Wi-Fi restrictif). |
| `npm run android` | Ouvre directement sur Android. |
| `npm run ios` | Ouvre directement sur iOS (Mac requis). |
| `npm run web` | Lance la version web. |

### Proxy (`cd proxy`)

| Commande | Action |
|----------|--------|
| `npm install` | Installe Wrangler et les dépendances. |
| `npx wrangler login` | Connecte le CLI à votre compte Cloudflare. |
| `npx wrangler secret put <NOM>` | Enregistre une clé secrète chiffrée. |
| `npm run dev` | Lance le Worker en local (utilise `.dev.vars`). |
| `npm run deploy` | Déploie le Worker et affiche son URL publique. |

---

## 🔌 API du proxy

| Méthode | Route | Corps / Paramètres | Cible |
|---------|-------|--------------------|-------|
| `POST` | `/identify` | `{ "image": "<base64>" }` | Claude Vision (`claude-sonnet-4-6`) |
| `GET` | `/prices` | `?q=<requête lucene>&pageSize=20` | API Pokémon TCG |

Le modèle, le prompt et `max_tokens` sont **fixés côté Worker** pour cantonner le proxy au seul cas « identifier une carte Pokémon ».

---

## 🧩 Stack technique

- **[Expo](https://expo.dev)** (SDK 54) + **[React Native](https://reactnative.dev)** 0.81 / **React** 19
- **[React Navigation](https://reactnavigation.org)** — onglets + stack
- **[expo-camera](https://docs.expo.dev/versions/latest/sdk/camera/)**, `expo-image-picker`, `expo-image-manipulator`, `expo-haptics`
- **AsyncStorage** — historique (50 max) et collection en local
- **[Claude API](https://anthropic.com)** — Vision (`claude-sonnet-4-6`)
- **[API Pokémon TCG](https://pokemontcg.io)** — prix TCGplayer / Cardmarket
- **[JustTCG](https://justtcg.com)** + **[Pokémon Price Tracker](https://www.pokemonpricetracker.com)** — sources de prix complémentaires
- **[Cloudflare Workers](https://workers.cloudflare.com)** (Wrangler) — proxy sécurisé

---

## 💸 Coûts

- **Anthropic** : ~0,01–0,03 € par scan. Crédits gratuits offerts aux nouveaux comptes.
- **Pokémon TCG** : gratuit.
- **Cloudflare Workers** : gratuit (plan généreux, largement suffisant ici).

---

## 🩺 Dépannage

| Symptôme | Solution |
|----------|----------|
| **« Network request failed »** | Vérifiez `EXPO_PUBLIC_PROXY_URL` dans `.env` et que le proxy est déployé (`npm run deploy` dans `proxy/`). Relancez `npx expo start -c`. |
| **« URL du proxy manquante »** | Le `.env` est absent ou mal nommé. Recréez-le à la racine, puis relancez avec `-c`. |
| **« Proxy mal configuré : ANTHROPIC_API_KEY manquante »** | Le secret n'a pas été enregistré : `npx wrangler secret put ANTHROPIC_API_KEY` dans `proxy/`, puis `npm run deploy`. |
| **L'app ne s'ouvre pas dans Expo Go** | PC et téléphone sur le même Wi-Fi. Sinon `npx expo start --tunnel`. |
| **« Camera permission denied »** | Réglages du téléphone → Expo Go → Caméra → Autoriser. |
| **Carte non reconnue** | Bon éclairage, carte centrée dans le cadre. Essayez l'import depuis la galerie. |

---