# 🃏 Pokémon Scanner

App iPhone pour scanner et valoriser vos cartes Pokémon en temps réel grâce à l'IA Claude.

---

## Fonctionnalités

- 📷 **Scanner par caméra** — pointez votre iPhone sur une carte
- 🖼️ **Import photo** — analysez depuis votre galerie
- 🤖 **IA Claude Vision** — identification du nom, set, numéro, rareté
- 💰 **Prix en temps réel** — TCGPlayer (USD), Cardmarket (EUR), eBay
- 📊 **Historique** — toutes vos cartes sauvegardées avec leur valeur

---

## Installation sur Windows (sans Mac)

### Étape 1 — Prérequis

1. **Node.js** : téléchargez sur [nodejs.org](https://nodejs.org) (version LTS)
2. **Expo Go** : installez sur votre iPhone depuis l'App Store

### Étape 2 — Installer les dépendances

Ouvrez **PowerShell** ou **CMD** dans le dossier du projet :

```powershell
cd pokemon-scanner
npm install
```

### Étape 3 — Déployer le proxy (qui détient les clés secrètes)

> 🔒 **Important** : les clés API ne sont **jamais** placées dans l'app. Une
> clé embarquée dans un bundle mobile est toujours extractible. Elles vivent
> côté serveur, dans un petit proxy Cloudflare Worker (gratuit).

1. Suivez les étapes de [`proxy/README.md`](proxy/README.md) pour déployer le
   Worker et y enregistrer vos clés Anthropic et Pokémon TCG.
2. Copiez `.env.example` en `.env` :
   ```powershell
   copy .env.example .env
   ```
3. Dans `.env`, mettez l'URL de votre Worker (affichée après le déploiement) :
   ```
   EXPO_PUBLIC_PROXY_URL=https://pokemon-scanner-proxy.VOTRE-SOUS-DOMAINE.workers.dev
   ```

### Étape 4 — Lancer l'app

```powershell
npx expo start
```

Un QR code s'affiche dans le terminal.

### Étape 5 — Ouvrir sur votre iPhone

1. Ouvrez l'app **Expo Go** sur votre iPhone
2. Scannez le QR code affiché dans le terminal
3. L'app se charge sur votre iPhone ! 🎉

> ⚠️ Votre iPhone et votre PC doivent être **sur le même réseau Wi-Fi**

---

## Structure du projet

```
pokemon-scanner/
├── App.js                    # Navigation principale
├── app.json                  # Config Expo
├── .env.example              # Template (URL du proxy, aucun secret)
├── proxy/                    # Cloudflare Worker — détient les clés secrètes
│   ├── src/index.js          # Proxy /identify (Claude) + /prices (Pokémon TCG)
│   ├── wrangler.toml         # Config du Worker
│   └── README.md             # Étapes de déploiement
├── src/
│   ├── screens/
│   │   ├── ScannerScreen.js  # Caméra + analyse + résultats
│   │   ├── HistoryScreen.js  # Historique des scans
│   │   └── SettingsScreen.js # Réglages + infos
│   ├── services/
│   │   ├── anthropic.js      # Appel du proxy -> Claude Vision
│   │   ├── prices.js         # Appel du proxy -> Pokémon TCG
│   │   └── storage.js        # Sauvegarde locale historique
│   └── theme.js              # Couleurs, typographie, espacements
```

---

## Comment ça marche

```
iPhone Camera
     ↓
Image (base64)
     ↓
Proxy Cloudflare Worker  (détient les clés secrètes)
     ↓
Claude Vision (claude-sonnet-4-6)
→ Identifie : nom, set, numéro, rareté, HP, condition
     ↓
Proxy → API Pokémon TCG
→ Prix réels TCGplayer (USD) / Cardmarket (EUR) + URL de la fiche
     ↓
Affichage des prix + meilleure offre
     ↓
Sauvegarde dans l'historique local
```

---

## Clés API

- Les clés vivent **uniquement** dans le proxy (Cloudflare Worker), jamais dans l'app.
- Anthropic : [console.anthropic.com](https://console.anthropic.com/settings/keys) — ~0.01–0.03 € par scan, crédits gratuits offerts aux nouveaux comptes.
- Pokémon TCG : [dev.pokemontcg.io](https://dev.pokemontcg.io/) — gratuite, évite le rate limiting.
- Déploiement et enregistrement des clés : voir [`proxy/README.md`](proxy/README.md).

---

## Dépannage

**"Network request failed"**
→ Vérifiez que `EXPO_PUBLIC_PROXY_URL` est correct dans `.env` et que le proxy est bien déployé (`npm run deploy` dans `proxy/`)

**L'app ne s'ouvre pas dans Expo Go**
→ Vérifiez que le PC et l'iPhone sont sur le même Wi-Fi
→ Essayez `npx expo start --tunnel` si le réseau est restrictif

**"Camera permission denied"**
→ Allez dans Réglages iPhone > Expo Go > Caméra > Autoriser

**La carte n'est pas reconnue**
→ Assurez-vous d'avoir un bon éclairage
→ Centrez bien la carte dans le cadre
→ Essayez avec une photo importée depuis la galerie

---

## Technologies

- [Expo](https://expo.dev) — framework React Native
- [Claude API](https://anthropic.com) — IA Vision + Web Search
- [React Navigation](https://reactnavigation.org) — navigation
- [expo-camera](https://docs.expo.dev/versions/latest/sdk/camera/) — accès caméra
- AsyncStorage — stockage local
