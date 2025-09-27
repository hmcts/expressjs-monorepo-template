# VIBE-119: Infrastructure Pipeline - Deploy to Preview

## Priority 1: Core Pipeline Setup

### GitHub Actions Workflow (full-stack-engineer)
- [ ] Create `.github/workflows/preview-deploy.yml`
  - [ ] Setup trigger on PR events (opened, synchronize, reopened)
  - [ ] Configure concurrency groups to cancel in-progress builds
  - [ ] Set up environment variables (CHANGE_ID, etc.)
- [ ] Implement build and publish jobs using Turborepo change detection
  - [ ] Use `turbo ls --affected --filter=./apps/* --output=json` for change detection
  - [ ] Matrix strategy for affected apps only 
  - [ ] Generate build metadata (timestamp, short SHA)
  - [ ] Docker build and push with tag: `pr-{number}-{sha}-{timestamp}`

## Priority 2: Helm Chart Development

### Root/Umbrella Chart Creation (full-stack-engineer)
- [ ] Create `helm/expressjs-monorepo-template/` directory structure
- [ ] Create `Chart.yaml` with dependencies referencing local file paths 
  ```yaml
  apiVersion: v2
  name: expressjs-monorepo-template
  description: Umbrella chart for deploying all services
  type: application
  version: 0.0.1
  dependencies:
    - name: expressjs-monorepo-template-web
      version: 0.1.0
      repository: "file://../web/helm"
      condition: web.enabled
    - name: expressjs-monorepo-template-api
      version: 0.1.0
      repository: "file://../api/helm"
      condition: api.enabled
  ```
- [ ] Create `values.preview.template.yaml`
  - [ ] Global configuration section
  - [ ] Web app subchart values
  - [ ] API app subchart values
  - [ ] PostgreSQL flexible server configuration

### App Chart Updates (full-stack-engineer)
- [ ] Update `apps/web/helm/Chart.yaml`
  - [ ] Set name to `rpe-expressjs-monorepo-template-web`
  - [ ] Add PostgreSQL dependency if needed
- [ ] Update `apps/api/helm/Chart.yaml`
  - [ ] Set name to `expressjs-monorepo-template-api` 
- [ ] Create preview values templates for both apps
  - [ ] Use ${CHANGE_ID} for dynamic values
  - [ ] Configure resource limits (256Mi memory, 200m CPU)
  - [ ] Set up ingress hosts

### Database Configuration (infrastructure-engineer)
- [ ] Configure PostgreSQL flexible server
  - [ ] Server name: `rpe-preview`
  - [ ] Database naming: `pr-${CHANGE_ID}-expressjs-monorepo-template`
  - [ ] Ensure ephemeral storage for preview

## Priority 3: Deployment Implementation

### Deploy Job Configuration (full-stack-engineer)
- [ ] Implement deploy-preview job in workflow
  - [ ] Kubernetes context setup
  - [ ] Environment variable export (PR_NUMBER, CHANGE_ID, SHORT_SHA, TIMESTAMP)  
  - [ ] Template processing with envsubst using values.preview.template.yaml
  - [ ] Helm dependency update (pulls from local file:// paths)
  - [ ] Helm upgrade --install command with platform tags and labels
- [ ] Configure preview URLs output
  - [ ] Web: `https://rpe-expressjs-monorepo-template-api-web-pr-{number}.preview.platform.hmcts.net`
  - [ ] API: `https://rpe-expressjs-monorepo-template-api-pr-{number}.preview.platform.hmcts.net`

### Cleanup Automation (infrastructure-engineer)
- [ ] Configure automated cleanup on PR closure using GitHub labels
  - [ ] Platform detects PR labels (ns:rpe, prd:rpe, rel:rpe-expressjs-monorepo-template-pr-{number})
  - [ ] Delete Helm release from Kubernetes  
  - [ ] Remove Docker images from ACR using tag pattern matching
  - [ ] Database cleanup handled by platform 
- [ ] Verify database cleanup (handled by platform)
