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
│   ├── crons/                  # Scheduled jobs (CronJob)
│   ├── postgres/               # Prisma Studio & migration runner
│   └── web/                    # Web frontend application
│       └── src/
│           └── modules.ts      # Module auto-discovery system
├── libs/                       # Reusable packages (auto-discovered)
│   ├── cloud-native-platform/  # Azure integration & monitoring
│   ├── express-govuk-starter/  # GOV.UK Design System integration
│   ├── postgres-prisma/        # Prisma client library
│   ├── simple-router/          # File-based routing system
│   └── [feature-modules]/      # Feature modules with pages/
│       └── src/
│           ├── pages/          # Page routes (auto-registered)
│           ├── locales/        # Translations (auto-loaded)
│           ├── views/          # Templates (auto-registered)
│           └── assets/         # Module assets (auto-compiled)
├── helm/                       # Helm charts
│   └── expressjs-monorepo-template/  # Umbrella chart
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

### 3. Database Layer

**Purpose**: Data persistence, schema management, and database inspection

The database layer is split into two components:

#### Database Client (`libs/postgres-prisma`)
- Provides Prisma ORM client for type-safe database queries
- Collates Prisma schema fragments from multiple modules
- Exports Prisma client for use across applications
- Snake_case database naming convention
- CamelCase TypeScript interface mapping
- Database connection pooling

#### Prisma Studio Service (`apps/postgres`)
- Long-running service providing database inspection interface
- Runs database migrations on pod startup
- Hosts Prisma Studio on port 5556 (proxied via port 5555)
- Health proxy for Kubernetes health checks
- Accessible via ingress in preview/production environments
- Deployed using HMCTS `nodejs` Helm chart

**Database Schema**:
- **User**: Authentication and user management
- **Case**: Case management system
- **Document**: File attachments
- **CaseNote**: Audit trail
- **UserSession**: Session persistence

### 4. Prisma Studio Service (`apps/postgres`)

**Purpose**: Database inspection and migration management

**Key Features**:
- Runs database migrations on startup via `prisma migrate deploy`
- Provides web-based Prisma Studio interface for database inspection
- Health proxy server (port 5555) for Kubernetes health checks
- Proxies traffic to Prisma Studio (port 5556)
- Long-running service deployed using HMCTS `nodejs` chart

**Architecture Pattern**:
The health proxy solves the HMCTS `nodejs` chart v3.2.0 limitation that forces HTTP health checks:
- HTTP server on port 5555 responds to K8s probes
- All other traffic proxied to Prisma Studio on port 5556
- Both run continuously as a single pod

**Access**:
- Preview: `https://<team>-<release>-postgres.preview.platform.hmcts.net`
- Production: Via configured ingress host

### 5. Session Store (Redis)

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

## Helm Chart Structure

The project uses an umbrella Helm chart pattern for coordinated deployment of all services.

### Umbrella Chart (`helm/expressjs-monorepo-template/`)

**Purpose**: Coordinates deployment of all applications and dependencies

**Structure**:
```
helm/expressjs-monorepo-template/
├── Chart.yaml                      # Parent chart with dependencies
├── values.yaml                     # Default values
└── values.preview.template.yaml    # Preview environment values
```

**Dependencies**:
- `expressjs-monorepo-template-postgres`: Database migration and Prisma Studio service
- `expressjs-monorepo-template-web`: Web frontend application
- `expressjs-monorepo-template-api`: REST API service
- `expressjs-monorepo-template-crons`: Scheduled jobs
- `redis`: Session store (Bitnami chart)
- `postgresql`: Database provisioning (HMCTS chart)

**Key Features**:
- Each app can be enabled/disabled via conditions
- Dynamic image tag substitution for preview deployments
- Team metadata in annotations for multi-team monorepos
- Environment-specific value overrides

### Per-App Charts (`apps/*/helm/`)

Each deployable application has its own Helm chart:
- Uses HMCTS standard charts (`nodejs`, `job`)
- Contains app-specific configuration
- Referenced as file-based dependency in umbrella chart

## Preview Deployment Architecture

### Overview

Automated preview environments are created for each pull request, allowing teams to test changes in isolation before merging.

### GitHub Actions Workflow

**Trigger**: Pull requests to `master` branch

**Concurrency**: One deployment per PR (cancels in-progress runs)

**Jobs**:

1. **Detect Affected Apps** (`.github/scripts/detect-affected-apps.sh`)
   - Uses Turborepo to detect which apps changed
   - Returns JSON arrays of affected apps and all Helm apps
   - Only apps with changes are rebuilt

2. **Build & Publish** (Matrix job)
   - Builds Docker images only for affected apps
   - Tags with timestamp: `pr-{id}-{sha}-{timestamp}`
   - Also tags with static tag: `pr-{id}` (for unaffected apps)
   - Pushes to Azure Container Registry

3. **Deploy to Preview**
   - Reads metadata from Helm charts (team, app names)
   - Sets dynamic image variables for each app:
     - Affected apps: Use new timestamped tag
     - Unaffected apps: Use `latest` tag
   - Deploys umbrella chart with `--atomic` and retry logic
   - Handles Helm lock errors from cancelled workflows
   - Provisions PostgreSQL database and Redis per PR

4. **Get Preview URLs**
   - Retrieves ingress URLs from Kubernetes
   - Posts URLs to PR as comment
   - Tags PR for cleanup tracking

5. **E2E Tests**
   - Runs Playwright tests against preview environment
   - Uses app-specific URL environment variables
   - Posts test results to PR
   - Uploads artifacts on failure

### Deployment Scripts

**detect-affected-apps.sh**:
- Uses `turbo ls --affected` to detect changed apps
- Filters to apps with Dockerfiles
- Returns JSON for matrix build strategy

**generate-build-metadata.sh**:
- Extracts team/app names from Helm Chart.yaml
- Generates timestamp and short SHA
- Constructs image tags and registry paths

**set-image-variables.sh**:
- Sets `{APP}_IMAGE` environment variables
- Affected apps get timestamped tags
- Unaffected apps use `latest`

**deploy-preview.sh**:
- Checks Helm release status and recovers from stuck states
- Implements retry logic with exponential backoff
- Handles "another operation in progress" errors
- Rolls back or uninstalls stuck releases

**get-preview-urls.sh**:
- Waits for ingress resources to be ready
- Extracts URLs from Kubernetes ingress objects
- Returns JSON mapping app names to URLs

### Infrastructure Components

**Per-Preview Resources**:
- PostgreSQL database: `{release-name}`
- Redis instance: `{release-name}-redis-master`
- Kubernetes namespace: `{team-name}`
- Ingress hosts: `{team}-{release}-{app}.preview.platform.hmcts.net`

**Shared Resources**:
- Azure Flexible PostgreSQL Server: `dtsse-preview`
- AKS Cluster: `cft-preview-01-aks`
- Azure Container Registry: `hmctspublic.azurecr.io`

### Cleanup

Preview environments are tagged for cleanup:
- `ns:{team-name}`: Kubernetes namespace
- `prd:{team-name}`: Product name
- `rel:{release-name}`: Specific release identifier

Cleanup is triggered when PRs are closed (handled by HMCTS platform).

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

