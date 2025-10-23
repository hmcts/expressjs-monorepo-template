# HMCTS Monorepo AI Development Guide

## Core Development Commands

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

## Naming Conventions (STRICT - MUST FOLLOW)

### 1. Database Tables and Fields
- **MUST be singular and snake_case**: `user`, `case`, `created_at`
- Use Prisma `@@map` and `@map` for aliases
```prisma
model Case {
  id         String   @id @default(cuid())
  caseNumber String   @unique @map("case_number")
  createdAt  DateTime @default(now()) @map("created_at")
  
  @@map("case")
}
```

### 2. TypeScript Variables
- Use camelCase: `userId`, `caseDetails`, `documentId`
- Booleans with `is/has/can`: `isActive`, `hasAccess`, `canEdit`

### 3. Classes and Interfaces
- Use PascalCase: `UserService`, `CaseRepository`
- NO `I` prefix: `UserRepository` not `IUserRepository`

### 4. Constants
- Use SCREAMING_SNAKE_CASE: `MAX_FILE_SIZE`, `DEFAULT_TIMEOUT`

### 5. Files and Directories
- Use kebab-case: `user-service.ts`, `case-management/`

### 6. API Endpoints
- Plural for collections: `/api/cases`, `/api/users`
- Singular for specific: `/api/case/:id`
- Singular for creation: `POST /api/case`

### 7. Package Names
- Use @hmcts scope: `@hmcts/auth`, `@hmcts/case-management`

### 8. Module Ordering
- consts outside the scope of a function should be at the top (e.g. `const COOKIE_NAME = "cookie_name";`)
- Exported functions should next
- Other functions should be ordered in the order they are used
- Interfaces and types should be at the bottom

## Module Development Guidelines

### Module Registration System

The web and API applications use explicit imports to register modules, enabling turborepo to properly track dependencies and optimize builds. Each module exports standardized interfaces for different types of functionality.

### Creating a New Feature Module

1. **Create module structure**:
```bash
mkdir -p libs/my-feature/src/pages      # Page controllers and templates
mkdir -p libs/my-feature/src/routes     # API routes (optional)
mkdir -p libs/my-feature/src/locales    # Translation files (optional)
mkdir -p libs/my-feature/src/views      # Shared templates (optional)
mkdir -p libs/my-feature/src/assets/css # Module styles (optional)
mkdir -p libs/my-feature/src/assets/js  # Module scripts (optional)
```

2. **Create src/config.ts for module configuration**:
```typescript
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Module configuration for app registration
export const pageRoutes = { path: path.join(__dirname, "pages") };
export const apiRoutes = { path: path.join(__dirname, "routes") };
export const prismaSchemas = path.join(__dirname, "../prisma");
export const assets = path.join(__dirname, "assets/");
```

**Create src/index.ts for business logic exports**:
```typescript
// Business logic exports
export * from "./my-feature/service.js";
export * from "./my-feature/validation.js";
```

**IMPORTANT**: Config exports (pageRoutes, apiRoutes, prismaSchemas, assets) must be in a separate `config.ts` file to avoid circular dependencies during Prisma client generation. Apps import config using the `/config` path (e.g., `@hmcts/my-feature/config`).

3. **Package.json requirements**:
```json
{
  "name": "@hmcts/my-feature",
  "version": "1.0.0",
  "type": "module",
  "exports": {
    ".": {
      "production": "./dist/index.js",
      "default": "./src/index.ts"
    },
    "./config": {
      "production": "./dist/config.js",
      "default": "./src/config.ts"
    }
  },
  "scripts": {
    "build": "tsc && yarn build:nunjucks",
    "build:nunjucks": "mkdir -p dist/pages && cd src/pages && find . -name '*.njk' -exec sh -c 'mkdir -p ../../dist/pages/$(dirname {}) && cp {} ../../dist/pages/{}' \\;",
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

**Note**: The `build:nunjucks` script is required if your module contains Nunjucks templates in the `pages/` directory.

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
4. **Register module in root tsconfig.json**:
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

5. **Register module in applications**:

```typescript
// apps/web/src/app.ts
import { pageRoutes as myFeaturePages } from "@hmcts/my-feature/config";

app.use(await createGovukFrontend(app, [myFeaturePages.path], { /* options */ }));
app.use(await createSimpleRouter(myFeaturePages));

// apps/web/vite.config.ts
import { assets as myFeatureAssets } from "@hmcts/my-feature/config";
const baseConfig = createBaseViteConfig([
  path.join(__dirname, "src"),
  myFeatureAssets
]);

// apps/api/src/app.ts
import { apiRoutes as myFeatureRoutes } from "@hmcts/my-feature/config";
app.use(await createSimpleRouter(myFeatureRoutes));

// apps/postgres/src/schema-discovery.ts
import { prismaSchemas as myFeatureSchemas } from "@hmcts/my-feature/config";
const schemaPaths = [myFeatureSchemas, /* other schemas */];
```

### Module Structure

```
libs/my-feature/
├── package.json
├── tsconfig.json
├── prisma/                     # Prisma schema (optional)
│   └── schema.prisma           # Prisma schema file
└── src/
    ├── index.ts                # Business logic exports only
    ├── config.ts               # Module configuration (pageRoutes, apiRoutes, etc.)
    ├── routes/                 # API routes (auto-discovered)
    │   └── my-api.ts          # API route file (if needed)
    ├── pages/                  # Page routes (auto-discovered)
    │   ├── my-page.ts          # Controller with GET/POST exports
    │   └── my-page.njk         # Nunjucks template
    ├── locales/                # i18n translations (optional)
    │   ├── en.ts               # English translations
    │   └── cy.ts               # Welsh translations
    ├── views/                  # Shared templates (optional)
    │   └── partials/
    └── assets/                 # Module assets (optional)
        ├── css/
        │   └── module.scss
        └── js/
            └── module.ts
```

**NOTE**: Pages are registered through explicit imports in `apps/web/src/app.ts`. Routes are created based on file names within the `pages/` directory. For example, `my-page.ts` becomes `/my-page`. To create nested routes, use subdirectories (e.g., `pages/admin/my-page.ts` becomes `/admin/my-page`).

### Page Controller Pattern

```typescript
// libs/[module]/src/pages/[page-name].ts
import type { Request, Response } from "express";

const en = {
  title: "My Page Title",
  description: "Page description"
};

const cy = {
  title: "Teitl Fy Nhudalen",
  description: "Disgrifiad tudalen"
};

export const GET = async (_req: Request, res: Response) => {
  res.render("my-page", { en, cy });
};

export const POST = async (req: Request, res: Response) => {
  res.redirect("/success");
};
```

### Nunjucks Template Pattern

```html
<!-- libs/[my-module]/src/pages/[page-name].njk -->
{% extends "layouts/default.njk" %}
{% from "govuk/components/button/macro.njk" import govukButton %}
{% from "govuk/components/input/macro.njk" import govukInput %}
{% from "govuk/components/error-summary/macro.njk" import govukErrorSummary %}

{% block content %}
<div class="govuk-grid-row">
  <div class="govuk-grid-column-two-thirds">
    
    {% if errors %}
      {{ govukErrorSummary({
        titleText: errorSummaryTitle,
        errorList: errors
      }) }}
    {% endif %}

    <form method="post" novalidate>
      {{ govukInput({
        id: "email",
        name: "email",
        type: "email",
        autocomplete: "email",
        label: {
          text: emailLabel
        },
        errorMessage: errors.email,
        value: data.email
      }) }}

      {{ govukButton({
        text: continueButtonText
      }) }}
    </form>

  </div>
</div>
{% endblock %}
```

### Content Organization

**Shared/Common Content** (goes in locale files libs/[module]/src/locales/en.ts and cy.ts):
- Common button text (Back, Continue, Submit)
- Phase banner text
- Service name
- Common error messages
- Content used by multiple pages

**Page-Specific Content** (goes in controllers):
- Page titles
- Section headings
- Body text
- Lists specific to that page
- Contact details specific to that page
- Any content unique to that page

### Welsh Language Support

Every page must support both English and Welsh:

1. **In Controllers**: Provide both `en` and `cy` objects with page content
2. **In Templates**: Use the current language data automatically selected by the i18n middleware
3. **In Locale Files**: Maintain the same structure between en.ts and cy.ts
4. **Testing**: Always test pages with `?lng=cy` query parameter to verify Welsh content


### Express Middleware Pattern

Reusable middleware should be placed in a dedicated `libs/[module]/src/[middleware-name]-middleware.ts` file and exported as a function:

```typescript
// libs/auth/src/authenticate-middleware.ts
import type { Request, Response, NextFunction } from 'express';

export function authenticate() {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Authentication logic
      next();
    } catch (error) {
      res.status(401).render('errors/401');
    }
  };
}
```

## Testing Strategy

- **Unit/Integration Tests**: Vitest, co-located with source (`*.test.ts`)
- **E2E Tests**: Playwright in `e2e-tests/`
- **Accessibility Tests**: Axe-core with Playwright
- **Test Scripts**: All packages must use `"test": "vitest run"`
- **Coverage**: Aim for >80% on business logic

### Test File Pattern
```typescript
// user-service.test.ts (co-located with user-service.ts)
import { describe, it, expect, vi } from 'vitest';
import { UserService } from './user-service';

vi.mock('@hmcts/postgres', () => ({
  prisma: {
    user: {
      findUnique: vi.fn()
    }
  }
}));

describe('UserService', () => {
  it('should find user by id', async () => {
    // Test implementation
  });
});
```

## Code Quality Standards

- **TypeScript**: Strict mode enabled, no `any` without justification
- **ES Modules**: Use `"type": "module"` in all package.json files
- **Express**: Version 5.x only (`"express": "5.1.0"`)
- **Imports**: Use workspace aliases (`@hmcts/*`)
  - **IMPORTANT**: Always add `.js` extension to relative imports (e.g., `import { foo } from "./bar.js"`)
  - This is required for ESM with Node.js "nodenext" module resolution
  - Applies even when importing TypeScript files (they compile to .js)
  - **Enforcement**: TypeScript will error on missing `.js` extensions with:
    - `"module": "nodenext"` and `"moduleResolution": "nodenext"` in tsconfig.json
    - Error: "Relative import paths need explicit file extensions in ECMAScript imports"
- **Linting**: Fix all Biome warnings before commit
- **No CommonJS**: Use `import`/`export`, never `require()`/`module.exports`
- **Pinned dependencies**: Specific versions only (`"express": "5.1.0"`) - except peer dependencies

## Security Requirements

- Input validation on all endpoints
- Parameterized database queries (Prisma)
- No sensitive data in logs

## Common Pitfalls to Avoid

1. **Don't put business logic in apps/** - Use libs/ modules
2. **Don't hardcode values** - Use environment variables
3. **Don't skip Welsh translations** - Required for all user-facing text
4. **Don't use CommonJS** - ES modules only
5. **Don't ignore TypeScript errors** - Fix or justify with comments
6. **Don't duplicate dependencies** - Check root package.json first
7. **Don't create circular dependencies** between modules
8. **Don't skip accessibility testing** - WCAG 2.2 AA is mandatory
9. **Don't commit secrets** - Use environment variables
10. **Don't use relative imports across packages** - Use @hmcts/* aliases
11. **Don't create types.ts files** - Colocate types with the appropriate code
12. **Don't create generic files like utils.ts** - Be specific (e.g., object-properties.ts, date-formatting.ts)
13. **Don't export functions in order to test them** - Only export functions that are intended to be used outside the module
14. **Don't add comments unless they are meaningful** - If necessary, explain why something is done, not what is done

## Debugging Tips

1. **Module Loading**: Check imports in apps/*/src/app.ts
2. **Database Issues**: Enable Prisma logging with `DEBUG=prisma:query`
3. **Run commands from the root directory**: Run yarn test etc from the root directory

## Core Principles

* **YAGNI**: You Aren't Gonna Need It - Don't add speculative functionality or features. Always take the simplest approach. 
* **Functional style** favour a simple functional approach. Don't use a class unless you have shared state
* **KISS**: Keep It Simple, Stupid - Avoid unnecessary complexity. Write code that is easy to understand and maintain.
* **Immutable**: Data should be immutable by default. Use const and avoid mutations to ensure predictable state.
* **Side Effects**: Functions should have no side effects. Avoid modifying external state or relying on mutable data.

## Communication Style

Be direct and straightforward. No cheerleading phrases like "that's absolutely right" or "great question." Tell the user when ideas are flawed, incomplete, or poorly thought through. Focus on practical problems and realistic solutions rather than being overly positive or encouraging.

Challenge assumptions, point out potential issues, and ask questions about implementation, scalability, and real-world viability. If something won't work, say so directly and explain why it has problems rather than just dismissing it.