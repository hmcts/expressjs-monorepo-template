# @hmcts/postgres

Database migration runner application. Executes Prisma migrations as a Kubernetes Job during deployment.

## Purpose

This application:
1. Runs database migrations before other applications start
2. Hosts the base Prisma schema and all migration files
3. Deploys as a Kubernetes Job using the HMCTS `job` chart
4. Ensures migrations succeed before web/API pods start

## Structure

```
apps/postgres/
├── prisma/
│   ├── base.prisma        # Base schema (generator + datasource only)
│   ├── schema.prisma      # Collated schema (generated during build)
│   └── migrations/         # All migration files
├── helm/
│   ├── Chart.yaml         # Uses HMCTS job chart v2.2.0
│   └── values.yaml        # Configured as one-time Job
└── Dockerfile             # Runs: prisma migrate deploy
```

## Creating Migrations

### Local Development

```bash
# 1. Collate schemas from all modules
yarn workspace @hmcts/postgres-prisma run collate

# 2. Create a new migration
cd apps/postgres
npx prisma migrate dev --name your_migration_name

# 3. The migration will be created in prisma/migrations/
```

### Migration Naming

Use descriptive names that explain the change:
- `add_user_table`
- `add_email_to_user`
- `create_case_management_tables`

## Deployment

### How It Works

1. **Build**:
   - `yarn build` runs schema collation
   - Collated `schema.prisma` copied to `apps/postgres/prisma/`
   - Docker image built with migrations and schema

2. **Deploy**:
   - Helm deploys `apps/postgres` Job first (due to dependency order)
   - Job runs `prisma migrate deploy`
   - If migrations fail, deployment fails
   - If migrations succeed, other apps deploy

3. **Job Completion**:
   - Job runs once per deployment
   - Exits after migrations complete
   - Kubernetes cleans up completed Job pods

### Preview Deployments

Migrations run automatically in preview environments:
- Job deploys before web/API
- Uses same database as preview apps
- Changes detected by Turborepo

### Production Deployments

Configure via Flux/ArgoCD to:
- Enable the postgres subchart
- Set the correct image tag
- Configure DATABASE_URL via Azure Key Vault

## Configuration

### Helm Values

**Development/Preview** (`apps/postgres/helm/values.yaml`):
```yaml
global:
  jobKind: Job  # One-time job
  enableKeyVaults: true

job:
  image: hmctspublic.azurecr.io/dtsse/expressjs-monorepo-template-postgres:latest
  backoffLimit: 2      # Retry twice on failure
  restartPolicy: Never # Don't restart on failure
```

### Environment Variables

- `DATABASE_URL`: PostgreSQL connection string (from Azure Key Vault)

## Troubleshooting

### Migration Failed

```bash
# Check job logs
kubectl logs -n <namespace> <release-name>-postgres

# View job status
kubectl get job -n <namespace> <release-name>-postgres

# Describe job for events
kubectl describe job -n <namespace> <release-name>-postgres
```

### Manual Migration Run

```bash
# Port-forward to database
kubectl port-forward -n <namespace> service/postgres 5432:5432

# Set DATABASE_URL
export DATABASE_URL="postgresql://..."

# Run migrations locally
cd apps/postgres
npx prisma migrate deploy
```

### Reset Local Database

```bash
# WARNING: Destroys all data
yarn workspace @hmcts/postgres-prisma run collate
cd apps/postgres
npx prisma migrate reset
```

## Related

- **Schema Collation**: See `libs/postgres-prisma/README.md`
- **Prisma Client**: Exported by `@hmcts/postgres-prisma`
- **Migration Guide**: See `docs/MIGRATION.md`

## Future Improvements

When the HMCTS `nodejs` chart supports init containers, this app could be simplified to run as an init container instead of a separate Job. The init container would:
- Run migrations
- Exit gracefully
- Allow main container to start

For now, the Job pattern provides a reliable solution.
