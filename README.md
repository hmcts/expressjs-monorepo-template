# HMCTS Express Monorepo Template

Production-ready Node.js starter with cloud-native capabilities for building HMCTS digital services using Express.js, TypeScript and GOV.UK Design System.

## 🚀 Overview

This template provides everything you need to create accessible, secure, and scalable applications that meet GDS and HMCTS standards.

## 📋 Using This Template

This monorepo will contain all your apps, libraries, and infrastructure for your HMCTS service.

### Naming Convention

- **Team name**: Your HMCTS service (e.g., CaTH, Divorce, Civil)
- **Product name**: The specific product/service (e.g., Possessions, Money-Claims)
- If the product encompasses the whole service, use "Service"

**Examples:**
- Team: CaTH, Product: Service → `cath-service`
- Team: Civil, Product: Money-Claims → `civil-money-claims`

### Setup Steps

1. **Run the initialization script**:
```bash
./.github/scripts/init.sh
```

The script will:
- Prompt for your team name (e.g., `CaTH`)
- Prompt for your product name (e.g., `Service`)
- Replace all template values throughout the codebase
- Rebuild the yarn lockfile
- Run tests to verify everything works
- Remove itself after completion

3. **Review and commit**:
```bash
git add .
git commit -m "Initialize from template"
git push
```

## ✨ Key Features

### Cloud Native Platform
- **Health Checks**: Configurable health endpoints with readiness and liveness probes for Kubernetes deployments
- **Properties Volume**: Secure configuration management through mounted volumes with automatic environment variable injection
- **Azure Integration**: Built-in support for Azure Key Vault secrets management and properties volume mounting
- **Application Insights**: Comprehensive monitoring with Azure Application Insights including custom metrics and distributed tracing

### Express GOV.UK Starter for frontends
- **GOV.UK Design System**: Fully integrated GOV.UK Frontend with Nunjucks templates and automatic asset compilation
- **Internationalization**: Welsh language support with locale middleware and translation management system
- **Security Headers**: Pre-configured Helmet.js with CSP, HSTS, and nonce-based script protection
- **Asset Pipeline**: Vite-powered asset compilation with SCSS support and production optimization
- **Cookie Management**: Built-in support for cookie consent
- **Session Handling**: Session management using Redis or Postgres

### Simple Router  
A lightweight file-system router for Express applications, inspired by Next.js routing.

- **File-based Routing**: Maps files in directories to Express routes automatically
- **Dynamic Parameters**: Support for dynamic route segments using `[param]` syntax (e.g., `/users/[id]`)
- **HTTP Method Exports**: Export handlers for any HTTP method (GET, POST, PUT, DELETE, etc.)
- **Middleware Support**: Single handlers or arrays of middleware for complex request pipelines
- **Multiple Mount Points**: Mount different directories with different URL prefixes
- **Zero Dependencies**: Lightweight implementation with no external dependencies

### Monorepo Architecture
- Single repository for multiple applications (e.g. multiple frontends sharing common code, APIs or libraries)
- Workspace-based structure with Yarn workspaces
- Shared libraries for common functionality
- Testing with Vitest and Playwright
- Helm charts for Kubernetes deployment
- GitHub Actions CI/CD pipeline
- Biome for fast linting and formatting

## Project Structure

```
expressjs-monorepo-template/
├── apps/                       # Deployable applications
│   ├── api/                    # REST API server (Express 5.x)
│   ├── crons/                  # Cron jobs
│   ├── postgres/               # Migration runner + Prisma S
│   └── web/                    # Web frontend (Express 5.x + Nunjucks)
├── libs/                       # Modular packages (explicitly registered)
│   ├── cloud-native-platform/  # Cloud Native Platform features
│   ├── express-gov-uk-starter/ # GOV.UK Frontend integration
│   ├── postgres-prisma/        # Database client (Prisma)
│   ├── simple-router/          # Simple Router features
│   └── [your-module]/          # Your feature modules
│       └── src/
│           ├── pages/          # Page routes (imported in web app)
│           ├── routes/         # API routes (imported in API app)
│           ├── prisma/         # Prisma schema
│           ├── locales/        # Translations (loaded by govuk-starter)
│           └── assets/         # Module assets (compiled by vite)
├── e2e-tests/                  # End-to-end tests (Playwright)
├── docs/                       # Documentation and ADRs
├── helm/                       # Helm charts for Kubernetes deployment
└── package.json                # Root configuration
```

## 🏁 Getting Started

### Prerequisites

- Node.js 22+
- Yarn 4+
- Docker (optional, for PostgreSQL)

### Quick Setup

```bash
# Install dependencies
yarn install

# Run development server
yarn dev
```

### Services

| Service | URL | Description |
|---------|-----|-------------|
| Web Application | http://localhost:3000 | Main web interface with GOV.UK styling |
| API Server | http://localhost:3001 | REST API backend |
| Prisma Studio | http://localhost:5555 | Database management UI |


## 📦 Development

### Available Commands

```bash
# Development
yarn dev                        # Start all services concurrently

# Testing
yarn test                       # Run all tests across workspaces
yarn test:e2e                   # Playwright E2E tests
yarn test:coverage              # Generate coverage report

# Code Quality
yarn lint:fix                    # Run Biome linter
yarn format                     # Format code with Biome

# Database Operations
yarn db:migrate                 # Apply migrations  
yarn db:migrate:dev             # Auto apply migrations, add new migrations if necessary
yarn db:generate                # Generate the Prisma client
yarn db:studio                  # Open Prisma Studio
yarn db:drop                    # Drop all tables and reset the database
```

### Creating a New Feature Module

Feature libs under `libs/` hold **pure domain logic** — services, queries, validation, navigation. Pages, route handlers, and assets live in the consuming apps (`apps/web/src/pages/`, `apps/api/src/routes/`, `apps/web/src/assets/`). Prisma schemas live in `libs/postgres-prisma/prisma/schema/`. There is no per-module registration metadata; apps import named functions directly.

1. **Create the lib**:
```bash
mkdir -p libs/my-feature/src/my-feature
cd libs/my-feature
```

2. **`package.json`**:
```json
{
  "name": "@hmcts/my-feature",
  "version": "1.0.0",
  "type": "module",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "test": "vitest run",
    "test:watch": "vitest watch",
    "format": "biome format --write .",
    "lint": "biome check .",
    "lint:fix": "biome check --write ."
  },
  "peerDependencies": {
    "express": "^5.1.0"
  }
}
```

3. **`tsconfig.json`**:
```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true,
    "declarationMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["**/*.test.ts", "dist", "node_modules"]
}
```

4. **Add a path mapping in the root `tsconfig.json`** (used by IDE/tsserver):
```json
{
  "compilerOptions": {
    "paths": {
      "@hmcts/my-feature": ["libs/my-feature/src"]
    }
  }
}
```

5. **Write the domain code** under `src/my-feature/` — typically `service.ts`, `queries.ts`, `validation.ts`, with co-located `*.test.ts` files. Re-export from `src/index.ts`:
```typescript
export * from "./my-feature/service.js";
export * from "./my-feature/queries.js";
export * from "./my-feature/validation.js";
```

6. **Add the lib as a dependency** of each consuming app:
```jsonc
// apps/web/package.json (or apps/api/package.json)
"dependencies": {
  "@hmcts/my-feature": "workspace:*"
}
```
Then run `yarn install` from the repo root.

7. **Use it from the apps** with named imports:
```typescript
// apps/api/src/routes/my-feature/index.ts
import { createMyFeature } from "@hmcts/my-feature";

export const POST = async (req, res) => {
  const result = await createMyFeature(req.body);
  res.status(201).json(result);
};
```

That's it — no further wiring. `turbo run dev` picks the new lib up automatically and runs its `tsc --watch`; the apps' nodemon watches `../../libs/*/dist` so they restart whenever the lib emits.

#### If the feature needs database tables

Add a Prisma model file under `libs/postgres-prisma/prisma/schema/`:
```
libs/postgres-prisma/prisma/schema/my-feature.prisma
```
Prisma's multi-file schema picks it up automatically. While `yarn dev` is running, saving a `.prisma` file regenerates the Prisma client and triggers an app restart — no manual step needed for the client side. When you're ready to land the schema change, run `yarn db:migrate:dev` to create + apply the migration (this stays a deliberate step so you control the migration name).

#### If the feature needs pages or static assets

Pages, templates, and assets are **app-scoped**, not lib-scoped:
- **Web pages** — `apps/web/src/pages/my-feature/(group)/page.{ts,njk}`. `simple-router` discovers them; `(group)` segments don't appear in the URL.
- **API routes** — `apps/api/src/routes/my-feature/[id].ts` (dynamic) or `apps/api/src/routes/my-feature/index.ts`.
- **SCSS/JS bundles** — `apps/web/src/assets/css/my-feature.scss`, `apps/web/src/assets/js/my-feature.ts`. Vite picks them up from `apps/web/src/assets/`.

Each handler imports its lib's domain functions directly (`import { … } from "@hmcts/my-feature"`).

## 🧪 Testing Strategy

| Type | Tool | Location | Purpose |
|------|------|----------|---------|
| **Unit Tests** | Vitest | Co-located `*.test.ts` | Business logic validation |
| **E2E Tests** | Playwright | `e2e-tests/` | User journey validation |
| **Accessibility Tests** | Axe-core + Playwright | `e2e-tests/` | WCAG 2.1 AA compliance |

```bash
# Run specific test suites
yarn test                   # Unit tests
yarn test:e2e               # E2E tests
yarn test:coverage          # Coverage report
```

## Security

The GitHub Action pipelines contain a number of security checks, including:

- **Dependency Scanning**: Automatically scans for vulnerabilities in dependencies
- **SonarQube**: SAST analysis for code quality and security
- **Claude Security Scans**: Claude AI-powered security scans for code vulnerabilities

## License

MIT
