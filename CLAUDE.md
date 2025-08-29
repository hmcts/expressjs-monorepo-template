# HMCTS Monorepo AI Development Guide

## Core Development Commands

```bash
# Install dependencies (run from root)
yarn install

# Start development environment
yarn dev             # Start all services concurrently
yarn start:db        # Start PostgreSQL in Docker
yarn start:api       # Start API server on port 3001
yarn start:web       # Start web frontend on port 3000

# Testing
yarn test            # Run unit tests across workspaces
yarn test:e2e        # Playwright E2E tests

# Code quality
yarn lint            # Run Biome linter
yarn format          # Format code with Biome
yarn test:coverage   # Run tests with coverage report

# Database operations
yarn workspace @hmcts/postgres run generate    # Generate Prisma client
yarn workspace @hmcts/postgres run migrate     # Run migrations
yarn workspace @hmcts/postgres run studio      # Open Prisma Studio

# Build and deployment
yarn build           # Build all packages
yarn docker:build    # Build Docker images
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

### Creating a New Feature Module

1. **Create module structure**:
```bash
mkdir -p libs/my-feature/src
```

2. **Package.json requirements**:
```json
{
  "name": "@hmcts/my-feature",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "dev": "tsc --watch"
  },
  "peerDependencies": {
    "express": "^5.1.0"
  }
}
```

### Express Middleware Pattern

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
- **Formatting**: Biome with 160 character line width
- **Linting**: Fix all Biome warnings before commit
- **No CommonJS**: Use `import`/`export`, never `require()`/`module.exports`
- **Pinned dependencies**: Specific versions only (`"express": "5.1.0"`) - except peer dependencies

## Security Requirements

- Input validation on all endpoints
- CSRF protection on state-changing operations
- Parameterized database queries (Prisma)
- No sensitive data in logs
- Encrypted session storage

## Common Pitfalls to Avoid

1. **Don't put business logic in apps/** - Use libs/ modules
2. **Don't hardcode values** - Use environment variables
3. **Don't skip Welsh translations** - Required for all user-facing text
4. **Don't use CommonJS** - ES modules only
5. **Don't ignore TypeScript errors** - Fix or justify with comments
6. **Don't duplicate dependencies** - Check root package.json first
7. **Don't create circular dependencies** between modules
8. **Don't skip accessibility testing** - WCAG 2.1 AA is mandatory
9. **Don't commit secrets** - Use environment variables
10. **Don't use relative imports across packages** - Use @hmcts/* aliases
11. **Don't create types.ts files** - Colocate types with the appropriate code
12. **Don't create generic files like utils.ts** - Be specific (e.g., object-properties.ts, date-formatting.ts)
13. **Don't export functions in order to test them** - Only export functions that are intended to be used outside the module
14. **Don't add comments unless they are meaningful** - If necessary, explain why something is done, not what is done

## Development Workflow

### 1. Feature Development
- Create feature module in libs/
- Write co-located tests
- Import in relevant app

### 2. Database Changes
- Modify schema in apps/postgres/prisma/schema.prisma
- Run `yarn workspace @hmcts/postgres run generate`
- Create migration if needed

### 3. Adding Dependencies
- Check if available in root package.json
- Add to specific package only if needed
- Use exact versions (no ~ or ^)

## Debugging Tips

1. **Module Loading**: Check imports in apps/*/src/app.ts
2. **Database Issues**: Enable Prisma logging with `DEBUG=prisma:query`
3. **Run commands from the root directory**: Run yarn test etc from the root directory

## Adding Pages and Content

### Page Structure
When adding new pages to the application, follow this structure:

1. **Controller** (`apps/web/src/pages/[page-name].ts`)
   - Contains page-specific content and data
   - Renders the corresponding template
   - Example:
   ```typescript
   export const GET = async (_req: Request, res: Response) => {
     res.render("page-name", {
       en: {
         title: "Page Title",
         // Page-specific English content
       },
       cy: {
         title: "Teitl Tudalen",
         // Page-specific Welsh content
       }
     });
   };
   ```

2. **Template** (`apps/web/src/pages/[page-name].njk`)
   - Uses data from controller
   - Extends default layout
   - Accesses both controller data and locale strings

3. **Locale Files** (`apps/web/src/locales/en.ts` and `cy.ts`)
   - ONLY contain reusable, common strings
   - Navigation labels, button text, common headers
   - NOT page-specific content

### Content Organization

**Shared/Common Content** (goes in locale files):
- Navigation labels
- Footer links
- Common button text (Back, Continue, Submit)
- Phase banner text
- Service name
- Common error messages

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
3. **In Locale Files**: Maintain parallel structure between en.ts and cy.ts
4. **Testing**: Always test pages with `?lng=cy` query parameter to verify Welsh content

## Core Principles

* **YAGNI**: You Aren't Gonna Need It - Don't add speculative functionality or features. Always take the simplest approach. 
* **Functional style** favour a simple functional approach. Don't use a class unless you have shared state
* **KISS**: Keep It Simple, Stupid - Avoid unnecessary complexity. Write code that is easy to understand and maintain.
* **Immutable**: Data should be immutable by default. Use const and avoid mutations to ensure predictable state.
* **Side Effects**: Functions should have no side effects. Avoid modifying external state or relying on mutable data.

## Communication Style

Be direct and straightforward. No cheerleading phrases like "that's absolutely right" or "great question." Tell me when my ideas are flawed, incomplete, or poorly thought through. Focus on practical problems and realistic solutions rather than being overly positive or encouraging.

## Technical Approach 

Challenge assumptions, point out potential issues, and ask the hard questions about implementation, scalability, and real-world viability. If something won't work, say so directly and explain why it has problems rather than just dismissing it.