# Project Context

## Purpose
HMCTS (HM Courts & Tribunals Service) monorepo template for building scalable Express.js applications with GOV.UK Frontend integration. Provides a production-ready foundation for UK government digital services with bilingual support (English/Welsh), accessibility compliance, and cloud-native deployment capabilities.

## Tech Stack

### Core Runtime
- **Node.js**: 24.x LTS
- **TypeScript**: 5.7+ with strict mode and ES modules
- **Express**: 5.1.0 (latest major version)

### Frontend
- **Template Engine**: Nunjucks
- **Design System**: GOV.UK Frontend 5.7+
- **Build Tool**: Vite 6.x for asset compilation
- **Styling**: SCSS with GOV.UK Design System tokens

### Backend & Data
- **Database**: PostgreSQL 16+
- **ORM**: Prisma 6.x with distributed schemas
- **Migrations**: Prisma Migrate

### Monorepo Architecture
- **Package Manager**: Yarn 4.x (Berry) with workspaces
- **Build Orchestration**: Turborepo for incremental builds and caching
- **Module System**: ES Modules only (no CommonJS)

### Testing & Quality
- **Unit/Integration Tests**: Vitest with coverage reporting
- **E2E Tests**: Playwright with multi-browser support
- **Accessibility Testing**: Axe-core integration in Playwright
- **Linting & Formatting**: Biome (replaces ESLint + Prettier)

### DevOps & Deployment
- **Container Runtime**: Docker with multi-stage builds
- **Orchestration**: Kubernetes via Helm charts
- **Cloud Platform**: Azure (HMCTS Cloud Native Platform)
- **CI/CD**: GitHub Actions with preview environments

## Project Conventions

### Code Style

#### Naming Conventions (STRICT - MUST FOLLOW)
1. **Database Tables/Fields**: Singular snake_case (`user`, `case_number`, `created_at`)
   - Use Prisma `@@map` and `@map` for model/field aliases
2. **TypeScript Variables**: camelCase (`userId`, `caseDetails`)
   - Booleans: `is/has/can` prefix (`isActive`, `hasAccess`)
3. **Classes/Interfaces**: PascalCase without `I` prefix (`UserService`, `CaseRepository`)
4. **Constants**: SCREAMING_SNAKE_CASE (`MAX_FILE_SIZE`, `DEFAULT_TIMEOUT`)
5. **Files/Directories**: kebab-case (`user-service.ts`, `case-management/`)
6. **API Endpoints**:
   - Collections: plural (`/api/cases`, `/api/users`)
   - Specific resources: singular (`/api/case/:id`)
   - Creation: singular (`POST /api/case`)
7. **Package Names**: `@hmcts` scope (`@hmcts/auth`, `@hmcts/case-management`)

#### Module Organization
1. Constants at the top of the file
2. Exported functions next
3. Internal functions ordered by usage
4. Interfaces and types at the bottom

#### Import Rules
- Always use `.js` extension for relative imports (required for ESM)
- Use workspace aliases for cross-package imports (`@hmcts/*`)
- No CommonJS (`require`/`module.exports`)

#### Code Quality Rules
- TypeScript strict mode (no `any` without justification)
- Immutable by default (use `const`, avoid mutations)
- No side effects in functions
- No type files (`types.ts`) - colocate types with implementation
- No generic utility files (`utils.ts`) - be specific
- No unnecessary comments - explain "why", not "what"
- Don't export functions solely for testing

### Architecture Patterns

#### Monorepo Structure
```
expressjs-monorepo-template/
├── apps/                    # Deployable applications (thin orchestration)
│   ├── api/                 # REST API server
│   ├── web/                 # Web frontend with SSR
│   ├── crons/               # Scheduled jobs
│   └── postgres/            # Migration runner
├── libs/                    # Business logic modules
│   └── [feature]/
│       ├── src/
│       │   ├── index.ts     # Business logic exports
│       │   ├── config.ts    # Module registration (pageRoutes, apiRoutes)
│       │   ├── pages/       # Page controllers + templates
│       │   ├── routes/      # API routes
│       │   ├── locales/     # i18n translations (en.ts, cy.ts)
│       │   └── assets/      # CSS/JS for module
│       └── prisma/          # Module-specific schema
```

#### Module System
- **Explicit Registration**: Apps import and register modules via `config.ts` exports
- **No Auto-Discovery**: Turborepo needs explicit dependencies for proper caching
- **Separation of Concerns**: `config.ts` for registration, `index.ts` for business logic
- **Distributed Schemas**: Each module can have its own Prisma schema

#### Page Controller Pattern
- Co-located controllers and templates (`my-page.ts` + `my-page.njk`)
- Export `GET` and `POST` functions from controllers
- Route derived from file path (`pages/admin/users.ts` → `/admin/users`)
- Bilingual content objects (`en` and `cy`) in controllers

#### Core Principles
- **YAGNI**: Don't add speculative features
- **KISS**: Simplest approach that works
- **Functional Style**: Favour functions over classes unless shared state needed
- **Immutability**: Data immutable by default
- **No Side Effects**: Pure functions wherever possible

### Testing Strategy

#### Test Distribution
- **Unit/Integration**: Vitest, co-located with source (`*.test.ts`)
- **E2E**: Playwright in `e2e-tests/` directory
- **Accessibility**: Axe-core via Playwright on all pages
- **Coverage Target**: >80% on business logic

#### Test Commands
```bash
yarn test              # All workspaces
yarn test:e2e          # Playwright E2E
yarn test:coverage     # Generate coverage report
```

#### Mocking Strategy
- Use Vitest `vi.mock()` for external dependencies
- Mock Prisma client for database operations
- Avoid mocking internal application code

#### E2E Test Requirements
- Test critical user journeys
- Include Welsh language testing (`?lng=cy`)
- Run accessibility checks on all pages
- Test across multiple browsers (Chromium, Firefox, WebKit)

### Git Workflow

#### Branching
- Main branch: `master`
- Feature branches: `feature/TICKET-description`
- Use conventional commits for PR titles

#### Commit Conventions
- Keep commits focused and atomic
- Include ticket references where applicable
- No force pushes to `master`
- Hooks enabled by default (don't use `--no-verify`)

## Domain Context

### UK Government Services
This project builds digital services for HM Courts & Tribunals Service (HMCTS), requiring:
- **Bilingual Support**: All user-facing content in English and Welsh
- **Accessibility**: WCAG 2.2 AA compliance mandatory
- **GOV.UK Design System**: Strict adherence to patterns and components
- **Service Standards**: Follow UK Government Digital Service standards

### Welsh Language Requirements
- Every page must support both English and Welsh
- Content in controllers as `en` and `cy` objects
- i18n middleware automatically selects language
- Test all pages with `?lng=cy` query parameter
- Maintain identical structure between language files

### Accessibility Requirements
- WCAG 2.2 Level AA compliance
- Axe-core testing on all pages
- Semantic HTML with proper landmarks
- Keyboard navigation support
- Screen reader compatibility

## Important Constraints

### Technical Constraints
1. **Express 5.x Only**: No fallback to v4
2. **ES Modules Required**: No CommonJS allowed
3. **Pinned Dependencies**: Specific versions only (no `^` or `~`)
4. **TypeScript Strict Mode**: Cannot be disabled
5. **Node.js 24.x**: LTS version requirement

### Regulatory Constraints
1. **Accessibility**: WCAG 2.2 AA mandatory (legal requirement)
2. **Welsh Language**: Required by Welsh Language Standards
3. **Data Protection**: GDPR and UK DPA compliance
4. **Security**: OWASP Top 10 awareness required

### Business Constraints
1. **GOV.UK Design System**: Must use official components
2. **Cloud Native Platform**: Azure deployment only
3. **No Sensitive Data**: Never log personal information
4. **Parameterized Queries**: SQL injection prevention via Prisma

## External Dependencies

### GOV.UK Services
- **GOV.UK Frontend**: Design system components and styles
- **GOV.UK Notify**: Email and SMS notifications (when used)

### Cloud Infrastructure (Azure)
- **Azure Kubernetes Service (AKS)**: Container orchestration
- **Azure PostgreSQL**: Managed database service
- **Azure Container Registry**: Docker image storage
- **Azure Key Vault**: Secrets management

### Development Tools
- **Prisma Studio**: Database GUI for development
- **Playwright UI Mode**: E2E test debugging
- **Biome**: Fast linting and formatting

### Build & Deploy
- **GitHub Actions**: CI/CD pipeline
- **Helm**: Kubernetes package manager
- **Turborepo Remote Cache**: Build acceleration
- **Docker**: Containerization
