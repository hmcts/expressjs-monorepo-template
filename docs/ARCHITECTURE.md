# Architecture Overview

Note that this is an example architecture document for the expressjs-monorepo-template. It should be adapted to fit the specific architecture of your project.

## Executive Summary

The HMCTS Express Monorepo Template is a production-ready, cloud-native application platform designed to deliver accessible, secure, and scalable UK government digital services. Built on Express.js 5.x with TypeScript, it implements the GOV.UK Design System and provides comprehensive tooling for building HMCTS (HM Courts & Tribunals Service) applications.

## System Architecture

### High-Level Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                         Client Layer                             │
│                    (Browser / Mobile Device)                     │
└─────────────────────────────┬────────────────────────────────────┘
                              │ HTTPS
┌─────────────────────────────┴────────────────────────────────────┐
│                      Application Layer                           │
│  ┌─────────────────────────────────────────────────────────┐     │
│  │         Web Frontend (@hmcts/web)                       │     │
│  │  - Express 5.x + Nunjucks                               │     │
│  │  - GOV.UK Design System                                 │     │
│  │  - Port: 3000                                           │     │
│  └──────────────────────────┬──────────────────────────────┘     │
│                             │                                    │
│  ┌──────────────────────────┴──────────────────────────────┐     │
│  │         REST API (@hmcts/api)                           │     │
│  │  - Express 5.x                                          │     │
│  │  - JSON API                                             │     │
│  │  - Port: 3001                                           │     │
│  └─────────────────────────────────────────────────────────┘     │
└─────────────────────────────┬───────────────────────────────────┘
                              │
┌─────────────────────────────┴────────────────────────────────────┐
│                         Data Layer                               │
│    ┌────────────────────┐           ┌─────────────────────┐      │
│    │  PostgreSQL        │           │     Redis           │      │
│    │  - Port: 5432      │           │  - Port: 6379       │      │
│    │  - Prisma ORM      │           │  - Session Store    │      │
│    └────────────────────┘           └─────────────────────┘      │
└──────────────────────────────────────────────────────────────────┘
```

## Monorepo Structure

The project uses Yarn Workspaces with Turborepo for efficient monorepo management:

```
expressjs-monorepo-template/
├── apps/                       # Deployable applications
│   ├── api/                    # REST API service
│   └── web/                    # Web frontend application
│       └── src/
│           └── modules.ts      # Module auto-discovery system
├── libs/                       # Reusable packages (auto-discovered)
│   ├── cloud-native-platform/  # Azure integration & monitoring
│   ├── express-govuk-starter/  # GOV.UK Design System integration
│   ├── postgres-prisma/        # Database schema and migrations
│   ├── simple-router/          # File-based routing system
│   └── [feature-modules]/      # Feature modules with pages/
│       └── src/
│           ├── pages/          # Page routes (auto-registered)
│           ├── locales/        # Translations (auto-loaded)
│           ├── views/          # Templates (auto-registered)
│           └── assets/         # Module assets (auto-compiled)
├── e2e-tests/                  # Playwright E2E tests
└── docs/                       # Documentation
```

### Module Auto-Discovery System

The web application features an intelligent module discovery system that automatically integrates feature modules:

1. **Discovery Process** (`apps/web/src/modules.ts`):
   - Scans all directories under `libs/*/src`
   - Identifies modules containing a `pages/` directory
   - Returns paths for automatic registration

2. **Automatic Integration**:
   - **Routes**: Pages in `module/src/pages/` are automatically registered with Simple Router
   - **Views**: Templates in `module/src/pages/` and `module/src/views/` are added to Nunjucks paths
   - **Locales**: Translation files in `module/src/locales/` are automatically loaded
   - **Assets**: CSS and JS files in `module/src/assets/` are compiled and served

3. **Zero Configuration**:
   - No manual registration required
   - Simply create the module structure and it's automatically discovered
   - Modules must be added to root `tsconfig.json` paths for TypeScript resolution

## Core Components

### 1. Web Frontend (`apps/web`)

**Purpose**: User-facing web application with GOV.UK Design System

**Key Technologies**:
- Express 5.x server
- Nunjucks templating engine
- GOV.UK Frontend 5.11.2
- Vite for asset bundling
- SCSS for styling
- Redis for session management

**Features**:
- Server-side rendering
- Internationalization (English & Welsh)
- WCAG 2.1 AA accessibility compliance
- Content Security Policy (CSP) with nonces
- Cookie consent management
- Progressive enhancement

**Architecture Decisions**:
- File-based routing using Simple Router
- Page-specific content in controllers
- Shared content in locale files
- Co-located page templates and controllers
- Module auto-discovery for seamless integration
- Automatic asset compilation for modules

### 2. REST API (`apps/api`)

**Purpose**: Backend API service for data operations

**Key Technologies**:
- Express 5.x
- TypeScript with strict mode
- Prisma ORM for database access
- CORS support

**Features**:
- RESTful endpoints
- File-based routing
- Compression middleware
- Health check endpoints
- Error handling

**API Structure**:
```
/api/
├── users/          # User management
├── users/[id]      # Dynamic routing
└── [resource]/     # Additional resources
```

### 3. Database Layer (`libs/postgres-prisma`)

**Purpose**: Data persistence and schema management

**Database Schema**:
- **User**: Authentication and user management
- **Case**: Case management system
- **Document**: File attachments
- **CaseNote**: Audit trail
- **UserSession**: Session persistence

**Key Features**:
- Prisma ORM with type-safe queries
- Snake_case database naming convention
- CamelCase TypeScript interface mapping
- Automatic migrations
- Database connection pooling

### 4. Session Store (Redis)

**Purpose**: High-performance session storage

**Features**:
- Express session integration
- Distributed session support
- TTL-based expiration
- Append-only persistence

## Shared Libraries

### Cloud Native Platform (`libs/cloud-native-platform`)

**Purpose**: Azure cloud integration and monitoring

**Features**:
- **Properties Volume**: Kubernetes ConfigMap/Secret mounting
- **Azure Key Vault**: Secret management integration
- **Application Insights**: Telemetry and monitoring
- **Health Checks**: Kubernetes readiness/liveness probes

**Implementation**:
```typescript
// Automatic configuration loading
await configurePropertiesVolume(config, { 
  chartPath: path.join(__dirname, "../helm/values.yaml") 
});

// Health check endpoints
app.use(healthcheck()); // /health, /health/readiness, /health/liveness
```

### Express GOV.UK Starter (`libs/express-govuk-starter`)

**Purpose**: GOV.UK Design System integration

**Components**:
- **Nunjucks Configuration**: Template engine setup
- **Asset Management**: Vite integration for SCSS/JS
- **Security Headers**: Helmet.js with CSP
- **Session Stores**: Redis and PostgreSQL adapters
- **Cookie Manager**: GDPR-compliant cookie consent
- **Error Handling**: User-friendly error pages
- **Filters**: Date, currency, time formatting

### Simple Router (`libs/simple-router`)

**Purpose**: File-based routing system

**Features**:
- Automatic route discovery
- Dynamic parameters (`[id].ts`)
- HTTP method exports
- Middleware composition
- Zero configuration
- Multi-directory mounting support

**Example**:
```typescript
// apps/api/src/routes/users/[id].ts
export const GET = async (req, res) => {
  const user = await getUser(req.params.id);
  res.json(user);
};
```

**Module Integration**:
```typescript
// apps/web/src/app.ts
const modulePaths = getModulePaths(); // Auto-discover modules
const routeMounts = modulePaths.map((dir) => ({ pagesDir: `${dir}/pages` }));
app.use(await createSimpleRouter(...routeMounts)); // Mount all module routes
```

## Scalability Design

- Stateless application design
- Redis-backed sessions for distribution
- Kubernetes HPA support

## Technology Stack Summary

| Layer | Technology |
|-------|------------|
| Runtime | Node.js |
| Framework | Express.js |
| Language | TypeScript |
| Database | PostgreSQL |
| ORM | Prisma |
| Cache | Redis |
| Template Engine | Nunjucks |
| UI Framework | GOV.UK Frontend |
| Build Tool | Turbo |
| Bundler | Vite |
| Testing | Vitest, Playwright |
| Container | Docker (Multi-stage Alpine) |
| Orchestration | Kubernetes + Helm |

