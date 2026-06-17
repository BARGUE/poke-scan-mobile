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

### Étape 3 — Configurer votre clé API

1. Créez un compte sur [console.anthropic.com](https://console.anthropic.com)
2. Générez une clé API dans Settings > API Keys
3. Copiez `.env.example` en `.env` :
   ```powershell
   copy .env.example .env
   ```
4. Ouvrez `.env` et remplacez `sk-ant-votre-cle-ici` par votre vraie clé

> **Alternative** : entrez votre clé directement dans l'app via l'onglet Réglages

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
├── .env.example              # Template variables d'environnement
├── src/
│   ├── screens/
│   │   ├── ScannerScreen.js  # Caméra + analyse + résultats
│   │   ├── HistoryScreen.js  # Historique des scans
│   │   └── SettingsScreen.js # Clé API + infos
│   ├── services/
│   │   ├── anthropic.js      # Appels API Claude (Vision + Web Search)
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
Claude Vision (claude-sonnet-4-6)
→ Identifie : nom, set, numéro, rareté, HP, condition
     ↓
Claude + Web Search
→ Cherche les prix sur TCGPlayer, Cardmarket, eBay
     ↓
Affichage des prix + meilleure offre
     ↓
Sauvegarde dans l'historique local
```

---

## Clé API

- Obtenez votre clé sur [console.anthropic.com](https://console.anthropic.com/settings/keys)
- Coût approximatif : ~0.01–0.03 € par scan
- Les nouveaux comptes Anthropic reçoivent des crédits gratuits

---

## Dépannage

**"Network request failed"**
→ Vérifiez que votre clé API est correcte dans `.env` ou dans Réglages

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
