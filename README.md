<div align="center">

# 🃏 Pokémon Scanner

**Scannez vos cartes Pokémon, obtenez leur cote de marché et bâtissez votre collection — en temps réel, grâce à l'IA.**

Pointez la caméra sur une carte → Claude Vision l'identifie → les prix réels (Cardmarket en EUR ou TCGplayer en USD) s'affichent → la carte est archivée dans votre historique et rangée automatiquement dans votre album, set par set.

[![Expo SDK 54](https://img.shields.io/badge/Expo-SDK%2054-000020?logo=expo&logoColor=white)](https://expo.dev)
[![React Native](https://img.shields.io/badge/React%20Native-0.81-61DAFB?logo=react&logoColor=white)](https://reactnative.dev)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)](https://react.dev)
[![Claude Vision](https://img.shields.io/badge/IA-Claude%20Sonnet%204.6-D97757)](https://anthropic.com)
[![Cloudflare Worker](https://img.shields.io/badge/Proxy-Cloudflare%20Worker-F38020?logo=cloudflare&logoColor=white)](https://workers.cloudflare.com)

</div>

---

## ✨ Fonctionnalités

| | |
|---|---|
| 📷 **Scanner caméra** | Pointez votre téléphone sur une carte — y compris une photo d'écran (reflets, moiré et angle gérés). |
| 🖼️ **Import galerie** | Analysez une carte à partir d'une image déjà présente sur l'appareil. |
| 🤖 **Identification IA** | Claude Vision détecte le nom (FR + EN), le set, le numéro, la rareté, le type, les HP, l'année et la condition. |
| 💰 **Cotes réelles** | Prix issus de l'API Pokémon TCG — Cardmarket (EUR) ou TCGplayer (USD) selon la devise réglée — avec lien vers la fiche marchande. |
| 🗂️ **Collection par set** | Chaque carte reconnue est rangée dans l'album de son set officiel, sur une grille numérotée `1..total` où les emplacements vides restent visibles. |
| 📊 **Historique** | Vos 50 derniers scans avec leur valeur estimée, consultables et effaçables. |
| 🌓 **Thème clair / sombre** | Suivi automatique du système ou bascule manuelle. |
| 🇫🇷 **Interface française** | Conditions et types traduits à l'affichage ; la donnée brute reste en anglais pour la recherche de prix. |
| 🔒 **Zéro secret embarqué** | Aucune clé API dans l'app : tout transite par un proxy Cloudflare Worker. |

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

> **Pourquoi un proxy ?** Une clé API embarquée dans un bundle mobile est toujours extractible. Les clés (Anthropic + Pokémon TCG) vivent donc côté serveur, dans un Cloudflare Worker gratuit. L'app ne connaît que l'URL publique du Worker — aucun secret n'est expédié dans le bundle. Le modèle, le prompt et `max_tokens` sont eux aussi fixés côté Worker pour cantonner le proxy au seul usage « identifier une carte Pokémon ».

### Du scan à la collection

1. **Capture** — la caméra (ou la galerie) produit une image, compressée puis encodée en base64.
2. **Identification** — `POST /identify` relaie l'image à Claude Vision, qui renvoie un JSON structuré (nom, set, numéro, rareté…).
3. **Cotation** — `GET /prices` interroge l'API Pokémon TCG. Un moteur de correspondance (`services/prices.js`) classe les résultats par signaux **indépendants de la langue** (total imprimé, code de set, année) pour retenir l'**édition exacte**.
4. **Archivage** — le scan rejoint l'historique. Si — et seulement si — l'édition a été **confirmée**, la carte est rangée dans la collection avec l'identité officielle de son set.

> **Correspondance prudente.** L'IA renvoie souvent le nom en français tandis que l'API est en anglais. Une édition n'est « confirmée » que si un signal fort (total imprimé **ou** code de set) est présent **et** qu'aucune autre édition n'est à égalité. À défaut, le lien direct est masqué (au profit d'une recherche pré-remplie) et la carte n'entre pas dans la collection — pour ne jamais afficher la mauvaise carte.

---

## 📁 Structure du projet

```
pokemon-scanner/
├── App.js                       # Navigation à onglets (Scanner · Historique · Collection · Réglages)
├── app.json                     # Config Expo (permissions, icône, EAS, updates)
├── babel.config.js
├── .env                         # EXPO_PUBLIC_PROXY_URL (URL du Worker — AUCUN secret)
│
├── src/
│   ├── ThemeContext.js          # Thème clair/sombre + devise + formatage des prix
│   ├── theme.js                 # Couleurs, typo, espacements, ombres
│   ├── screens/
│   │   ├── ScannerScreen.js     # Caméra + analyse + résultats
│   │   ├── HistoryScreen.js     # Historique des scans
│   │   ├── CollectionScreen.js  # Album par set (grille numérotée)
│   │   └── SettingsScreen.js    # Réglages (thème, devise, aide)
│   ├── components/
│   │   └── CardResultView.js    # Fiche d'une carte identifiée + prix
│   ├── services/
│   │   ├── anthropic.js         # POST proxy /identify → Claude Vision
│   │   ├── prices.js            # GET proxy /prices  → API Pokémon TCG + moteur de correspondance
│   │   └── storage.js           # AsyncStorage (historique + collection)
│   └── utils/
│       ├── collection.js        # Identité de set / d'emplacement (dédoublonnage)
│       └── translations.js      # Traductions FR (conditions, types, dates)
│
└── proxy/                       # Cloudflare Worker — détient les clés secrètes
    ├── src/index.js             # Routes /identify et /prices
    ├── wrangler.toml            # Config du Worker
    └── README.md                # Étapes de mise en place du proxy
```

---

## 🚀 Démarrage rapide

### Prérequis

- **Node.js** LTS — [nodejs.org](https://nodejs.org)
- **Expo Go** sur votre téléphone ([App Store](https://apps.apple.com/app/expo-go/id982107779) · [Play Store](https://play.google.com/store/apps/details?id=host.exp.exponent))
- Un compte **Cloudflare** (gratuit) — pour héberger le proxy
- Une clé **Anthropic** — [console.anthropic.com](https://console.anthropic.com/settings/keys)
- *(optionnel)* une clé **Pokémon TCG** — [dev.pokemontcg.io](https://dev.pokemontcg.io/) (évite le rate limiting)

### 1. Cloner et installer

```powershell
git clone <url-du-repo> pokemon-scanner
cd pokemon-scanner
npm install
```

### 2. Mettre en place le proxy (clés secrètes)

Le proxy héberge les clés et doit être en ligne **avant** de lancer l'app. Détails dans [`proxy/README.md`](proxy/README.md) ; en résumé :

```powershell
cd proxy
npm install
npx wrangler login                          # connexion à Cloudflare
npx wrangler secret put ANTHROPIC_API_KEY    # colle ta clé sk-ant-...
npx wrangler secret put POKEMONTCG_API_KEY   # optionnel (rate limiting)
npm run deploy                               # affiche l'URL publique du Worker
```

Notez l'URL affichée, p. ex. `https://pokemon-scanner-proxy.<sous-domaine>.workers.dev`.

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

> ⚠️ Le téléphone et le PC doivent être sur le **même réseau Wi-Fi**. Sur un réseau restrictif, utilisez `npx expo start --tunnel`.

---

## 🔐 Variables d'environnement

### App (racine — fichier `.env`)

| Variable | Requis | Description |
|----------|:------:|-------------|
| `EXPO_PUBLIC_PROXY_URL` | ✅ | URL publique du Cloudflare Worker. **Seule** valeur expédiée dans l'app — aucun secret. Le préfixe `EXPO_PUBLIC_` la rend lisible côté client. |

> `.env` est gitignoré. Aucune clé API ne doit y figurer.

### Proxy (secrets Cloudflare — jamais versionnés)

Définis via `npx wrangler secret put <NOM>` depuis `proxy/` :

| Secret | Requis | Description |
|--------|:------:|-------------|
| `ANTHROPIC_API_KEY` | ✅ | Clé Anthropic (`sk-ant-...`) pour Claude Vision. |
| `POKEMONTCG_API_KEY` | ⚪️ | Clé Pokémon TCG. Facultative — sert uniquement à éviter le rate limiting. |

> Pour le **dev local** du proxy, créez `proxy/.dev.vars` (gitignoré) avec ces variables, puis `npm run dev`.
> Si aucune cote n'est trouvée, l'app affiche une **estimation indicative** basée sur la rareté (marquée comme telle).

---

## 🔌 API du proxy

| Méthode | Route | Corps / Paramètres | Cible |
|---------|-------|--------------------|-------|
| `POST` | `/identify` | `{ "image": "<base64>" }` | Claude Vision (`claude-sonnet-4-6`) |
| `GET` | `/prices` | `?q=<requête lucene>&pageSize=20` | API Pokémon TCG |

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

## 🧩 Stack technique

- **[Expo](https://expo.dev)** (SDK 54) + **[React Native](https://reactnative.dev)** 0.81 / **[React](https://react.dev)** 19
- **[React Navigation](https://reactnavigation.org)** — navigation à onglets
- **[expo-camera](https://docs.expo.dev/versions/latest/sdk/camera/)**, `expo-image-picker`, `expo-image-manipulator`, `expo-media-library`, `expo-haptics`
- **[AsyncStorage](https://react-native-async-storage.github.io/async-storage/)** — historique (50 max) et collection, en local
- **[Claude API](https://anthropic.com)** — Vision (`claude-sonnet-4-6`)
- **[API Pokémon TCG](https://pokemontcg.io)** — cotes Cardmarket (EUR) / TCGplayer (USD)
- **[Cloudflare Workers](https://workers.cloudflare.com)** (Wrangler) — proxy sécurisé

---

## 💸 Coûts

| Service | Coût |
|---------|------|
| **Anthropic** | ~0,01–0,03 € par scan (crédits gratuits offerts aux nouveaux comptes). |
| **Pokémon TCG** | Gratuit. |
| **Cloudflare Workers** | Gratuit (le plan gratuit couvre très largement cet usage). |

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
| **Carte absente de la collection** | Normal si l'édition n'a pas pu être confirmée : la carte reste dans l'historique mais n'entre dans l'album que lorsque son set officiel est certain. |

---

<div align="center">

**Pokémon Scanner** · v1.0.0

</div>
