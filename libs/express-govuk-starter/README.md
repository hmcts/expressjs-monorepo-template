# @hmcts-cft/express-govuk-starter

GOV.UK Frontend integration for Express 5 — Nunjucks, Helmet CSP, i18n, cookie consent, asset handling, and error handlers with sensible defaults.

## Installation

```bash
yarn add @hmcts-cft/express-govuk-starter
```

Peer dependencies: `express`, `govuk-frontend`, `helmet`, `nunjucks`, `@hmcts/cookie-manager`.

## Quick start

```typescript
import {
  configureGovuk,
  configureHelmet,
  configureNonce,
  configureCookieManager,
  errorHandler,
  notFoundHandler
} from "@hmcts-cft/express-govuk-starter";

const app = express();

app.use(configureNonce());
app.use(configureHelmet());

await configureGovuk(app, [__dirname], {
  assetOptions: { distPath: path.join(__dirname, "../dist") }
});

await configureCookieManager(app, {
  categories: {
    essential: ["connect.sid"],
    analytics: ["_ga", "_gid"]
  }
});

app.use(notFoundHandler());
app.use(errorHandler());
```

## API

### `configureGovuk(app, paths, options)`

Sets up Nunjucks with GOV.UK Frontend views, registers template filters, configures assets, and loads i18n translations.

- **`paths`** — array of module paths (typically `[__dirname]`). The library discovers `pages/` subdirectories for Nunjucks views and `locales/` for translations.
- **`options.assetOptions`** — how to serve static assets (see below).
- **`options.nunjucksGlobals`** — additional Nunjucks globals (e.g. GTM config).

Returns the configured `nunjucks.Environment`.

### `AssetOptions`

A discriminated union controlling how assets are served:

```typescript
type AssetOptions =
  | { distPath: string }
  | { entries: Record<string, string>; viteConfigFile: string };
```

**Production** — pass `{ distPath }`. The library mounts `express.static` at `/assets` and reads the Vite manifest to set Nunjucks globals (e.g. `{{ index_js }}`, `{{ index_css }}`) to hashed filenames.

**Development** — pass `{ entries, viteConfigFile }`. The library creates a Vite dev server in middleware mode, mounts it on the Express app (enabling HMR for CSS), serves GOV.UK fonts/images statically, and sets Nunjucks globals to the source paths in `entries`.

```typescript
// Example
const isDev = process.env.NODE_ENV !== "production";

assetOptions: isDev
  ? {
      entries: {
        index_js: "/src/assets/js/index.ts",
        index_css: "/src/assets/css/index.scss"
      },
      viteConfigFile: path.join(__dirname, "../vite.build.ts")
    }
  : { distPath: path.join(__dirname, "../dist") }
```

### `configureNonce()`

Middleware that generates a per-request CSP nonce and stores it in `res.locals.cspNonce`.

### `configureHelmet(options?)`

Returns Helmet middleware configured for GOV.UK services with CSP directives for nonces, Google Tag Manager, and Vite HMR websocket (in development).

Options:
- `enableGoogleTagManager` — include GTM script/connect sources (default: `true`)
- `isDevelopment` — allow Vite HMR websocket connections (default: `NODE_ENV !== "production"`)

### `configureCookieManager(app, options)`

Sets up GDPR cookie consent with `@hmcts/cookie-manager`. Adds the cookie preferences page and banner.

Options:
- `categories` — map of category names to cookie name arrays
- `preferencesPath` — URL path for the preferences page (default: `/cookies`)

### `errorHandler()` / `notFoundHandler()`

Express error and 404 handlers that render GOV.UK-styled error pages.

### `localeMiddleware()` / `translationMiddleware(translations)`

i18n middleware for bilingual (English/Welsh) support. Reads `?lng=` query param and provides `t()` helper in templates.

### `getTranslation(translations, key, locale)` / `loadTranslations(paths)`

Utilities for loading and retrieving translations from `locales/en.ts` and `locales/cy.ts` files.

## Nunjucks layouts

The library provides two layouts that extend `govuk/template.njk`:

- **`layouts/default.njk`** — two-thirds column width
- **`layouts/full-width.njk`** — full width

Both include the GOV.UK header, footer, phase banner, analytics, and asset tags. In development, they inject the Vite HMR client for CSS hot-reload.

Use the `page_content` block for page body:

```njk
{% extends "layouts/default.njk" %}

{% block page_content %}
  <h1 class="govuk-heading-l">{{ title }}</h1>
{% endblock %}
```

## Nunjucks globals

The following globals are available in all templates:

| Global | Description |
|--------|-------------|
| `isProduction` | `true` when `NODE_ENV === "production"` |
| `index_js`, `index_css`, ... | Asset paths (hashed in production, source paths in dev) |
| `pageUrl` | Current request path |
| `serviceUrl` | Full service URL (protocol + host) |
| Any key from `nunjucksGlobals` | Custom globals passed via options |

## Nunjucks filters

| Filter | Description |
|--------|-------------|
| `date` | Format a date |
| `time` | Format a time |
| `currency` | Format a currency value |
| `kebabCase` | Convert string to kebab-case |
| `govukErrorSummary` | Format errors for the GOV.UK error summary component |
