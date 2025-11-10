# VIBE-119: Infrastructure Pipeline: Deploy to Preview

## Overview

This specification outlines the infrastructure pipeline implementation for automated deployment to Preview environments when Pull Requests are created. The pipeline will build Docker images for each application, push them to Azure Container Registry, deploy using Helm charts, and run end-to-end tests against the deployed application.

## 1. Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                        GitHub Actions Pipeline Flow                          │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────┐          │
│  │ 1. TRIGGER: Pull Request                                       │          │
│  └────────────────────┬───────────────────────────────────────────┘          │
│                       ↓                                                      │
│  ┌────────────────────────────────────────────────────────────────┐          │
│  │ 2. BUILD & PUBLISH (Parallel Matrix Jobs - Affected Apps)      │          │
│  │                                                                │          │
│  │  ┌───────────────────────────────────────────────────────┐     │          │
│  │  │    [APP] BUILD (Turbo --affected detection)           │     │          │
│  │  ├───────────────────────────────────────────────────────┤     │          │
│  │  │ • Detect affected apps via Turborepo                  │     │          │
│  │  │ • Build Docker Image                                  │     │          │
│  │  │ • Tag: pr-123-abc1234                                 │     │          │
│  │  │ • Push to ACR                                         │     │          │
│  │  └───────────────────────────────────────────────────────┘     │          │
│  └────────────────────┬───────────────────────────────────────────┘          │
│                       ↓                                                      │
│  ┌────────────────────────────────────────────────────────────────┐          │
│  │ 3. DEPLOY ROOT CHART TO PREVIEW                                │          │
│  │                                                                │          │
│  │  • Reference app charts via file:// paths                      │          │
│  │  • Deploy umbrella chart with platform tags/labels             │          │
│  └────────────────────┬───────────────────────────────────────────┘          │
│                       ↓                                                      │
│  ┌────────────────────────────────────────────────────────────────┐          │
│  │ 4. RUN E2E TESTS                                               │          │
│  └────────────────────┬───────────────────────────────────────────┘          │
│                       ↓                                                      │
│  ┌────────────────────────────────────────────────────────────────┐          │
│  │ 5. CLEANUP (On PR Closure - via GitHub Labels)                 │          │
│  │                                                                │          │
│  │  • Platform detects PR labels (ns:, prd:, rel:)                │          │
│  │  • Delete Helm release (automated)                             │          │
│  │  • Remove Docker images from ACR                               │          │
│  │  • Database cleanup (platform-managed)                         │          │
│  └────────────────────────────────────────────────────────────────┘          │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────┐
│                         Azure Preview Environment                            │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌────────────────────┐        ┌────────────────────┐                        │
│  │   Web (pr-123)     │◄───────┤   API (pr-123)     │                        │
│  │    Port: 3000      │        │    Port: 3001      │                        │
│  └────────┬───────────┘        └────────┬───────────┘                        │
│           └──────────────┬───────────────┘                                   │
│                          ↓                                                   │
│  ┌───────────────────────────────────────────────────┐                       │
│  │                     Redis                         │                       │
│  └───────────────────────────────────────────────────┘                       │
│                                                                              │
│  ┌───────────────────────────────────────────────────┐                       │
│  │    Platform Services (ASO-managed):               │                       │
│  │    PostgreSQL Flexible Server, KeyVault           │                       │
│  └───────────────────────────────────────────────────┘                       │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

## 2. GitHub Actions Workflow Structure

### 2.1 Main Preview Deployment Workflow

**File**: `.github/workflows/preview-deploy.yml`

The workflow consists of the following jobs:

1. **Detect Affected Apps**: Use Turborepo to identify which apps have changed
2. **Build Images**: Build and push Docker images for affected apps only
3. **Deploy Preview**: Deploy root Helm chart with platform tags and PR labels
4. **E2E Tests**: Run Playwright tests against the deployed environment

### 2.2 Workflow Jobs Breakdown

#### Job 1: Build and Publish (Parallel per Affected App)
- **Purpose**: Build Docker images for affected apps only (detected via Turborepo)
- **Change Detection**: Use `turbo ls --affected --filter=./apps/* --output=json` to determine which apps changed
- **Matrix Strategy**: Process only affected apps in parallel
- **Metadata Extraction**: Each app reads from its own `apps/{app}/helm/Chart.yaml`:
  - Team name from `annotations.team` field
  - Application name from `name` field
  - Produces image path: `${TEAM_NAME}/${APPLICATION_NAME}`
- **Steps per app**:
  1. Extract metadata from app's Helm chart
  2. Build Docker image with app-specific naming
  3. Tag with `pr-{number}-{sha}` (timestamped tag) and `pr-{number}` (static tag)
  4. Push both tags to Azure Container Registry
- **Outputs**:
  - `timestamp`: Build timestamp (shared across all apps)
  - `short-sha`: Short git SHA (shared across all apps)
- **Artifacts**: Build logs, image manifests
- **Note**: No Helm charts published to OCI - charts referenced locally via `file://`

#### Job 2: Deploy Root Chart
- **Purpose**: Deploy umbrella/root Helm chart that references app charts via `file://` paths
- **Dependencies**: Requires affected app images published
- **Metadata Extraction**: Reads from root `helm/expressjs-monorepo-template/Chart.yaml`:
  - Team name from `annotations.team` field
  - Application name from `name` field
  - Determines Helm release name and Kubernetes namespace
- **Dynamic Image Variables**: Sets environment variables for all apps:
  - Affected apps: `{APP}_IMAGE=pr-{number}-{sha}` (with SHA to force pod recreation)
  - Unaffected apps: `{APP}_IMAGE=pr-{number}` (static PR tag)
  - Example: `WEB_IMAGE=pr-123-abc1234`, `CRONS_IMAGE=pr-123`
- **Configuration**: Uses values.preview.template.yaml with PR-specific overrides
- **Platform Tags**: Sets global tags for Azure resource management (teamName, applicationName, etc.)
- **GitHub Labels**: Adds labels for automated cleanup (ns:{team}, prd:{team}, rel:{team}-{app}-pr-{number})
- **Environment**: Preview namespace with GitHub environment protection
- **Outputs**: Preview URLs as JSON object with per-app URLs

#### Job 3: E2E Tests
- **Purpose**: Run Playwright tests against deployed preview environment
- **Dependencies**: Requires successful deployment
- **URL Configuration**: Sets app-specific URL environment variables:
  - Converts preview URLs to uppercase env vars
  - Example: `{"expressjs_monorepo_template_web": "https://..."}` → `EXPRESSJS_MONOREPO_TEMPLATE_WEB_URL=https://...`
  - Playwright config explicitly references the web app URL
  - Fallback chain: `EXPRESSJS_MONOREPO_TEMPLATE_WEB_URL` → `TEST_URL` → `http://localhost:3000`
- **Network Access**: Requires either:
  - Firewall access from GitHub Actions to Preview environment, OR
  - Azure Playwright Service for execution within Azure network
- **Test Suite**: Smoke tests and critical user journeys
- **Artifacts**: Test reports, screenshots, videos on failure

## 3. Change Detection

Use Turborepo to detect which apps have been affected by changes in the PR:

- Command: `turbo ls --affected --filter=./apps/* --output=json`
- Detects changes to:
  - App source code
  - Lib dependencies of apps
  - Shared configurations
- Output: JSON array of affected apps with their names and directories
- Only affected apps will have Docker images built

## 4. Docker Image Building

### 4.1 Registry Configuration

Using the DCD-CNP-DEV subscription (Tenant: CJS Common Platform)

**Registry**: `hmctspublic.azurecr.io`

**Image Naming Convention**:
- `${TEAM_NAME}/${APPLICATION_NAME}:pr-{number}-{sha}`
- Team and application names extracted from app's `helm/Chart.yaml`
- Example: `dtsse/expressjs-monorepo-template-web:pr-123-abc1234`
  - Team: `dtsse` (from `annotations.team`)
  - App: `expressjs-monorepo-template-web` (from `name`)
- Both timestamped (`pr-{number}-{sha}`) and static (`pr-{number}`) tags pushed

### 4.2 Build Strategy

- Build only affected apps (from change detection)
- Metadata extracted from each app's `apps/{app}/helm/Chart.yaml` file
- Each app independently specifies its team and application name via Helm chart annotations
- Images built directly in GitHub Actions runners using Docker
- Tag images with PR number, short SHA, and timestamp for traceability
- Matrix build strategy enables parallel builds of multiple affected apps

### 4.3 Cleanup on PR Closure

When a PR is closed or merged:

1. **Helm Release Cleanup**: Platform automatically detects and removes Helm releases based on GitHub PR labels
2. **Docker Image Cleanup**: Platform automatically removes PR-specific images from ACR

### 4.4 Metadata Extraction Strategy

The pipeline uses a dual-source metadata extraction approach:

**Build Phase** (per app in matrix):
- Source: `apps/{app}/helm/Chart.yaml`
- Extracts:
  - `annotations.team` → Team name (e.g., `rpe`)
  - `name` → Application name (e.g., `expressjs-monorepo-template-web`)
- Purpose: Generates unique Docker image names for each app
- Enables multi-team monorepo support

**Deploy Phase** (root chart):
- Source: `helm/expressjs-monorepo-template/Chart.yaml`
- Extracts:
  - `annotations.team` → Team name (e.g., `rpe`)
  - `name` → Application name (e.g., `expressjs-monorepo-template`)
- Purpose: Determines Helm release name and Kubernetes namespace
- Sets dynamic image variables:
  - Affected apps use freshly built PR tags
  - Unaffected apps use `:latest` tag to reuse existing images

This approach allows each app to have independent metadata while maintaining a unified deployment.

## 5. Helm Chart Deployment Approach for Preview Environment

### 5.1 Root/Umbrella Chart Structure

The deployment uses a root chart that orchestrates the deployment of both web and api applications:

**File**: `helm/expressjs-monorepo-template/Chart.yaml`

```yaml
apiVersion: v2
name: expressjs-monorepo-template
description: Umbrella chart for deploying all services
type: application
version: 0.0.1
annotations:
  team: rpe
home: https://github.com/hmcts/expressjs-monorepo-template
dependencies:
  - name: expressjs-monorepo-template-web
    version: 0.0.1
    repository: "file://../../apps/web/helm"
    condition: web.enabled
  - name: expressjs-monorepo-template-api
    version: 0.0.1
    repository: "file://../../apps/api/helm"
    condition: api.enabled
  - name: expressjs-monorepo-template-crons
    version: 0.0.1
    repository: "file://../../apps/crons/helm"
    condition: crons.enabled
```

### 5.2 Root Chart Values for Preview

**File**: `helm/expressjs-monorepo-template/values.preview.template.yaml`

```yaml
# Global values shared by all subcharts
global:
  environment: preview

# Web application configuration
web:
  enabled: true
  expressjs-monorepo-template-web:
    nodejs:
      image: "hmctspublic.azurecr.io/${TEAM_NAME}/${APPLICATION_NAME}-web:${WEB_IMAGE}"
      ingressHost: "web-pr-${CHANGE_ID}.preview.platform.hmcts.net"
      applicationPort: 3000
      aadIdentityName: ${TEAM_NAME}
      environment:
        NODE_ENV: "preview"
        API_URL: "http://api-pr-${CHANGE_ID}:3001"
        DATABASE_URL: "postgresql://{{ .Release.Name }}-postgresql:5432/pr-${CHANGE_ID}-${APPLICATION_NAME}"
        REDIS_HOST: "${TEAM_NAME}-preview.redis.cache.windows.net"
      resources:
        limits:
          memory: "256Mi"
          cpu: "200m"
        requests:
          memory: "128Mi"
          cpu: "50m"
      keyVaults:
        ${TEAM_NAME}:
          secrets:
            - redis-access-key
            - app-insights-connection-string

# API application configuration
api:
  enabled: true
  expressjs-monorepo-template-api:
    nodejs:
      image: "hmctspublic.azurecr.io/${TEAM_NAME}/${APPLICATION_NAME}-api:${API_IMAGE}"
      ingressHost: "${APPLICATION_NAME}-api-pr-${CHANGE_ID}.preview.platform.hmcts.net"
      applicationPort: 3001
      aadIdentityName: ${TEAM_NAME}
      environment:
        NODE_ENV: "preview"
        DATABASE_URL: "postgresql://{{ .Release.Name }}-postgresql:5432/pr-${CHANGE_ID}-${APPLICATION_NAME}"
        REDIS_HOST: "${TEAM_NAME}-preview.redis.cache.windows.net"
      resources:
        limits:
          memory: "256Mi"
          cpu: "200m"
        requests:
          memory: "128Mi"
          cpu: "50m"
      keyVaults:
        ${TEAM_NAME}:
          secrets:
            - redis-access-key
            - app-insights-connection-string

# Shared PostgreSQL database
postgresql:
  enabled: true
  flexibleserver: rpe-preview
  setup:
    databases:
      - name: "pr-${CHANGE_ID}-expressjs-monorepo-template"

```

### 5.3 Deployment Requirements

**Platform Tags** (required for Azure resource management):
- `global.tenantId`: Azure tenant ID
- `global.environment`: Environment name (preview)
- `global.enableKeyVaults`: Enable KeyVault integration
- `global.devMode`: Enable development mode features
- `global.tags.teamName`: Team/namespace identifier (rpe)
- `global.tags.applicationName`: Application name
- `global.tags.builtFrom`: Git repository URL
- `global.tags.businessArea`: Business area (CFT)
- `global.tags.environment`: Environment tag (development)
- `global.disableTraefikTls`: Disable Traefik TLS

**Deployment Process**:
1. Extract team and application metadata from root `helm/expressjs-monorepo-template/Chart.yaml`
2. Set dynamic image variables for all apps:
   - Affected apps: `{APP}_IMAGE=pr-{number}-{sha}-{timestamp}`
   - Unaffected apps: `{APP}_IMAGE=latest`
3. Process values template with `envsubst` to substitute PR-specific variables
4. Update Helm dependencies (pulls from local `file://` paths)
5. Deploy root chart to preview namespace with all required tags
6. Add GitHub PR labels for platform-managed cleanup


## 6. Environment Variables

### 6.1 Generated Variables

**Workflow-Level Variables**:
- `CHANGE_ID`: Pull request number
- `SHORT_SHA`: Short git commit SHA (7 characters)
- `REGISTRY`: Azure Container Registry URL (`hmctspublic.azurecr.io`)

**Build Job Variables** (per app in matrix):
- `REGISTRY_PREFIX`: ACR image path (`${TEAM_NAME}/${APPLICATION_NAME}`)
- `IMAGE_TAG`: Full image tag (`pr-{number}-{sha}`)
- `TIMESTAMP`: Build timestamp in YYYYMMDDHHmmss format (for reference only)

**Deploy Job Variables**:
- `TEAM_NAME`: From root chart's `annotations.team` (e.g., `rpe`)
- `APPLICATION_NAME`: From root chart's `name` (e.g., `expressjs-monorepo-template`)
- `GIT_REPO`: Git repository URL (converted to HTTPS format)
- `{APP}_IMAGE`: Dynamic per-app image tags (e.g., `WEB_IMAGE`, `API_IMAGE`, `CRONS_IMAGE`)
  - Value: `pr-{number}-{sha}-{timestamp}` for affected apps
  - Value: `latest` for unaffected apps (reuses existing images)

**E2E Test Job Variables**:
- `{APP_NAME}_URL`: Per-app preview URLs in uppercase (e.g., `EXPRESSJS_MONOREPO_TEMPLATE_WEB_URL`)
  - Generated from ingress hostnames
  - Used by Playwright config to target specific app
  - Example: `EXPRESSJS_MONOREPO_TEMPLATE_WEB_URL=https://web-pr-123.preview.platform.hmcts.net`

## 7. GitHub PR Labels for Cleanup

The following labels are automatically added to PRs to enable automated cleanup by the platform:

- `ns:{team}` - Namespace identifier (e.g., `ns:rpe`)
- `prd:{team}` - Product identifier (e.g., `prd:rpe`)
- `rel:{team}-{application}-pr-{number}` - Release name (e.g., `rel:rpe-expressjs-monorepo-template-pr-123`)

Labels are dynamically generated from the root Helm chart metadata and must match the Helm release name.

These labels enable the platform to:
- Identify which namespace the preview environment belongs to
- Track the Helm release name for cleanup
- Automatically remove resources when the PR is closed

## 8. E2E Testing Network Access

Two options for running Playwright E2E tests against the preview environment:

### Option 1: Firewall Access from GitHub Actions
- Request platform team to allow GitHub Actions runner IPs to access preview environment
- Simpler setup but requires firewall rule maintenance
- GitHub Actions uses dynamic IP ranges that may change

### Option 2: Azure Playwright Service (Recommended)
- Execute tests within Azure network boundary
- More reliable and secure
- No firewall rule changes needed
- Better performance due to proximity to preview environment

## 9. Environment Configuration (Confirmed)

Based on platform requirements, the following configurations have been confirmed:

1. **Azure Subscription**: Using DCD-CNP-DEV subscription
   - Tenant ID: `531ff96d-0ae9-462a-8d2d-bec7c0b42082`
   - Tenant: CJS Common Platform (HMCTS.NET)

2. **Database Strategy**: Each PR gets its own PostgreSQL database using the HMCTS PostgreSQL chart
   - Chart: https://github.com/hmcts/chart-postgresql
   - Configuration in `values.preview.template.yaml`:
   ```yaml
   postgresql:
     enabled: true
     flexibleserver: rpe-preview
     setup:
       databases:
         - name: "pr-${CHANGE_ID}-expressjs-monorepo-template"
   ```

3. **Resource Limits**: Managed by platform team - no additional configuration needed

4. **Retention Policy**: Managed by platform team - automatic cleanup provided

5. **Security Approval**: Managed by platform team - fully automated deployments

6. **Cost Constraints**: Managed by platform team - monitoring in place

7. **External Dependencies**: Not required for this implementation

8. **SSL Certificates**: Platform provides wildcard certificates - no additional setup needed

9. **Monitoring Integration**: Managed by platform team

10. **Backup Strategy**: Preview databases are ephemeral - no backup required

