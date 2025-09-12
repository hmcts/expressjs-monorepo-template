# HMCTS Express Monorepo Template

Production-ready Node.js starter with cloud-native capabilities for building HMCTS digital services using Express.js, TypeScript and GOV.UK Design System.

## 🚀 Overview

This template provides everything you need to create accessible, secure, and scalable applications that meet GDS and HMCTS standards.

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
- Docker multi-stage builds for production
- Helm charts for Kubernetes deployment
- GitHub Actions CI/CD pipeline
- Biome for fast linting and formatting

## Project Structure

```
expressjs-monorepo-template/
├── apps/                       # Deployable applications
│   ├── api/                    # REST API server (Express 5.x)
│   ├── web/                    # Web frontend (Express 5.x + Nunjucks)
│   └── postgres/               # Database configuration (Prisma)
├── libs/                       # Modular packages (auto-discovered)
│   ├── cloud-native-platform/  # Cloud Native Platform features
│   ├── express-gov-uk-starter/ # GOV.UK Frontend integration
│   ├── simple-router/          # Simple Router features
│   └── [your-module]/          # Your feature modules
│       └── src/
│           ├── pages/          # Page routes (auto-registered)
│           ├── locales/        # Translations (auto-loaded)
│           └── assets/         # Module assets (auto-compiled)
├── e2e-tests/                  # End-to-end tests (Playwright)
├── docs/                       # Documentation and ADRs
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
| Prisma Studio | Run `yarn workspace @hmcts/postgres run studio` | Database management UI |

## 📦 Development

### Available Commands

```bash
# Development
yarn dev                        # Start all services concurrently
yarn start:web                  # Start web application only
yarn start:api                  # Start API server only

# Testing
yarn test                       # Run all tests across workspaces
yarn test:unit                  # Unit tests only
yarn test:e2e                   # Playwright E2E tests
yarn test:a11y                  # Accessibility tests with axe-core
yarn test:coverage              # Generate coverage report

# Code Quality
yarn lint                       # Run Biome linter
yarn format                     # Format code with Biome

# Database Operations
yarn workspace @hmcts/postgres run generate    # Generate Prisma client
yarn workspace @hmcts/postgres run migrate     # Run database migrations
yarn workspace @hmcts/postgres run studio      # Open Prisma Studio GUI

# Build & Deployment
yarn build                      # Build all packages
yarn docker:build               # Build Docker images
yarn helm:lint                  # Validate Helm charts
```

### Creating a New Feature Module

1. **Create module structure**:
```bash
mkdir -p libs/my-feature/src/pages      # Page controllers and templates
mkdir -p libs/my-feature/src/locales    # Translation files (optional)
mkdir -p libs/my-feature/src/assets/css # Module styles (optional)
mkdir -p libs/my-feature/src/assets/js  # Module scripts (optional)
cd libs/my-feature
```

2. **Initialize package.json**:
```json
{
  "name": "@hmcts/my-feature",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "build": "tsc && yarn build:nunjucks",
    "build:nunjucks": "mkdir -p dist/pages && cd src/pages && find . -name '*.njk' -exec sh -c 'mkdir -p ../../dist/pages/$(dirname {}) && cp {} ../../dist/pages/{}' \\;",
    "dev": "tsc --watch",
    "test": "vitest run",
    "test:watch": "vitest watch"
  },
  "peerDependencies": {
    "express": "^5.1.0"
  }
}
```
**Note**: The `build:nunjucks` script is required if your module contains Nunjucks templates.

3. **Create tsconfig.json**:
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
  "exclude": ["**/*.test.ts", "**/*.spec.ts", "dist", "node_modules", "src/assets/"]
}
```

4. **Create vitest.config.ts**:
```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"]
    }
  }
});
```

5. **Register module in root tsconfig.json**:
```json
{
  "compilerOptions": {
    "paths": {
      // ... existing paths ...
      "@hmcts/my-feature": ["libs/my-feature/src"]
    }
  }
}
```

6. **Module auto-discovery**:
If your module contains a `pages/` directory, it will be automatically discovered and loaded by the web application.

## 🧪 Testing Strategy

| Type | Tool | Location | Purpose |
|------|------|----------|---------|
| **Unit Tests** | Vitest | Co-located `*.test.ts` | Business logic validation |
| **Integration Tests** | Vitest + Supertest | `apps/*/src/**/*.test.ts` | API endpoint testing |
| **E2E Tests** | Playwright | `e2e-tests/` | User journey validation |
| **Accessibility Tests** | Axe-core + Playwright | `e2e-tests/` | WCAG 2.1 AA compliance |

```bash
# Run specific test suites
yarn test                    # All tests
yarn test:unit              # Unit tests only
yarn test:e2e               # E2E tests
yarn test:a11y              # Accessibility tests
yarn test:coverage          # Coverage report
```

## Security

The GitHub Action pipelines contain a number of security checks, including:

- **Dependency Scanning**: Automatically scans for vulnerabilities in dependencies
- **SonarQube**: SAST analysis for code quality and security
- **Claude Security Scans**: Claude AI-powered security scans for code vulnerabilities

## License

MIT
