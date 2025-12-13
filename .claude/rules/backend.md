---
paths: libs/**/src/routes/**/*.ts, apps/api/**/*.ts, libs/**/prisma/*.prisma
---

# Backend Development Rules

## API Route Pattern

Routes live in `src/routes/` directories of `libs` and export named HTTP method functions. Routes are auto-discovered by `createSimpleRouter`.

### Route Structure

```typescript
// libs/[module]/src/routes/[resource].ts
import type { Request, Response } from "express";

// GET /api/resource
export const GET = async (req: Request, res: Response) => {
  const result = await resourceService.findAll();
  res.json(result);
};

// POST /api/resource
export const POST = async (req: Request, res: Response) => {
  const errors = validateInput(req.body);
  if (errors.length > 0) {
    return res.status(400).json({ errors });
  }

  const result = await resourceService.create(req.body);
  res.status(201).json(result);
};
```

### Dynamic Routes

Use bracket notation for URL parameters:

```
routes/users/[id].ts     → /api/users/:id
routes/cases/[caseId].ts → /api/cases/:caseId
```

```typescript
// routes/users/[id].ts
export const GET = async (req: Request, res: Response) => {
  const { id } = req.params;
  const user = await userService.findById(id);

  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  res.json(user);
};

export const PUT = async (req: Request, res: Response) => {
  const { id } = req.params;
  // Update logic
};

export const DELETE = async (req: Request, res: Response) => {
  const { id } = req.params;
  // Delete logic
};
```

### Route Rules

- **No business logic in routes** - delegate to service functions
- **Validate input first** - return 400 for invalid requests
- **Use appropriate status codes** - 200, 201, 400, 401, 403, 404, 500
- **Return consistent response shapes** - same structure for success/error

## Service Layer Pattern

Services encapsulate business logic and are the only layer that should contain domain rules.

### Service Structure

```typescript
// libs/[module]/src/[feature]/[feature]-service.ts
import { prisma } from "@hmcts/postgres-prisma";

export async function createUser(data: CreateUserInput): Promise<User> {
  // Business validation
  if (await emailExists(data.email)) {
    throw new Error("Email already registered");
  }

  // Business logic
  return prisma.user.create({
    data: {
      ...data,
      createdAt: new Date()
    }
  });
}

export async function findUserById(id: string): Promise<User | null> {
  return prisma.user.findUnique({
    where: { id }
  });
}
```

### Service Rules

- **Pure functions preferred** - same input always produces same output
- **Throw descriptive errors** - include context for debugging
- **Single responsibility** - one service per domain concept
- **No HTTP concerns** - services don't know about requests/responses

## Data Access with Prisma

### Query Organization

For complex domains, separate queries from services:

```typescript
// libs/[module]/src/[feature]/[feature]-queries.ts
import { prisma } from "@hmcts/postgres-prisma";

export async function findUserWithCases(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    include: {
      cases: {
        orderBy: { createdAt: "desc" },
        take: 10
      }
    }
  });
}
```

### Prisma Schema Conventions

```prisma
model User {
  id        String   @id @default(cuid())
  email     String   @unique
  firstName String   @map("first_name")
  lastName  String   @map("last_name")
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  cases Case[]

  @@index([email])
  @@map("user")
}
```

**Naming rules:**
- Model names: PascalCase (`User`, `CaseDocument`)
- Table names: singular snake_case via `@@map("user")`
- Field names: camelCase in code, snake_case in DB via `@map`
- Add `@@index` for frequently queried fields

### Query Optimization

```typescript
// Select only required fields
const users = await prisma.user.findMany({
  select: {
    id: true,
    email: true,
    firstName: true
  }
});

// Pagination
const cases = await prisma.case.findMany({
  skip: (page - 1) * pageSize,
  take: pageSize,
  orderBy: { createdAt: "desc" }
});

// Avoid N+1 with includes
const usersWithCases = await prisma.user.findMany({
  include: { cases: true }
});
```

## Transaction Management

Use transactions for operations that must succeed or fail together:

```typescript
export async function transferCase(caseId: string, newOwnerId: string) {
  return prisma.$transaction(async (tx) => {
    const existingCase = await tx.case.findUnique({
      where: { id: caseId }
    });

    if (!existingCase) {
      throw new Error("Case not found");
    }

    await tx.caseHistory.create({
      data: {
        caseId,
        action: "TRANSFERRED",
        previousOwnerId: existingCase.ownerId,
        newOwnerId
      }
    });

    return tx.case.update({
      where: { id: caseId },
      data: { ownerId: newOwnerId }
    });
  });
}
```

## Input Validation

### Validation Function Pattern

```typescript
// libs/[module]/src/[feature]/[feature]-validation.ts

export function validateCreateUser(input: unknown): ValidationResult {
  const errors: ValidationError[] = [];

  if (!input || typeof input !== "object") {
    return { valid: false, errors: [{ field: "body", message: "Invalid request body" }] };
  }

  const data = input as Record<string, unknown>;

  if (!data.email || typeof data.email !== "string") {
    errors.push({ field: "email", message: "Email is required" });
  } else if (!isValidEmail(data.email)) {
    errors.push({ field: "email", message: "Enter a valid email address" });
  }

  if (!data.firstName || typeof data.firstName !== "string") {
    errors.push({ field: "firstName", message: "First name is required" });
  }

  return {
    valid: errors.length === 0,
    errors,
    data: errors.length === 0 ? data as CreateUserInput : undefined
  };
}

interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  data?: CreateUserInput;
}

interface ValidationError {
  field: string;
  message: string;
}
```

### Using Validation in Routes

```typescript
export const POST = async (req: Request, res: Response) => {
  const validation = validateCreateUser(req.body);

  if (!validation.valid) {
    return res.status(400).json({ errors: validation.errors });
  }

  const user = await createUser(validation.data);
  res.status(201).json(user);
};
```

## Error Handling

### Route-Level Error Handling

```typescript
export const POST = async (req: Request, res: Response) => {
  try {
    const result = await someService.process(req.body);
    res.status(201).json(result);
  } catch (error) {
    if (error instanceof ValidationError) {
      return res.status(400).json({ error: error.message });
    }
    if (error instanceof NotFoundError) {
      return res.status(404).json({ error: error.message });
    }
    if (error instanceof UnauthorizedError) {
      return res.status(401).json({ error: error.message });
    }

    // Log unexpected errors, return generic message
    console.error("Unexpected error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
```

### Custom Error Classes

```typescript
// libs/[module]/src/errors.ts
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export class NotFoundError extends Error {
  constructor(resource: string, id: string) {
    super(`${resource} with id ${id} not found`);
    this.name = "NotFoundError";
  }
}
```

## Middleware Pattern

### Factory Function Pattern

```typescript
// libs/[module]/src/[middleware-name]-middleware.ts
import type { Request, Response, NextFunction } from "express";

export function requireAuth() {
  return async (req: Request, res: Response, next: NextFunction) => {
    const token = req.headers.authorization?.replace("Bearer ", "");

    if (!token) {
      return res.status(401).json({ error: "Authentication required" });
    }

    try {
      const user = await verifyToken(token);
      req.user = user;
      next();
    } catch {
      res.status(401).json({ error: "Invalid token" });
    }
  };
}
```

### Applying Middleware

Middleware is applied in `apps/api/src/app.ts`:

```typescript
// Global middleware (applied to all routes)
app.use(express.json());
app.use(cors({ origin: process.env.CORS_ORIGIN }));

// Route-specific middleware applied via simple-router
```

## HTTP Status Codes

| Code | Usage |
|------|-------|
| 200 | Successful GET, PUT, DELETE |
| 201 | Successful POST (resource created) |
| 204 | Successful DELETE (no content) |
| 400 | Validation error, malformed request |
| 401 | Authentication required or failed |
| 403 | Authenticated but not authorized |
| 404 | Resource not found |
| 409 | Conflict (duplicate resource) |
| 500 | Unexpected server error |

## Response Formats

### Success Response

```typescript
// Single resource
res.json({ id: "123", name: "John", email: "john@example.com" });

// Collection
res.json({
  data: [...],
  pagination: {
    page: 1,
    pageSize: 20,
    total: 100
  }
});

// Created resource
res.status(201).json({ id: "new-id", ...createdData });
```

### Error Response

```typescript
// Single error
res.status(400).json({ error: "Email is required" });

// Multiple errors (validation)
res.status(400).json({
  errors: [
    { field: "email", message: "Enter a valid email address" },
    { field: "firstName", message: "First name is required" }
  ]
});
```

## File Organization

```
libs/my-module/
├── prisma/
│   └── schema.prisma           # Database schema
└── src/
    ├── config.ts               # Module configuration (apiRoutes, etc.)
    ├── index.ts                # Business logic exports
    ├── routes/                 # API route handlers
    │   ├── resource.ts         # /api/resource
    │   ├── resource.test.ts
    │   └── resource/
    │       ├── [id].ts         # /api/resource/:id
    │       └── [id].test.ts
    └── resource/               # Domain logic
        ├── resource-service.ts
        ├── resource-service.test.ts
        ├── resource-queries.ts
        └── resource-validation.ts
```

## Testing API Routes

```typescript
// routes/users.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET, POST } from "./users.js";

vi.mock("../user/user-service.js", () => ({
  findAllUsers: vi.fn(),
  createUser: vi.fn()
}));

describe("GET /api/users", () => {
  it("returns list of users", async () => {
    const mockUsers = [{ id: "1", name: "John" }];
    vi.mocked(findAllUsers).mockResolvedValue(mockUsers);

    const req = {} as Request;
    const res = {
      json: vi.fn()
    } as unknown as Response;

    await GET(req, res);

    expect(res.json).toHaveBeenCalledWith({ users: mockUsers });
  });
});

describe("POST /api/users", () => {
  it("returns 400 for invalid input", async () => {
    const req = { body: {} } as Request;
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    } as unknown as Response;

    await POST(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });
});
```

## Anti-Patterns to Avoid

### Route Anti-Patterns

- ❌ Business logic in route handlers
- ❌ Direct Prisma calls in routes (use services)
- ❌ Inconsistent response formats
- ❌ Missing input validation
- ❌ Generic error messages ("Something went wrong")

### Service Anti-Patterns

- ❌ HTTP concerns in services (req, res, status codes)
- ❌ Swallowing errors without logging
- ❌ Side effects without transactions
- ❌ Circular dependencies between services

### Database Anti-Patterns

- ❌ N+1 queries (use `include` or batch queries)
- ❌ Selecting all fields when only a few needed
- ❌ Missing indexes on frequently queried fields
- ❌ Raw SQL when Prisma can handle it
- ❌ Forgetting `@map` for snake_case DB columns

### Security Anti-Patterns

- ❌ Trusting user input without validation
- ❌ Exposing internal error details to clients
- ❌ Logging sensitive data (passwords, tokens)
- ❌ Missing authentication on protected routes
