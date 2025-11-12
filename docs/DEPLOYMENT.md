# Deployment Guide

This guide explains how automated deployments work in this project.

## Deployment Types

1. **Preview Deployments**: Automated PR environments for testing changes
2. **Master Deployments**: Production artifact publishing on merge to master

---

# Preview Deployment Guide

This section explains how the automated preview deployment workflow works when pull requests are created or updated.

## Overview

The preview deployment system automatically creates isolated environments for each pull request, allowing teams to test changes before merging to the main branch. Each preview environment includes all services (web, API, database) running in a dedicated Kubernetes namespace.

**Trigger**: Pull requests to `master` branch (opened, synchronized, or reopened)

**Result**: Isolated preview environment with dedicated URLs for each service

**Cleanup**: Automatic when PR is closed

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Preview Deployment Flow                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  PR Created/Updated                                             │
│         ↓                                                       │
│  ┌──────────────────────────────────────────────────┐           │
│  │ 1. SETUP: Detect Affected Apps                   │           │
│  │    • Use Turborepo to detect changed apps        │           │
│  │    • Filter to apps with Dockerfiles             │           │
│  │    • Output: JSON arrays for matrix builds       │           │
│  └──────────────────┬───────────────────────────────┘           │
│                     ↓                                           │
│  ┌──────────────────────────────────────────────────┐           │
│  │ 2. BUILD MATRIX: Generate Metadata (Parallel)    │           │
│  │    • Extract team/app names from Chart.yaml      │           │
│  │    • Generate image tags: pr-{id}-{sha}          │           │
│  │    • Set registry paths: team/app-name           │           │
│  └──────────────────┬───────────────────────────────┘           │
│                     ↓                                           │
│  ┌──────────────────────────────────────────────────┐           │
│  │ 3. BUILD & PUSH: Docker Images (Parallel)        │           │
│  │    • Build affected apps only                    │           │
│  │    • Tag with SHA tag + static PR tag            │           │
│  │    • Push to Azure Container Registry            │           │
│  └──────────────────┬───────────────────────────────┘           │
│                     ↓                                           │
│  ┌──────────────────────────────────────────────────┐           │
│  │ 4. DEPLOY: Helm Chart to Preview                 │           │
│  │    • Set dynamic image variables                 │           │
│  │    • Deploy umbrella chart with dependencies     │           │
│  │    • Create PostgreSQL database + Redis          │           │
│  │    • Wait for pods to be ready (10min timeout)   │           │
│  └──────────────────┬───────────────────────────────┘           │
│                     ↓                                           │
│  ┌──────────────────────────────────────────────────┐           │
│  │ 5. E2E TESTS: Playwright against Preview         │           │
│  │    • Setup kubectl port-forwards                 │           │
│  │    • Run tests via localhost                     │           │
│  │    • Publish results to PR                       │           │
│  └──────────────────┬───────────────────────────────┘           │
│                     ↓                                           │
│  ┌──────────────────────────────────────────────────┐           │
│  │ 6. CLEANUP: Automated on PR Close                │           │
│  │    • Platform detects PR labels                  │           │
│  │    • Deletes Helm release                        │           │
│  │    • Removes database and Redis                  │           │
│  └──────────────────────────────────────────────────┘           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Step-by-Step Flow

### 1. Setup: Detect Affected Apps

**Job**: `detect-affected`

**Purpose**: Determine which apps changed and need to be rebuilt.

**Process**:
1. Checkout repository with full git history (`fetch-depth: 0`)
2. Install dependencies (`yarn install`)
3. Run `detect-affected-apps.sh` script

**Script Logic** (`.github/scripts/detect-affected-apps.sh`):
```bash
# Use Turborepo to detect changed apps
yarn turbo ls --affected --output=json

# Filter to apps with Dockerfiles
# apps/web/Dockerfile ✓
# apps/api/Dockerfile ✓
# libs/some-lib (no Dockerfile) ✗

# Find all apps with Helm charts
find apps/*/helm -name Chart.yaml
```

**Outputs**:
- `affected-apps`: JSON array of apps that changed (e.g., `["web", "api"]`)
- `helm-apps`: JSON array of all deployable apps (e.g., `["web", "api", "crons", "postgres"]`)
- `has-changes`: Boolean indicating if deployment is needed

**Why This Matters**:
- Only rebuilds changed apps (saves time and resources)
- Allows unaffected apps to use existing images
- Turborepo uses git history to detect changes across the monorepo

---

### 2. Create Build Matrix: Generate Metadata

**Job**: `build-and-publish` (runs in parallel for each affected app)

**Purpose**: Extract metadata for each app and generate image tags.

**Process**:
1. Checkout repository
2. Run `generate-build-metadata.sh` for each affected app

**Script Logic** (`.github/scripts/generate-build-metadata.sh`):
```bash
# Read from app's Helm chart
CHART_PATH="apps/${app_name}/helm/Chart.yaml"

# Extract metadata
team_name=$(grep 'team:' "$CHART_PATH")      # e.g., "dtsse"
app_name=$(grep '^name:' "$CHART_PATH")      # e.g., "expressjs-monorepo-template-web"

# Generate tags
image_tag="pr-${pr_number}-${short_sha}"     # e.g., "pr-123-abc1234"
registry_prefix="${team}/${app}"             # e.g., "dtsse/expressjs-monorepo-template-web"
```

**Outputs** (per app):
- `team-name`: Team identifier (e.g., `dtsse`)
- `application-name`: Full app name from Helm chart
- `registry-prefix`: ACR path (e.g., `dtsse/expressjs-monorepo-template-web`)
- `image-tag`: PR-specific tag (e.g., `pr-123-abc1234`)
- `timestamp`: Build timestamp (for reference)
- `short-sha`: 7-character git SHA

**Why Per-App Metadata**:
- Each app can have different team ownership
- Supports multi-team monorepos
- Enables app-specific tagging strategies

---

### 3. Build & Push: Docker Images

**Job**: `build-and-publish` (continues from step 2)

**Purpose**: Build Docker images only for affected apps and push to Azure Container Registry.

**Process**:
1. Login to Azure Container Registry
2. Build Docker image with multi-stage Dockerfile
3. Tag with two tags:
   - **SHA tag**: `pr-{id}-{sha}` (e.g., `pr-123-abc1234`) - forces pod recreation
   - **Static tag**: `pr-{id}` (e.g., `pr-123`) - stable reference
4. Push both tags to ACR

**Docker Build**:
```bash
# Build with both tags
docker build \
  --tag "hmctspublic.azurecr.io/dtsse/expressjs-monorepo-template-web:pr-123-abc1234" \
  --tag "hmctspublic.azurecr.io/dtsse/expressjs-monorepo-template-web:pr-123" \
  --file apps/web/Dockerfile \
  .

# Push both
docker push "hmctspublic.azurecr.io/dtsse/expressjs-monorepo-template-web:pr-123-abc1234"
docker push "hmctspublic.azurecr.io/dtsse/expressjs-monorepo-template-web:pr-123"
```

**Why Two Tags**:
- **SHA tag**: Forces Kubernetes to pull new image (SHA changes on each commit)
- **Static tag**: Allows unaffected apps to use existing images without SHA

**Parallelization**:
- Each app builds independently in matrix job
- Faster than sequential builds
- Maximum efficiency for large monorepos

---

### 4. Deploy: Root Helm Chart to Preview

**Job**: `deploy-preview`

**Purpose**: Deploy all services to preview environment using umbrella Helm chart.

#### 4.1 Set Environment Variables

**Script Logic** (`.github/scripts/set-image-variables.sh`):
```bash
# For each app with Helm chart:
for app in ["web", "api", "crons", "postgres"]; do
  if app in affected_apps; then
    # Affected: Use SHA tag to force pod recreation
    WEB_IMAGE="pr-123-abc1234"
  else
    # Not affected: Use static PR tag (existing image)
    CRONS_IMAGE="pr-123"
  fi
done

# Also sets
RELEASE_NAME="expressjs-monorepo-template-pr-123"
```

**Result**:
- `WEB_IMAGE=pr-123-abc1234` (rebuilt)
- `API_IMAGE=pr-123-abc1234` (rebuilt)
- `CRONS_IMAGE=pr-123` (not rebuilt, using existing image)
- `POSTGRES_IMAGE=pr-123` (not rebuilt)

#### 4.2 Azure & Kubernetes Setup

1. **Login to Azure**: Service principal authentication
2. **Get AKS credentials**: Access to `cft-preview-01-aks` cluster
3. **Install kubelogin**: Azure CLI authentication for kubectl
4. **Install Helm**: Version 3.13.0
5. **Login to Helm registry**: ACR authentication

#### 4.3 Deploy Helm Chart

**Script** (`.github/scripts/deploy-preview.sh`):

```bash
# Process values template with environment variables
envsubst < values.preview.template.yaml > values.preview.yaml

# Update Helm dependencies
helm dependency update

# Check and fix any stuck releases
check_helm_status "${release_name}" "${namespace}"

# Deploy with retry logic
helm upgrade --install "${release_name}" . \
  --namespace "${namespace}" \
  --values values.preview.yaml \
  --atomic \
  --cleanup-on-fail \
  --wait \
  --timeout 10m
```

**Helm Chart Structure**:
```
helm/expressjs-monorepo-template/  (umbrella chart)
├── Chart.yaml                      (dependencies list)
├── values.preview.template.yaml    (PR-specific values)
└── charts/                         (pulled dependencies)
    ├── expressjs-monorepo-template-web/
    ├── expressjs-monorepo-template-api/
    ├── expressjs-monorepo-template-crons/
    ├── expressjs-monorepo-template-postgres/
    ├── postgresql/                 (HMCTS chart)
    └── redis/                      (Bitnami chart)
```

**Deployment Features**:
- **Atomic**: Rolls back on failure
- **Retry logic**: 3 attempts with exponential backoff
- **Stuck release recovery**: Automatically fixes pending states
- **Timeout**: 10 minutes for all pods to be ready

#### 4.4 Infrastructure Provisioned

**Per-PR Resources**:
- PostgreSQL database: `{release-name}` (on shared Azure Flexible Server)
- Redis instance: `{release-name}-redis-master`
- Kubernetes namespace: `{team-name}` (shared across PRs)
- Ingress hosts: `{team}-{release}-{app}.preview.platform.hmcts.net`

**Example**:
- Database: `expressjs-monorepo-template-pr-123`
- Redis: `expressjs-monorepo-template-pr-123-redis-master`
- Web URL: `https://dtsse-expressjs-monorepo-template-pr-123-web.preview.platform.hmcts.net`
- API URL: `https://dtsse-expressjs-monorepo-template-pr-123-api.preview.platform.hmcts.net`

#### 4.5 Get Preview URLs

**Script** (`.github/scripts/get-preview-urls.sh`):
```bash
# Query Kubernetes for ingress resources
kubectl get ingress \
  -n "${namespace}" \
  -l "app.kubernetes.io/instance=${release_name}" \
  -o json

# Extract hostnames
{"web": "https://...", "api": "https://...", "postgres": "https://..."}
```

**Posted to PR**:
```markdown
## Preview Deployment Successful 🚀

Your preview environment is ready:

- **Web**: https://dtsse-expressjs-monorepo-template-pr-123-web.preview.platform.hmcts.net
- **Api**: https://dtsse-expressjs-monorepo-template-pr-123-api.preview.platform.hmcts.net
- **Postgres**: https://dtsse-expressjs-monorepo-template-pr-123-postgres.preview.platform.hmcts.net

The environment will be automatically cleaned up when this PR is closed.
```

#### 4.6 Add Cleanup Labels

**Labels added to PR**:
- `ns:dtsse` - Kubernetes namespace
- `prd:dtsse` - Product/team name
- `rel:expressjs-monorepo-template-pr-123` - Specific release

**Purpose**: Platform automation uses these labels to trigger cleanup when PR closes.

---

### 5. Run E2E Tests

**Job**: `e2e-tests`

**Purpose**: Run Playwright end-to-end tests against the deployed preview environment.

#### 5.1 Setup Port-Forwards

**Why Port-Forwards**:
- Preview ingress may have network restrictions
- Provides direct access to Kubernetes services
- Avoids TLS certificate issues in tests
- Faster than routing through ingress

**Script** (`.github/scripts/setup-port-forwards.sh`):
```bash
# Forward Kubernetes services to localhost
kubectl port-forward service/${release_name}-web 3000:80 &
kubectl port-forward service/${release_name}-api 3001:80 &
kubectl port-forward service/${release_name}-postgres 5555:80 &

# Store PIDs for cleanup
echo $! >> /tmp/port-forward-pids-${release_name}.txt
```

**Result**:
- Web accessible at: `http://localhost:3000`
- API accessible at: `http://localhost:3001`
- Postgres Studio at: `http://localhost:5555`

#### 5.2 Run Playwright Tests

```bash
# Set environment variables for Playwright
export EXPRESSJS_MONOREPO_TEMPLATE_WEB_URL=http://localhost:3000
export EXPRESSJS_MONOREPO_TEMPLATE_API_URL=http://localhost:3001

# Run tests
yarn workspace e2e-tests run test:e2e
```

**Playwright Configuration**:
- Browser: Chromium (with dependencies)
- Timeout: 15 minutes
- Output: JUnit XML for reporting

#### 5.3 Publish Results

**Test Reporter**:
- Posted as PR check: "E2E Test Results (Preview)"
- Status: Pass/Fail with test counts
- Comment on PR with detailed results

**Artifacts on Failure**:
- `playwright-test-results-preview/`: Screenshots, traces, videos
- `application-logs-preview/`: Server logs captured during tests
- Retention: 7 days

#### 5.4 Cleanup

```bash
# Kill port-forward processes
.github/scripts/cleanup-port-forwards.sh "${release_name}"
```

---

### 6. Cleanup: Automated on PR Close

**Trigger**: PR closed or merged

**Mechanism**: HMCTS platform automation

**Process**:
1. Platform monitors GitHub PRs
2. Detects PRs with cleanup labels (`ns:`, `prd:`, `rel:`)
3. When PR closes:
   - Deletes Helm release: `helm uninstall {release_name} -n {namespace}`
   - Removes database: PostgreSQL drops `{release_name}` database
   - Removes Redis: Redis instance deleted
   - Cleans up pods and services

**Manual Cleanup** (if needed):
```bash
# Delete Helm release
helm uninstall expressjs-monorepo-template-pr-123 -n dtsse

# Verify cleanup
kubectl get pods -n dtsse
kubectl get ingress -n dtsse
```

---

## Image Tag Strategy

### Problem: Force Pod Recreation

Kubernetes only pulls new images if the image tag changes. Using `latest` or a static tag means pods won't restart when images are updated.

### Solution: Dual Tagging

**For Affected Apps** (rebuilt):
- Tag: `pr-{id}-{sha}` (e.g., `pr-123-abc1234`)
- SHA changes on every commit → forces pod recreation
- Ensures latest code is deployed

**For Unaffected Apps** (not rebuilt):
- Tag: `pr-{id}` (e.g., `pr-123`)
- Static tag points to last build for this PR
- Avoids unnecessary image pulls
- Uses existing, tested image

**Example Scenario**:

```bash
# Initial PR (commit abc1234)
WEB_IMAGE=pr-123-abc1234    # web changed
API_IMAGE=pr-123-abc1234    # api changed
CRONS_IMAGE=pr-123          # crons not changed (no rebuild)

# New commit (commit def5678) - only web changed
WEB_IMAGE=pr-123-def5678    # web rebuilt with new SHA
API_IMAGE=pr-123-abc1234    # api rebuilt? No, use static tag
CRONS_IMAGE=pr-123          # crons still not changed
```

**Build Process**:
```bash
# On every build, push both tags
docker push image:pr-123-abc1234  # SHA tag (forces pull)
docker push image:pr-123          # Static tag (updates pointer)
```

---

## Environment Variables

### Global (Workflow Level)

```yaml
CHANGE_ID: ${{ github.event.pull_request.number }}
SHORT_SHA: ${{ github.sha }}
REGISTRY: hmctspublic.azurecr.io
```

### Build Job (Per App)

```bash
TEAM_NAME=dtsse                                    # From Chart.yaml
APPLICATION_NAME=expressjs-monorepo-template-web   # From Chart.yaml
REGISTRY_PREFIX=dtsse/expressjs-monorepo-template-web
IMAGE_TAG=pr-123-abc1234
```

### Deploy Job

```bash
TEAM_NAME=dtsse
APPLICATION_NAME=expressjs-monorepo-template
RELEASE_NAME=expressjs-monorepo-template-pr-123
GIT_REPO=https://github.com/hmcts/expressjs-monorepo-template

# Dynamic image variables (set by set-image-variables.sh)
WEB_IMAGE=pr-123-abc1234
API_IMAGE=pr-123-abc1234
CRONS_IMAGE=pr-123
POSTGRES_IMAGE=pr-123
```

### E2E Tests

```bash
EXPRESSJS_MONOREPO_TEMPLATE_WEB_URL=http://localhost:3000
EXPRESSJS_MONOREPO_TEMPLATE_API_URL=http://localhost:3001
EXPRESSJS_MONOREPO_TEMPLATE_POSTGRES_URL=http://localhost:5555
```

---

## Helm Chart Configuration

### Umbrella Chart Dependencies

**File**: `helm/expressjs-monorepo-template/Chart.yaml`

```yaml
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

### Values Template

**File**: `helm/expressjs-monorepo-template/values.preview.template.yaml`

Uses environment variable substitution:

```yaml
web:
  enabled: true
  expressjs-monorepo-template-web:
    nodejs:
      image: "hmctspublic.azurecr.io/${TEAM_NAME}/${APPLICATION_NAME}-web:${WEB_IMAGE}"
      ingressHost: "${TEAM_NAME}-${RELEASE_NAME}-web.preview.platform.hmcts.net"
      applicationPort: 3000
      environment:
        DATABASE_URL: "postgresql://..."
        REDIS_URL: "redis://..."
```

**Processing**:
```bash
# Replace ${VARIABLE} with actual values
envsubst < values.preview.template.yaml > values.preview.yaml
```

---

## Concurrency Control

**Workflow Concurrency**:
```yaml
concurrency:
  group: preview-${{ github.event.pull_request.number }}
  cancel-in-progress: true
```

**Behavior**:
- Only one deployment per PR at a time
- New push cancels in-progress deployment
- Prevents race conditions
- Saves compute resources

**Example**:
```
10:00 - Push commit A → deployment starts
10:05 - Push commit B → commit A deployment cancelled, commit B starts
10:10 - Commit B deployment completes
```

---

## Troubleshooting

### Build Failed

**Check**:
1. Review build logs in GitHub Actions
2. Verify Dockerfile exists: `apps/{app}/Dockerfile`
3. Check Docker build context (root of monorepo)
4. Ensure all dependencies are available

**Common Issues**:
- Missing dependencies in Dockerfile
- Build context not including required files
- Registry authentication failure

### Deployment Failed

**Check**:
1. Review Helm deployment logs
2. Check pod status: `kubectl get pods -n dtsse`
3. Check pod logs: `kubectl logs -n dtsse {pod-name}`
4. Verify image exists in ACR

**Common Issues**:
- Image pull errors (check ACR credentials)
- Resource limits too low (pods OOMKilled)
- Health checks failing (misconfigured probes)
- Database connection failures

**Helm Stuck States**:

The deployment script automatically handles stuck releases:
- `pending-upgrade`: Rolls back to last successful revision
- `pending-install`: Uninstalls and retries
- `failed`: Cleans up and retries

### E2E Tests Failed

**Check**:
1. Download test artifacts from GitHub Actions
2. Review screenshots and traces
3. Check port-forward logs
4. Verify services are accessible

**Common Issues**:
- Port-forward disconnected
- Services not ready (race condition)
- Test environment variables incorrect
- Browser compatibility issues

### Manual Deployment

If CI/CD fails, you can deploy manually:

```bash
# 1. Build and push image locally
docker build -t hmctspublic.azurecr.io/dtsse/expressjs-monorepo-template-web:pr-123-local \
  -f apps/web/Dockerfile .
docker push hmctspublic.azurecr.io/dtsse/expressjs-monorepo-template-web:pr-123-local

# 2. Run deployment script
export WEB_IMAGE=pr-123-local
.github/scripts/deploy-preview.sh 123

# 3. Access preview
kubectl get ingress -n dtsse
```

---

## Security Considerations

### Secrets Management

**GitHub Secrets Required**:
- `AZURE_CREDENTIALS_CFT_PREVIEW`: Service principal credentials
- `AZURE_SUBSCRIPTION_CFT_PREVIEW`: Azure subscription ID
- `REGISTRY_LOGIN_SERVER`: `hmctspublic.azurecr.io`
- `REGISTRY_USERNAME`: ACR username
- `REGISTRY_PASSWORD`: ACR password

**Kubernetes Secrets**:
- Injected via Azure Key Vault
- Managed by HMCTS platform
- Referenced in Helm values:
  ```yaml
  keyVaults:
    dtsse:
      secrets:
        - name: AppInsightsConnectionString
          alias: APPLICATION_INSIGHTS_CONNECTION_STRING
  ```

### Network Security

**Ingress**:
- HTTPS only (TLS certificates managed by platform)
- Accessible from HMCTS VPN or public internet (depending on configuration)
- Each PR has unique hostnames

**Database**:
- Private connection within cluster
- No public endpoint
- Credentials from Key Vault

---

## Performance Optimization

### Build Optimization

**Matrix Strategy**:
- Builds affected apps in parallel
- Reduces total build time
- Maximum of 256 concurrent jobs (GitHub limit)

**Docker Build Cache**:
- Multi-stage builds reduce layer size
- BuildKit for improved caching
- Layer caching between builds

### Deployment Optimization

**Turborepo Change Detection**:
- Analyzes git history
- Detects affected packages
- Avoids unnecessary rebuilds

**Image Reuse**:
- Static PR tags point to existing images
- Unaffected apps skip rebuild
- Reduces registry storage

---

## Monitoring

### GitHub Actions UI

- View workflow runs: `Actions` tab in GitHub
- See job status, logs, and artifacts
- Download test results and screenshots

### Preview Environment

**Application Insights** (if configured):
- Performance metrics
- Error tracking
- Request tracing

**Prisma Studio** (postgres app):
- Database inspection
- Data viewing/editing
- Available at: `https://dtsse-{release}-postgres.preview.platform.hmcts.net`

### Kubernetes Dashboard

```bash
# Get pod status
kubectl get pods -n dtsse

# Get pod logs
kubectl logs -n dtsse {pod-name}

# Get events
kubectl get events -n dtsse --sort-by='.lastTimestamp'
```

---

---

# Master Deployment Guide

This section explains the automated master branch deployment pipeline for publishing production artifacts.

## Overview

The master deployment pipeline provisions infrastructure, builds Docker images, and publishes the Helm chart to Azure Container Registry when code is merged to the master branch.

**Trigger**: Push to `master` branch or manual workflow dispatch

**Result**: Infrastructure provisioned, Docker images published to ACR, Helm chart published to ACR OCI registry

**Target Environments**: AAT (default), Production (manual approval)

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Master Deployment Flow                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Push to Master                                                 │
│         ↓                                                       │
│  ┌──────────────────────────────────────────────────┐           │
│  │ 1. TERRAFORM: Provision Infrastructure           │           │
│  │    • Azure login and setup                       │           │
│  │    • Terraform init with Azure backend           │           │
│  │    • Terraform plan and apply                    │           │
│  └──────────────────┬───────────────────────────────┘           │
│                     ↓                                           │
│  ┌──────────────────────────────────────────────────┐           │
│  │ 2. DETECT: Find Affected Apps (Parallel)         │           │
│  │    • Use Turborepo to detect changes             │           │
│  │    • Reuse detect-affected-apps.sh               │           │
│  └──────────────────┬───────────────────────────────┘           │
│                     ↓                                           │
│  ┌──────────────────────────────────────────────────┐           │
│  │ 3. BUILD: Docker Images (Parallel Matrix)        │           │
│  │    • Build affected apps only                    │           │
│  │    • Tag: {git-sha}, {short-sha}, latest         │           │
│  │    • Push to hmctspublic.azurecr.io              │           │
│  └──────────────────┬───────────────────────────────┘           │
│                     ↓                                           │
│  ┌──────────────────────────────────────────────────┐           │
│  │ 4. HELM: Package and Publish Chart               │           │
│  │    • Update chart dependencies                   │           │
│  │    • Package umbrella chart                      │           │
│  │    • Push to oci://hmctspublic.azurecr.io/helm/  │           │
│  └──────────────────────────────────────────────────┘           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Pipeline Stages

### 1. Terraform Infrastructure Provisioning

**Job**: `terraform`

**Purpose**: Provision and update Azure infrastructure using Terraform.

**Process**:
1. Checkout code
2. Setup Terraform CLI (version from `.terraform-version`)
3. Azure login using service principal
4. Terraform init (with Azure Storage backend)
5. Terraform plan (output to `tfplan`)
6. Terraform apply (auto-approve)

**Infrastructure Directory**: `infrastructure/`

**Files**:
- `main.tf`: Provider and resource definitions
- `variables.tf`: Input variables (env, product, component)
- `state.tf`: Azure Storage backend configuration
- `versions.tf`: Provider version constraints
- `.terraform-version`: Terraform version (1.9.0)

**State Backend**:
```hcl
terraform {
  backend "azurerm" {
    resource_group_name  = "terraform-state-rg"
    storage_account_name = "hmctstfstate"
    container_name       = "tfstate"
    key                  = "expressjs-monorepo-template.terraform.tfstate"
  }
}
```

**Environment Variable**:
- Default: `env=aat`
- Manual dispatch: user selects environment (aat or prod)

### 2. Detect Affected Apps

**Job**: `detect-affected`

**Purpose**: Determine which apps changed and need Docker image rebuilds.

**Process**: Identical to preview deployment
1. Checkout with full git history
2. Install dependencies
3. Run `.github/scripts/detect-affected-apps.sh`
4. Use Turborepo to detect affected apps
5. Filter to apps with Dockerfiles

**Outputs**:
- `affected-apps`: JSON array (e.g., `["web", "api"]`)
- `has-changes`: Boolean

### 3. Build and Publish Docker Images

**Job**: `build-and-publish` (matrix strategy)

**Purpose**: Build Docker images for affected apps and publish to ACR with production tags.

**Process**:
1. Checkout code
2. Generate git SHAs (full and short)
3. Azure Docker login
4. Build Docker image
5. Tag with multiple tags
6. Push all tags to ACR

**Image Tags**:
- Full SHA: `abc1234567890def` (40 chars)
- Short SHA: `abc1234` (7 chars)
- Latest: `latest`

**Example**:
```bash
docker build \
  --tag "hmctspublic.azurecr.io/expressjs-monorepo-template-web:abc1234567890def" \
  --tag "hmctspublic.azurecr.io/expressjs-monorepo-template-web:abc1234" \
  --tag "hmctspublic.azurecr.io/expressjs-monorepo-template-web:latest" \
  --file apps/web/Dockerfile \
  .
```

**Registry**: `hmctspublic.azurecr.io`

**Parallelization**: Each affected app builds in parallel using matrix strategy

### 4. Package and Publish Helm Chart

**Job**: `publish-helm-chart`

**Purpose**: Package the umbrella Helm chart and publish to ACR OCI registry.

**Process**:
1. Checkout code
2. Install Helm (version 3.13.0)
3. Login to Helm registry
4. Run `.github/scripts/publish-helm-chart.sh`

**Script Logic** (`publish-helm-chart.sh`):
```bash
# Navigate to chart directory
cd helm/expressjs-monorepo-template

# Update subchart dependencies
for subchart in ../../apps/*/helm; do
  helm dependency update
done

# Update parent chart dependencies
helm dependency update

# Package chart
helm package .

# Push to ACR OCI registry
helm push expressjs-monorepo-template-0.0.1.tgz \
  oci://hmctspublic.azurecr.io/helm
```

**Chart Registry**: `oci://hmctspublic.azurecr.io/helm/expressjs-monorepo-template`

**Installation**:
```bash
helm install my-release \
  oci://hmctspublic.azurecr.io/helm/expressjs-monorepo-template \
  --version 0.0.1
```

## Concurrency Control

**Workflow Concurrency**:
```yaml
concurrency:
  group: master-deploy
  cancel-in-progress: false
```

**Behavior**:
- Only one master deployment at a time
- New deployment waits for previous to complete
- Prevents concurrent terraform state modifications
- Avoids registry conflicts

## Required GitHub Secrets

**Azure Authentication**:
- `AZURE_CREDENTIALS`: Service principal credentials for Terraform and Azure operations

**Azure Container Registry**:
- `REGISTRY_LOGIN_SERVER`: `hmctspublic.azurecr.io`
- `REGISTRY_USERNAME`: ACR username
- `REGISTRY_PASSWORD`: ACR password/token

## Azure Permissions Required

**Service Principal Permissions**:
1. **Terraform State Storage**: Read/write access to Azure Storage account
2. **Resource Provisioning**: Contributor role on resource group
3. **Key Vault**: Get/List secrets for Key Vault resources
4. **Container Registry**: AcrPush role for pushing images and charts

## Manual Deployment

Trigger workflow manually via GitHub Actions UI:

1. Go to Actions tab
2. Select "Master Deployment" workflow
3. Click "Run workflow"
4. Select target environment (aat or prod)
5. Click "Run workflow"

## Troubleshooting

### Terraform Apply Failed

**Check**:
1. Review Terraform logs in GitHub Actions
2. Verify Azure credentials are valid
3. Check state file access (Storage account permissions)
4. Ensure no manual changes in Azure conflict with Terraform

**Common Issues**:
- State lock timeout (another deployment in progress)
- Insufficient permissions on service principal
- Resource already exists (import required)

### Image Push Failed

**Check**:
1. Verify ACR credentials in GitHub Secrets
2. Check ACR has sufficient storage quota
3. Ensure service principal has AcrPush role

**Common Issues**:
- Authentication failure (expired credentials)
- Registry quota exceeded
- Network timeout

### Helm Chart Push Failed

**Check**:
1. Verify Helm registry credentials
2. Check chart version doesn't already exist
3. Ensure chart dependencies are available

**Common Issues**:
- Chart version conflict (increment version)
- Missing subchart dependencies
- OCI registry authentication failure

## References

- **Scripts**: `.github/scripts/README.md`
- **Architecture**: `docs/ARCHITECTURE.md`
- **Migration Guide**: `docs/MIGRATION.md`
- **Preview Deployment**: See above
- **Master Workflow**: `.github/workflows/master-deploy.yml`
- **Preview Workflow**: `.github/workflows/preview-deploy.yml`
