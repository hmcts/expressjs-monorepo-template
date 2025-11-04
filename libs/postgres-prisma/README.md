# @hmcts/postgres-prisma

Database layer using Prisma ORM with PostgreSQL.

## Schema Collation System

This package uses a schema collation system that combines Prisma schema fragments from multiple modules into a single schema file.

### How it works

1. **Base schema**: `prisma/schema.prisma` contains only the generator and datasource configuration
2. **Module fragments**: Each module can have Prisma schema fragments in `libs/*/prisma/*.prisma`
3. **Collation**: The `yarn collate` command combines all fragments into `dist/schema.prisma`
4. **Usage**: All Prisma commands use the collated schema at `dist/schema.prisma`

### Adding schema to a module

Create a Prisma fragment in your module:

```prisma
// libs/my-module/prisma/models.prisma
model MyModel {
  id        String   @id @default(cuid())
  name      String
  createdAt DateTime @default(now()) @map("created_at")

  @@map("my_model")
}

enum MyEnum {
  OPTION_ONE
  OPTION_TWO
}
```

The collation script will automatically discover and include your models and enums.

### Commands

All commands automatically run collation before execution:

```bash
# Generate Prisma Client
yarn workspace @hmcts/postgres-prisma generate

# Run migrations
yarn workspace @hmcts/postgres-prisma migrate:dev

# Open Prisma Studio
yarn workspace @hmcts/postgres-prisma studio

# Just collate (rarely needed directly)
yarn workspace @hmcts/postgres-prisma collate
```

### Important Notes

- The `dist/` directory is gitignored - it's generated on demand
- Models can reference each other across modules (Prisma will validate relationships)
- Enums are shared globally across all models
- Each fragment should be valid Prisma syntax but doesn't need to be a complete schema