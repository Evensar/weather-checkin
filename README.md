# Weather Check-In & DriftCalc Landing Page

Ett projekt som innehåller både Weather Check-In och en landningssida som länkar till både Weather Check-In och DriftCalc.

## Weather Check-In

Ett enkelt, lekfullt verktyg för att låta deltagare i ett möte checka in med en vädersymbol. Byggt med React + Vite och en liten Socket.IO-server.

## Funktioner
- Alias-inmatning och rums-ID/länk
- Vädersymboler: ☀️ 🌤️ ☁️ 🌧️ ⛈️ (utbyggbart)
- Realtid via Socket.IO (ändra val tills omgången avslutas)
- Resultatvy: anonym summering eller icke-anonym lista
- Ikon-grid och enkel summering
- Exportera som PDF via webbläsarens Skriv ut

## Kom igång

1) Installera Node.js LTS (om saknas). Starta om terminalen efter installation.
2) Installera beroenden:
```bash
npm install
```
3) Kör realtidsservern i ett fönster:
```bash
npm run server
```
4) Kör frontend i ett annat fönster:
```bash
npm run dev
```
5) Öppna appen (Vite visar en lokal URL). Skapa rum och dela länken (hash `#/room/<id>`).

## PDF-export
Använd knappen "Exportera till PDF" och välj "Spara som PDF" i dialogen. Onödiga kontroller döljs automatiskt i utskrift.

## Språk
UI är på svenska i grundläge och kan enkelt översättas.

## Landningssida

Projektet innehåller nu en landningssida som låter användare välja mellan Weather Check-In och DriftCalc. Landningssidan finns i roten av projektet (`/index.html`).

### Struktur

Projektet är strukturerat på följande sätt:
- `/index.html` - Landningssidan som länkar till båda tjänsterna
- `/weather-checkin/` - Weather Check-In-applikationen
- `/build-landing.js` - Script som kopierar landningssidan till dist-mappen under bygget

### Länkar och routing

- Landningssidan länkar till `weather-checkin/` (relativ länk)
- Weather Check-In har en "Tillbaka till startsidan"-länk som pekar på `../../` (upp två nivåer)
- DriftCalc länkas med absolut URL till GitHub Pages

## Bygga och Deploya

För att bygga projektet med landningssidan:

```bash
npm run build
```

Byggprocessen består av följande steg:
1. TypeScript-kompilering (`tsc -b`)
2. Vite-bygge av Weather Check-In-appen (`vite build`)
3. Kopiering av landningssidan till dist-mappen (`node ../build-landing.js`)

Detta kommer att skapa en `dist`-mapp i projektets rot som innehåller både landningssidan och Weather Check-In-applikationen. Landningssidan blir startsidan på GitHub Pages.

För att deploya till GitHub Pages:

```bash
npm run deploy
```

Detta kommer att publicera innehållet i `dist`-mappen till GitHub Pages.

### GitHub Pages-konfiguration

För att säkerställa att landningssidan fungerar korrekt på GitHub Pages:

1. Gå till ditt GitHub-repository
2. Gå till Settings > Pages
3. Under "Source", välj "GitHub Actions" eller "Deploy from a branch"
4. Om du väljer "Deploy from a branch", välj "gh-pages" och "/ (root)"
5. Klicka på "Save"

Efter deployment kommer landningssidan att vara tillgänglig på `https://username.github.io/weather-checkin/` och Weather Check-In-appen kommer att vara tillgänglig på `https://username.github.io/weather-checkin/weather-checkin/`.


This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
