# Migration Guide

This guide documents breaking changes and migration steps for teams adopting updates from this template.

## Table of Contents

1. [Database Migration App/Lib Split](#database-migration-applib-split)
2. [Properties Volume Refactor](#properties-volume-refactor)
3. [Postgres to Prisma Library Migration](#postgres-to-prisma-library-migration)
4. [Dockerfile Updates](#dockerfile-updates)
5. [Helm Chart Updates](#helm-chart-updates)
6. [GitHub Workflows](#github-workflows)

---

## Database Migration App/Lib Split

### Overview

The database layer has been split into two components:
- **`apps/postgres`**: Long-running Prisma Studio service that runs migrations on startup and provides database inspection
- **`libs/postgres-prisma`**: Prisma client library that provides schema collation and client exports

This separation provides a persistent database management interface while keeping the library portable for potential extraction to a separate repository.

### What Changed

**Before:**
- `libs/postgres-prisma/prisma/` contained migrations and base schema
- Migration commands run from `libs/postgres-prisma`
- Migrations executed manually or within application startup

**After:**
- `apps/postgres/prisma/` contains migrations and base schema
- `apps/postgres` deployed as a long-running service that runs migrations on startup
- Provides Prisma Studio interface accessible via ingress
- `libs/postgres-prisma` only handles schema collation and client generation
- Migrations run automatically when the postgres pod starts

### Migration Steps

#### 1. New Structure

The postgres app has been added:
```
apps/postgres/
├── package.json
├── tsconfig.json
├── Dockerfile
├── start.sh               # Startup script: runs migrations, health proxy, and Studio
├── health-server.mjs      # HTTP proxy for health checks
├── prisma/
│   ├── base.prisma        # Base schema (generator + datasource only)
│   ├── schema.prisma      # Collated schema (generated during build)
│   └── migrations/         # All migration files
└── helm/
    ├── Chart.yaml         # Uses HMCTS nodejs chart v3.2.0
    └── values.yaml        # Configured as long-running service
```

#### 2. Library Changes

`libs/postgres-prisma` now:
- Reads base schema from `apps/postgres/prisma/schema.prisma`
- Outputs collated schema to `libs/postgres-prisma/dist/schema.prisma`
- Exports only Prisma client and collation utilities
- No longer has direct migration commands

#### 3. Creating Migrations

**To create a new migration:**

```bash
# From repository root
cd apps/postgres

# Create migration (collation happens automatically)
yarn workspace @hmcts/postgres-prisma run collate
npx prisma migrate dev --name your_migration_name
```

The migration files will be created in `apps/postgres/prisma/migrations/`.

#### 4. Deployment Flow

When deploying via Helm:

1. **Build Phase**: All apps build, including `apps/postgres`
   - Schema collation runs during build
   - Collated schema copied into Docker image

2. **Deploy Phase**: Helm deploys all apps together
   - `apps/postgres` service starts and runs migrations via `start.sh`
   - If migrations fail, pod enters CrashLoopBackOff and restarts
   - Once migrations succeed, health proxy and Prisma Studio start
   - Web, API, and other apps start simultaneously

3. **Runtime**: Postgres pod runs continuously
   - Serves health checks on port 5555
   - Serves Prisma Studio on port 5556
   - Accessible via ingress for database inspection

4. **Rollback**: If migrations fail, pod restarts and retries until fixed

#### 5. Preview Deployments

The `apps/postgres` app is automatically included in preview deployments:
- Detected by `detect-affected-apps.sh` when migrations or Studio code changes
- Image built and pushed like other apps
- Service runs alongside web/API apps
- Prisma Studio accessible at: `<team>-<release>-postgres.preview.platform.hmcts.net`

### Configuration

**Parent Helm Chart** (`helm/expressjs-monorepo-template/Chart.yaml`):
```yaml
dependencies:
  - name: expressjs-monorepo-template-postgres
    version: 0.0.1
    repository: "file://../../apps/postgres/helm"
    condition: postgres.enabled
```

**Preview Values** (`helm/expressjs-monorepo-template/values.preview.template.yaml`):
```yaml
postgres:
  enabled: true

expressjs-monorepo-template-postgres:
  nodejs:
    image: "hmctspublic.azurecr.io/dtsse/expressjs-monorepo-template-postgres:${POSTGRES_IMAGE}"
    ingressHost: "${TEAM_NAME}-{{ .Release.Name }}-postgres.preview.platform.hmcts.net"
    applicationPort: 5555  # Health proxy port
```

### Future Improvements

Potential enhancements:
- Add authentication to Prisma Studio (currently open to ingress users)
- Run migrations as init container when `nodejs` chart supports it
- Simplify health proxy once chart supports custom probe configurations
- Implement read-only mode for production Studio access

### Why This Change?

1. **Database Visibility**: Prisma Studio provides web-based database inspection
2. **Simplified Migrations**: Migrations run automatically on pod startup
3. **Developer Experience**: Easy access to database in preview environments
4. **Security**: Database credentials managed through Kubernetes secrets
5. **Portability**: Client library can be extracted to separate repo
6. **Kubernetes-native**: Uses standard HMCTS nodejs chart pattern

---

## Properties Volume Refactor

### Overview

The properties volume loading system has been refactored to fix timing issues with environment variable loading and simplify the API.

### Breaking Changes

- **Removed**: `configurePropertiesVolume(config, options)` function
- **Added**: `getPropertiesVolumeSecrets(options)` function
- **Changed**: Secret loading timing moved to module-level execution

### Migration Steps

#### 1. Update imports

**Before:**
```typescript
import { configurePropertiesVolume } from "@hmcts/cloud-native-platform";
import config from "config";
```

**After (apps/web):**
```typescript
import { getPropertiesVolumeSecrets } from "@hmcts/cloud-native-platform";
// Note: config import moved inside createApp()
```

**After (apps/api, apps/crons):**
```typescript
import { getPropertiesVolumeSecrets } from "@hmcts/cloud-native-platform";
```

#### 2. Update secret loading in apps/web/src/app.ts

**Before:**
```typescript
export async function createApp(): Promise<Express> {
  await configurePropertiesVolume(config, { chartPath });

  const app = express();
  // ...
}
```

**After:**
```typescript
const chartPath = path.join(__dirname, "../helm/values.yaml");

export async function createApp(): Promise<Express> {
  await getPropertiesVolumeSecrets({ chartPath, injectEnvVars: true });

  const { default: config } = await import("config");
  const app = express();
  // ...
}
```

**Key changes:**
- Call `getPropertiesVolumeSecrets()` first to set `process.env`
- Lazy import `config` after secrets are loaded
- Pass config to functions that need it (e.g., `getRedisClient(config)`)

#### 3. Update apps/api/src/app.ts and apps/crons/src/index.ts

**Before:**
```typescript
export async function createApp(): Promise<Express> {
  const app = express();
  // ...
}
```

**After:**
```typescript
const chartPath = path.join(__dirname, "../helm/values.yaml");

export async function createApp(): Promise<Express> {
  await getPropertiesVolumeSecrets({ chartPath, injectEnvVars: true });

  const app = express();
  // ...
}
```

#### 4. Optional: Use the `omit` parameter

If your app doesn't need certain secrets (e.g., API doesn't use DATABASE_URL):

```typescript
await getPropertiesVolumeSecrets({
  chartPath,
  omit: ["DATABASE_URL"]
});
```

The `omit` parameter accepts both prefixed and unprefixed keys:
- `omit: ["DATABASE_URL"]` - skips `dtsse.DATABASE_URL` and `DATABASE_URL`
- `omit: ["dtsse.DATABASE_URL"]` - skips exact match only

### New Function Signature

```typescript
interface GetSecretsOptions {
  mountPoint?: string;        // Default: "/mnt/secrets"
  failOnError?: boolean;      // Default: true in production
  injectEnvVars?: boolean;    // Default: true
  chartPath?: string;         // Path to helm values.yaml for local dev
  omit?: string[];           // Secrets to skip loading
}

function getPropertiesVolumeSecrets(options?: GetSecretsOptions): Promise<Secrets>
```

### Why This Change?

**Problem**: The config package loads immediately when imported, reading `process.env` before secrets could be set.

**Solution**: Load secrets at module level → set `process.env` → lazy import config → config reads correct env vars.

---

## Postgres to Prisma Library Migration

### Overview

The `apps/postgres` directory has been moved to `libs/postgres-prisma` to better reflect its role as a shared library rather than a deployable application.

### Migration Steps

#### 1. Move the directory

```bash
git mv apps/postgres libs/postgres-prisma
```

#### 2. Update package.json references

Update any references from `@hmcts/postgres` to `@hmcts/postgres-prisma` in:

- `apps/*/package.json` dependencies
- `apps/*/tsconfig.json` references
- `libs/*/package.json` dependencies
- Root `package.json` workspaces (if not using glob)

#### 3. Update tsconfig.json path mappings

In root `tsconfig.json`:

**Before:**
```json
{
  "compilerOptions": {
    "paths": {
      "@hmcts/postgres": ["apps/postgres/src"]
    }
  }
}
```

**After:**
```json
{
  "compilerOptions": {
    "paths": {
      "@hmcts/postgres-prisma": ["libs/postgres-prisma/src"]
    }
  }
}
```

#### 4. Update imports throughout codebase

**Before:**
```typescript
import { prisma } from "@hmcts/postgres";
```

**After:**
```typescript
import { prisma } from "@hmcts/postgres-prisma";
```

Use global search and replace: `@hmcts/postgres` → `@hmcts/postgres-prisma`

#### 5. Update documentation

Update any references in:
- `README.md`
- `ARCHITECTURE.md`
- `CLAUDE.md`

---

## Dockerfile Updates

### Overview

Dockerfiles have been updated to:
1. Set `NODE_OPTIONS` to ensure production builds use the correct module resolution
2. Set `WORKDIR` to the app directory for correct config file resolution

### Migration Steps

#### 1. Add NODE_OPTIONS environment variable

Add the following line to each app's Dockerfile after `ENV NODE_ENV=production`:

```dockerfile
ENV NODE_OPTIONS='--conditions=production'
```

#### 2. Set WORKDIR and update CMD path

The `config` npm module looks for config files relative to the current working directory. Set `WORKDIR` to the app directory and update the CMD path accordingly.

**Before:**
```dockerfile
RUN yarn workspaces focus @hmcts/web --production
ENV NODE_ENV=production
ENV NODE_OPTIONS='--conditions=production'

EXPOSE 3000
CMD ["node", "apps/web/dist/server.js"]
```

**After:**
```dockerfile
RUN yarn workspaces focus @hmcts/web --production
ENV NODE_ENV=production
ENV NODE_OPTIONS='--conditions=production'

WORKDIR /opt/app/apps/web
EXPOSE 3000
CMD ["node", "dist/server.js"]
```

**Key changes:**
- Add `WORKDIR /opt/app/apps/{app-name}` before CMD
- Update CMD path from `apps/{app}/dist/...` to `dist/...`
- This allows the config module to find `./config` directory relative to the app

**Files to update:**
- `apps/web/Dockerfile` - WORKDIR to `/opt/app/apps/web`
- `apps/api/Dockerfile` - WORKDIR to `/opt/app/apps/api`
- `apps/crons/Dockerfile` - WORKDIR to `/opt/app/apps/crons`

---

## Helm Chart Updates

### Overview

Helm chart secrets configuration has been updated to use explicit name/alias structure and match the new properties volume implementation.

### Migration Steps

#### 1. Update keyVaults structure in values.yaml

**Before:**
```yaml
keyVaults:
  rpe:
    secrets:
      - redis-access-key
      - app-insights-connection-string
      - dynatrace-url
```

**After:**
```yaml
keyVaults:
  dtsse:  # Update to your team name
    secrets:
      - name: AppInsightsConnectionString
        alias: APPLICATION_INSIGHTS_CONNECTION_STRING
      - name: db-url
        alias: DATABASE_URL
```

**Key changes:**
- Secrets now use structured format with `name` and `alias`
- `name` is the Azure Key Vault secret name
- `alias` is the environment variable name (typically SCREAMING_SNAKE_CASE)
- Vault name changed from `rpe` to `dtsse` (update to your team name)

#### 2. Update aadIdentityName

Change the identity name to match your team:

```yaml
aadIdentityName: dtsse  # Change from 'rpe' to your team name
```

#### 3. Update image references

Update the image path to match your team and app name:

**Before:**
```yaml
image: 'hmctspublic.azurecr.io/rpe/expressjs-monorepo:latest'
```

**After:**
```yaml
image: 'hmctspublic.azurecr.io/dtsse/expressjs-monorepo-template-web:latest'
```

Pattern: `hmctspublic.azurecr.io/{team}/{repo}-{app}:latest`

#### 4. Update environment variables

Remove or update app-specific environment variables:

**Before:**
```yaml
environment:
  REDIS_URL: 'rpe-redis-{{ .Values.global.environment }}.redis.cache.windows.net'
```

**After:**
```yaml
environment:
  REDIS_URL: 'dtsse-{{ .Values.global.environment }}.redis.cache.windows.net'
```

#### 5. Files to update

- `apps/web/helm/values.yaml`
- `apps/api/helm/values.yaml`
- `apps/crons/helm/values.yaml`

---

## GitHub Workflows

### Overview

New preview deployment workflow added, and existing workflows updated to use `.nvmrc` for Node version management.

### Migration Steps

#### 1. Copy the preview deployment workflow

The preview deployment workflow is completely new and can be copied directly:

**File to copy:**
```bash
cp .github/workflows/preview-deploy.yml your-repo/.github/workflows/
```

#### 2. Copy required scripts

Copy the deployment scripts directory:

```bash
cp -r .github/scripts/ your-repo/.github/
```

**Scripts included:**
- `detect-affected-apps.sh` - Detects which apps changed
- `generate-build-metadata.sh` - Generates build tags
- `set-image-variables.sh` - Sets image variables for deployment
- `deploy-preview.sh` - Deploys to preview environment
- `get-preview-urls.sh` - Extracts preview URLs from ingress

#### 3. Update existing workflows

Update Node.js setup in all workflows:

**Before:**
```yaml
- name: Setup Node.js
  uses: actions/setup-node@v6
  with:
    node-version: '24.11.0'
```

**After:**
```yaml
- name: Setup Node.js
  uses: actions/setup-node@v6
  with:
    node-version-file: '.nvmrc'
    cache: 'yarn'
    cache-dependency-path: '**/yarn.lock'
```

**Files to update:**
- `.github/workflows/test.yml`
- `.github/workflows/e2e.yml`
- Any other workflows using Node.js

#### 4. Configure GitHub secrets

Add required secrets to your repository:

**Required secrets for preview deployments:**
- `AZURE_CREDENTIALS_CFT_PREVIEW` - Azure service principal credentials
- `AZURE_SUBSCRIPTION_CFT_PREVIEW` - Azure subscription ID
- `REGISTRY_LOGIN_SERVER` - Container registry (e.g., `hmctspublic.azurecr.io`)
- `REGISTRY_USERNAME` - Registry username
- `REGISTRY_PASSWORD` - Registry password

#### 5. Update preview environment settings

In `preview-deploy.yml`, update these values for your environment:

```yaml
# Line ~149
- name: Get AKS credentials
  run: |
    az account set --subscription ${{ secrets.AZURE_SUBSCRIPTION_CFT_PREVIEW }}
    az aks get-credentials \
      --admin \
      --resource-group cft-preview-01-rg \  # Update resource group
      --name cft-preview-01-aks \           # Update AKS cluster name
      --overwrite-existing
```

#### 6. Create Helm umbrella chart

Create a parent Helm chart to coordinate deployment of all apps:

**Structure:**
```bash
mkdir -p helm/expressjs-monorepo-template
```

**Chart.yaml:**
```yaml
apiVersion: v2
name: expressjs-monorepo-template
description: Umbrella chart for deploying all services
type: application
version: 0.0.1
annotations:
  team: dtsse  # Update to your team name
dependencies:
  - name: expressjs-monorepo-template-postgres
    version: 0.0.1
    repository: "file://../../apps/postgres/helm"
    condition: postgres.enabled
  - name: expressjs-monorepo-template-web
    version: 0.0.1
    repository: "file://../../apps/web/helm"
    condition: web.enabled
  - name: expressjs-monorepo-template-api
    version: 0.0.1
    repository: "file://../../apps/api/helm"
    condition: api.enabled
  - name: redis
    version: 20.11.3
    repository: https://charts.bitnami.com/bitnami
    condition: redis.enabled
  - name: postgresql
    version: 1.1.0
    repository: oci://hmctspublic.azurecr.io/helm
    condition: postgresql.enabled
```

**values.preview.template.yaml:**
- Use `${APP_IMAGE}` placeholders for dynamic image tags
- Configure ingress hosts with `${TEAM_NAME}` variable
- Set database connection via Kubernetes secrets
- Enable/disable services with conditions

See `helm/expressjs-monorepo-template/values.preview.template.yaml` for full example.

---

## Verification Steps

After completing the migration:

1. **Test local development:**
   ```bash
   yarn dev
   ```

2. **Test builds:**
   ```bash
   yarn build
   ```

3. **Test Docker builds:**
   ```bash
   docker build -t test-web -f apps/web/Dockerfile .
   docker build -t test-api -f apps/api/Dockerfile .
   ```

4. **Test Helm charts:**
   ```bash
   helm lint apps/web/helm/
   helm lint apps/api/helm/
   ```

5. **Test secret loading locally:**
   - Verify `apps/{app}/helm/values.yaml` exists
   - Run app and check that secrets load from Azure Key Vault in development
   - Verify `process.env.DATABASE_URL` is set correctly

6. **Test preview deployments:**
   - Open a PR and verify the preview deployment workflow runs
   - Check that affected apps are detected correctly
   - Verify preview URLs are generated and posted to PR

---

## Rollback Steps

If you need to rollback:

1. **Properties volume:**
   - Keep `getPropertiesVolumeSecrets()` but add back `configurePropertiesVolume()` as a wrapper
   - Move secret loading back to where it was

2. **Postgres library:**
   - Move `libs/postgres-prisma` back to `apps/postgres`
   - Update all references

3. **Helm charts:**
   - Revert to simple string array format for secrets
   - Update vault and identity names back

4. **Workflows:**
   - Revert Node version to hardcoded value
   - Remove preview deployment workflow

---

## Support

For questions or issues with migration:

1. Check existing issues in the template repository
2. Review the git commits for detailed changes: `git log master..feature/VIBE-119-preview-deployment-pipeline`
3. Compare files directly: `git diff master..feature/VIBE-119-preview-deployment-pipeline -- path/to/file`
