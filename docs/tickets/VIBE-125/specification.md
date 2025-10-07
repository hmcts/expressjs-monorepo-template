# VIBE-125: Module Autoloading Refactor for Turborepo Dependency Tracking

## Overview

This specification outlines the refactoring of the current glob-based module autoloading system to use explicit imports, enabling turborepo to properly track dependencies and improve build optimization.

## Current State Analysis

The current system uses runtime glob patterns to discover modules:

**Web App (`apps/web/src/modules.ts`):**
```typescript
export function getModulePaths(): string[] {
  const libRoots = glob.sync(path.join(__dirname, `../../../libs/*/src`))
    .filter((dir) => existsSync(path.join(dir, "pages")));
  return [__dirname, ...libRoots];
}
```

**API App (`apps/api/src/app.ts`):**
```typescript
export function getRouterConfigs(): MountSpec[] {
  const libRoots = glob.sync(path.join(__dirname, `../../../libs/*/src/routes`));
  return [`${__dirname}/routes`, ...libRoots].map((path) => ({ path }));
}
```

## Problem Statement

1. **Turborepo Dependency Blind Spot**: Glob-based discovery prevents turborepo from understanding which apps depend on which libs
2. **Build Optimization Loss**: Cannot leverage turborepo's incremental builds and caching
3. **Static Analysis Limitations**: IDEs and tools cannot trace module dependencies
4. **Runtime Discovery Overhead**: File system scanning on every startup

## Target Architecture

### Developer Workflow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            DEVELOPER WORKFLOW                              │
└─────────────────────────────────────────────────────────────────────────────┘

1. Create New Feature Module:
   ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
   │ mkdir libs/     │    │ Create pages/   │    │ Create routes/  │
   │ my-feature/     │ ─> │ routes/ etc.    │ ─> │ prisma/ etc.    │
   │ src/            │    │ folders         │    │ as needed       │
   └─────────────────┘    └─────────────────┘    └─────────────────┘
                                                          │
                                                          v
                                                 ┌─────────────────┐
                                                 | Create index.ts │
                                                 | with exports    │
                                                 | structure       │
                                                 └─────────────────┘

2. Register Module in Apps:
   ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
   │ Import module   │    │ Add to package  │    │ Update app      │
   │ in app files    │ ─> │ dependencies    │ ─> │ configuration   │
   │                 │    │                 │    │                 │
   └─────────────────┘    └─────────────────┘    └─────────────────┘

3. Turborepo Benefits:
   ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
   │ Dependency      │    │ Incremental     │    │ Selective       │
   │ tracking works  │ ─> │ builds work     │ ─> │ test execution  │
   │ automatically   │    │ efficiently     │    │ optimization    │
   └─────────────────┘    └─────────────────┘    └─────────────────┘
```

## Module Export Structure

### Standard lib/*/src/index.ts Template

Each library module will export a standardized interface:

```typescript
// libs/my-feature/src/index.ts
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Export business logic (existing pattern)
export * from "./my-feature/service.js";
export * from "./my-feature/validation.js";

// Pages for web app (if pages/ directory exists)
export const pageRoutes = { path: path.join(__dirname, "pages") };

// API routes for api app (if routes/ directory exists)
export const apiRoutes = { path: path.join(__dirname, "routes") };

  // Prisma schemas for database (if prisma/ directory exists)
export const prismaSchemas: path.join(__dirname, "../prisma");

  // Static assets (if assets/ directory exists)
export const assets = {
    css: path.join(__dirname, "assets/css"),
    js: path.join(__dirname, "assets/js")
};
```

## Before/After Comparison

### Before: Glob-Based Auto-Discovery

**Web App Loading:**
```typescript
// apps/web/src/modules.ts
export function getModulePaths(): string[] {
  // Runtime filesystem scanning
  const libRoots = glob.sync(path.join(__dirname, `../../../libs/*/src`))
    .filter((dir) => existsSync(path.join(dir, "pages")));
  return [__dirname, ...libRoots];
}

// apps/web/src/app.ts
import { pageRoutes as onboardingPages } from "@hmcts/onboarding";
import { pageRoutes as footerPages } from "@hmcts/footer-pages";

app.use(await createSimpleRouter(onboardingPages, footerPages));
```

**API App Loading:**
```typescript
// apps/api/src/app.ts
import { apiRoutes as onboardingRoutes } from "@hmcts/onboarding";

app.use(await createSimpleRouter(onboardingRoutes));
```

**Package Dependencies:**
```json
// apps/web/package.json
{
  "dependencies": {
    "@hmcts/footer-pages": "workspace:*",
    "@hmcts/onboarding": "workspace:*"
  }
}

// apps/api/package.json
{
  "dependencies": {
    "@hmcts/onboarding": "workspace:*"
  }
}
```

## Implementation Plan

### Phase 1: Create Module Export Structure

1. **Update existing lib modules:**
   ```bash
   # For each lib in libs/*/
   - Add/update src/index.ts with appropriate exports
   ```

2. **Example for libs/onboarding/src/index.ts:**
   ```typescript
   import path from "node:path";
   import { fileURLToPath } from "node:url";
   import { existsSync } from "node:fs";

   const __filename = fileURLToPath(import.meta.url);
   const __dirname = path.dirname(__filename);

   // Existing exports
   export * from "./onboarding/validation.js";
   export * from "./onboarding/session.js";
   export * from "./onboarding/navigation.js";
   export * from "./onboarding/service.js";
   export * from "./onboarding/queries.js";


   export const pageRoutes = { path: path.join(__dirname, "pages") };
   export const apiRoutes = { path: path.join(__dirname, "routes") };
   export const prismaSchemas = path.join(__dirname, "../prisma");
   export const assets = {
     css: { path: path.join(__dirname, "assets/css") },
     js: { path: path.join(__dirname, "assets/js") }
   };

   ```

### Phase 2: Update Web App

1. **Delete apps/web/src/modules.ts:**

2. **Update apps/web/src/app.ts:** to use explicit imports
   ```typescript
   import { pageRoutes as onboardingPages } from "@hmcts/onboarding";
   import { pageRoutes as footerPages } from "@hmcts/footer-pages";

   app.use(await createSimpleRouter(onboardingPages, footerPages));
   ```

3. **Update apps/web/package.json dependencies:**
   ```json
   {
     "dependencies": {
       "@hmcts/footer-pages": "workspace:*",
       "@hmcts/onboarding": "workspace:*"
     }
   }
   ```

### Phase 3: Update API App

1. **Update apps/api/src/app.ts:**
   ```typescript
   import { apiRoutes as onboardingRoutes } from "@hmcts/onboarding";

   app.use(await createSimpleRouter(onboardingRoutes));
   ```

2. **Update apps/api/package.json dependencies:**
   ```json
   {
     "dependencies": {
       "@hmcts/onboarding": "workspace:*"
     }
   }
   ```

### Phase 4: Database Schema Integration

1. **Update libs/postgres for schema discovery:**
   ```typescript
   // libs/postgres/src/schema-discovery.ts
   import { prismaSchemas as onboardingSchemas } from "@hmcts/onboarding";

   export function getPrismaSchemas(): string[] {
     return [onboardingSchemas];
   }
   ```

## Documentation Updates Required

### 1. CLAUDE.md Updates

```markdown
## Creating a New Feature Module

1. **Create module structure** with automatic registration:
```bash
mkdir -p libs/my-feature/src/pages      # Page controllers and templates
mkdir -p libs/my-feature/src/routes     # API routes (optional)
mkdir -p libs/my-feature/src/prisma     # Database schemas (optional)
mkdir -p libs/my-feature/src/assets/css  # CSS assets (optional)
mkdir -p libs/my-feature/src/assets/js   # JS assets (optional)
```

2. **Create src/index.ts with module exports:**
```typescript
import path from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Business logic exports
export * from "./my-feature/service.js";

// Module configuration for app registration
export const pageRoutes = { path: path.join(__dirname, "pages") };
export const apiRoutes = { path: path.join(__dirname, "routes") };
export const prismaSchemas = { path: path.join(__dirname, "prisma") };
export const assets = {
  css: path.join(__dirname, "assets/css"),
  js: path.join(__dirname, "assets/js")
};
```

3. **Register module in apps:**
   - Add import to apps/web/src/app.ts (if has pages)
   - Add import to apps/api/src/app.ts (if has routes)
   - Add import to libs/postgres/src/schema-discovery.ts (if has prisma)
   - Add dependency to relevant app package.json files

### 2. README.md Updates

Replace section 5 with a section detailing how to register your module in the web and api apps, as well as the postgres lib if applicable.

### 3. Full-Stack Engineer Guidance

Replace the ### Module Auto-Discovery section in full-stack-engineer.md with the new explicit import process.


