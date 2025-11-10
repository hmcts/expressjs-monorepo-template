# Code Review: VIBE-119 - Preview Deployment Pipeline

**Reviewed By**: Code Reviewer Agent
**Review Date**: 2025-11-10
**Branch**: feature/VIBE-119-preview-deployment-pipeline
**Base Branch**: master

## Summary

This ticket implements a comprehensive preview deployment pipeline for the ExpressJS monorepo template. The implementation includes:

- GitHub Actions workflow for automated preview deployments
- Turborepo-based change detection to build only affected apps
- Helm umbrella chart for deploying multiple services
- Port-forward based E2E testing approach
- Bash scripts for deployment orchestration and error recovery

**Overall Assessment**: NEEDS CHANGES

The implementation demonstrates solid technical execution with good infrastructure practices, but has several critical issues that must be addressed before production use, particularly around security credentials, environment configuration, and test reliability.

## CRITICAL Issues

### 1. Missing Azure Credentials Configuration

**File**: `.github/workflows/preview-deploy.yml:76-79, 148`

**Problem**: The workflow references Azure credentials that are not documented in the tasks.md or specification.md:
- `REGISTRY_LOGIN_SERVER` (line 77)
- `REGISTRY_USERNAME` (line 78)
- `REGISTRY_PASSWORD` (line 79, 181)
- `AZURE_CREDENTIALS_CFT_PREVIEW` (line 148)
- `AZURE_SUBSCRIPTION_CFT_PREVIEW` (line 153)

**Impact**: The workflow will fail immediately on any PR as these secrets are not defined. No documentation exists for what these values should be or how to configure them.

**Solution Required**:
1. Document all required GitHub secrets in a setup guide
2. Update `docs/tickets/VIBE-119/specification.md` with exact secret names and their purposes
3. Add a pre-flight check in the workflow to validate required secrets exist
4. Consider using Azure OIDC federation instead of service principal credentials for better security

**Evidence**:
```yaml
# Line 76-79: Docker login with undocumented secrets
- name: 'Build and push image'
  uses: azure/docker-login@v1
  with:
    login-server: ${{ secrets.REGISTRY_LOGIN_SERVER }}
    username: ${{ secrets.REGISTRY_USERNAME }}
    password: ${{ secrets.REGISTRY_PASSWORD }}
```

### 2. Hardcoded Environment Configuration (CFT vs DTSSE Team Mismatch)

**Files**:
- `.github/workflows/preview-deploy.yml:156-158, 309-310`
- `helm/expressjs-monorepo-template/Chart.yaml:7`
- `helm/expressjs-monorepo-template/values.preview.template.yaml:77`

**Problem**: Critical mismatch between team metadata and Azure resources:
- Helm chart annotation specifies `team: dtsse` (Chart.yaml:7)
- Workflow deploys to `cft-preview-01-rg` resource group (line 156)
- Workflow deploys to `cft-preview-01-aks` cluster (line 157)
- PostgreSQL references `dtsse-preview` flexible server (values.preview.template.yaml:77)

This is inconsistent - either the team is DTSSE or CFT, but the configuration mixes both.

**Impact**:
- Namespace will be `dtsse` but resources are in CFT resource group
- PostgreSQL server `dtsse-preview` may not exist in CFT subscription
- RBAC permissions likely won't work due to team/resource mismatch
- Platform cleanup automation may fail due to incorrect namespace

**Solution Required**:
1. Decide on single team identifier (recommend: `dtsse`)
2. Update workflow to use correct resource group: `dtsse-preview-00-rg`
3. Update workflow to use correct AKS cluster: `dtsse-preview-00-aks`
4. Verify PostgreSQL flexible server name matches team convention
5. Document the team/environment mapping in specification.md

**Evidence**:
```yaml
# helm/expressjs-monorepo-template/Chart.yaml
annotations:
  team: dtsse  # Says DTSSE

# .github/workflows/preview-deploy.yml
- name: Get AKS credentials
  run: |
    az account set --subscription ${{ secrets.AZURE_SUBSCRIPTION_CFT_PREVIEW }}
    az aks get-credentials \
      --admin \
      --resource-group cft-preview-01-rg \  # Using CFT resources!
      --name cft-preview-01-aks \
```

### 3. Port-Forward Approach is Unreliable for CI/CD

**File**: `.github/workflows/preview-deploy.yml:327-339`

**Problem**: The E2E tests use `kubectl port-forward` to access preview services from GitHub Actions runners. This approach has several critical reliability issues:

1. **Network Stability**: Port forwards are TCP connections that can drop, especially over long-running test suites
2. **No Automatic Recovery**: If a port-forward dies mid-test, tests fail without retry
3. **Race Conditions**: 5-second wait (line 336) is arbitrary and may not be sufficient for pod startup
4. **Connection Verification**: Tests don't verify port-forwards are healthy before proceeding
5. **GitHub Actions Networking**: Runners have dynamic IPs and may face network policy restrictions

**Impact**:
- Flaky test failures unrelated to code changes
- Difficult to debug when tests fail due to network vs application issues
- May work locally but fail in CI consistently
- Waste of CI time with unreliable tests

**Solution Required**:

**Option 1 (Recommended)**: Use Azure Playwright Service
- Tests run within Azure network boundary
- More reliable and faster
- Proper HMCTS pattern for preview testing
- Update specification to recommend this approach

**Option 2**: Use Ingress URLs directly with firewall rules
- Request GitHub Actions IP ranges in AKS firewall
- Test against public ingress URLs
- Simpler but less secure

**Option 3**: Improve port-forward reliability
- Add health checks before running tests
- Implement automatic port-forward restart on failure
- Use timeout and retry logic in test suite
- Add connection verification step

**Evidence**:
```yaml
# .github/workflows/preview-deploy.yml:327-339
- name: Setup port-forwards to preview environment
  run: |
    .github/scripts/setup-port-forwards.sh "${{ env.TEAM_NAME }}" "${{ env.RELEASE_NAME }}"

    # Set environment variables for Playwright to use localhost URLs
    echo "EXPRESSJS_MONOREPO_TEMPLATE_WEB_URL=http://localhost:3000" >> $GITHUB_ENV
    echo "EXPRESSJS_MONOREPO_TEMPLATE_API_URL=http://localhost:3001" >> $GITHUB_ENV
    echo "EXPRESSJS_MONOREPO_TEMPLATE_POSTGRES_URL=http://localhost:5555" >> $GITHUB_ENV

    echo "Preview environment accessible via port-forwards:"
    echo "  Web: http://localhost:3000"
    echo "  API: http://localhost:3001"
```

### 4. Insecure Cookie Configuration Disabled

**File**: Commit history shows "disable secure cookies" (commit f3b8f93)

**Problem**: Secure cookies were explicitly disabled, likely to work around port-forward using HTTP instead of HTTPS. This is a security anti-pattern that may have leaked into production configuration.

**Impact**:
- Session hijacking risk if this configuration reaches production
- May indicate environment-specific configuration is not properly managed
- Suggests the port-forward approach is forcing security compromises

**Solution Required**:
1. Revert secure cookie changes
2. Use HTTPS for port-forwards or test against ingress URLs directly
3. Ensure environment-specific security settings are properly managed
4. Add validation that production always uses secure cookies

### 5. Missing Cleanup Verification

**File**: `.github/workflows/preview-deploy.yml` (no cleanup job)

**Problem**: The specification (section 7) states that platform automatically handles cleanup via PR labels, but there's no verification that cleanup actually happens. Additionally:

1. No monitoring/validation that platform cleanup occurred
2. No fallback if platform automation fails
3. Leaked resources could accumulate, causing cost overruns
4. No alerts for stuck releases or orphaned resources

**Impact**:
- Resource leaks causing unexpected Azure costs
- Preview namespaces filling up, blocking new deployments
- No visibility into cleanup failures
- Manual intervention required to clean up stuck resources

**Solution Required**:
1. Add a GitHub Action workflow that runs on PR close
2. Verify labels were applied correctly during deployment
3. Check Helm release was deleted within reasonable timeframe (30 mins)
4. Report cleanup failures as PR comments
5. Add monitoring/alerting for orphaned preview resources
6. Document manual cleanup procedure in specification.md

## HIGH PRIORITY Issues

### 1. No Build Artifact Caching

**File**: `.github/workflows/preview-deploy.yml:82-101`

**Problem**: Docker builds don't use layer caching or build cache mounts. Every build rebuilds from scratch, including `yarn install` and TypeScript compilation.

**Impact**:
- Slow build times (5-10 minutes per app instead of 1-2 minutes)
- Unnecessary Azure bandwidth costs
- Poor developer experience with long PR feedback times
- Wastes GitHub Actions minutes

**Recommendation**:
```yaml
- name: Build and push Docker image
  uses: docker/build-push-action@v5
  with:
    context: .
    file: apps/${{ matrix.app }}/Dockerfile
    push: true
    tags: |
      ${{ env.REGISTRY }}/${{ env.REGISTRY_PREFIX }}:${{ env.IMAGE_TAG }}
      ${{ env.REGISTRY }}/${{ env.REGISTRY_PREFIX }}:pr-${{ env.CHANGE_ID }}
    cache-from: type=registry,ref=${{ env.REGISTRY }}/${{ env.REGISTRY_PREFIX }}:buildcache
    cache-to: type=registry,ref=${{ env.REGISTRY }}/${{ env.REGISTRY_PREFIX }}:buildcache,mode=max
```

### 2. Missing Timeout on Port-Forward Setup

**File**: `.github/scripts/setup-port-forwards.sh:66-77`

**Problem**: Port-forward script waits 2 seconds per service, then 5 seconds total (line 81), but doesn't have a maximum timeout if services never become ready. The connectivity test (line 97) has a 5-second timeout but doesn't fail the script on timeout.

**Impact**:
- Script could hang indefinitely waiting for services
- E2E test job could hit its 15-minute timeout without useful error message
- No clear indication of which service failed to start

**Recommendation**:
```bash
# Test if port is accessible
if timeout 5 bash -c "echo > /dev/tcp/localhost/${local_port}" 2>/dev/null; then
  echo "  ✓ ${service} is accessible on localhost:${local_port}"
else
  echo "  ✗ ${service} is not responding on localhost:${local_port}"
  exit 1  # Add this line to fail fast
fi
```

### 3. Helm Dependency Update Performance

**File**: `.github/scripts/deploy-preview.sh:256-273`

**Problem**: Script runs `helm dependency update` for every subchart individually, then for the parent chart. This is redundant because:
1. App charts rarely change their dependencies (nodejs chart is pinned)
2. Parent chart `helm dependency update` already pulls subcharts via file:// paths
3. Adds ~30 seconds to deployment time

**Impact**:
- Slower deployments
- Unnecessary network calls to Helm registries
- Wasted CI time

**Recommendation**:
```bash
# Remove individual subchart updates, only update parent chart
echo "Updating chart dependencies..."
if [ "$dry_run" = false ]; then
  helm dependency update
else
  echo "Would run: helm dependency update"
fi
```

### 4. No Helm Rollback Testing

**File**: `.github/scripts/deploy-preview.sh:106-151`

**Problem**: The `deploy_with_retry` function has retry logic and rollback mechanisms, but these have likely never been tested. The rollback logic (lines 66-77) attempts to find the last successful revision, but:

1. Preview deployments are typically fresh installs (no history)
2. Rollback to a previous PR version may not make sense
3. Better to fail fast and uninstall than rollback in preview

**Impact**:
- Untested code paths that may fail when needed
- Confusion during deployment failures
- May hide real issues by rolling back instead of failing clearly

**Recommendation**:
```bash
# For preview deployments, skip rollback attempt
if [ "$status" = "pending-upgrade" ] || [ "$status" = "pending-install" ]; then
  echo "⚠️  Release is stuck in ${status} state"
  echo "Preview deployment stuck - uninstalling and retrying..."

  if helm uninstall "${release_name}" -n "${namespace}" --wait --timeout 2m; then
    echo "✓ Release uninstalled, will proceed with fresh installation"
    return 0
  else
    echo "❌ Failed to uninstall stuck release"
    return 1
  fi
fi
```

### 5. Image Tag Strategy May Cause Confusion

**File**: `.github/scripts/set-image-variables.sh:60-68`

**Problem**: For unaffected apps, the script uses tag `pr-{change_id}` (line 61) with comment "not rebuilt, using static tag". However:

1. This tag may not exist if the app was never built for this PR
2. The `latest` tag would be more reliable for unaffected apps
3. Comment says "static tag" but it's PR-specific, not truly static
4. First PR deployment will fail if trying to pull `pr-123` tag that doesn't exist

**Impact**:
- First deployment of a PR will fail with ImagePullBackOff
- Confusing error messages about missing tags
- Need to manually push `pr-{number}` tags or handle missing images

**Recommendation**:
```bash
else
  # App not affected - use latest tag
  local image_tag="latest"

  if [ -n "${GITHUB_ENV:-}" ]; then
    echo "${env_var_name}=${image_tag}" >> "$GITHUB_ENV"
  fi

  echo "○ ${app}: ${image_tag} (not rebuilt, using latest)"
fi
```

### 6. Environment Variable Naming Inconsistency

**File**: `.github/workflows/preview-deploy.yml:332-334`

**Problem**: Playwright tests use environment variables with app name embedded:
```
EXPRESSJS_MONOREPO_TEMPLATE_WEB_URL=http://localhost:3000
EXPRESSJS_MONOREPO_TEMPLATE_API_URL=http://localhost:3001
EXPRESSJS_MONOREPO_TEMPLATE_POSTGRES_URL=http://localhost:5555
```

However, the Playwright config (e2e-tests/playwright.config.ts:18) only checks:
```typescript
baseURL: process.env.EXPRESSJS_MONOREPO_TEMPLATE_WEB_URL || process.env.TEST_URL || 'http://localhost:3000'
```

**Impact**:
- Hardcoded app name breaks reusability
- Other repositories can't use this workflow without code changes
- Inconsistent with the dynamic URL discovery pattern used elsewhere

**Recommendation**:
```yaml
# Use generic TEST_URL that works for any repo
- name: Setup port-forwards to preview environment
  run: |
    .github/scripts/setup-port-forwards.sh "${{ env.TEAM_NAME }}" "${{ env.RELEASE_NAME }}"

    # Use TEST_URL for web app (Playwright default)
    echo "TEST_URL=http://localhost:3000" >> $GITHUB_ENV
```

### 7. Missing Resource Limits in Workflow

**File**: `.github/workflows/preview-deploy.yml`

**Problem**: None of the jobs have resource limits or timeout safeguards beyond the default. The e2e-tests job has a 15-minute timeout (line 262), but other jobs could run indefinitely.

**Impact**:
- Hung builds consuming GitHub Actions minutes
- No protection against infinite loops in scripts
- Difficult to debug stuck workflows

**Recommendation**:
```yaml
jobs:
  detect-affected:
    name: Detect Affected Apps
    runs-on: ubuntu-latest
    timeout-minutes: 5  # Add timeout

  build-and-publish:
    name: Build & Publish ${{ matrix.app }}
    runs-on: ubuntu-latest
    timeout-minutes: 20  # Add timeout

  deploy-preview:
    name: Deploy to Preview
    runs-on: ubuntu-latest
    timeout-minutes: 15  # Add timeout
```

## SUGGESTIONS

### 1. Extract Metadata Parsing to Shared Function

**Files**: Multiple scripts parse Chart.yaml identically

**Problem**: The same awk/grep commands to parse Chart.yaml are duplicated across:
- `.github/workflows/preview-deploy.yml:126-128, 290-293`
- `.github/scripts/deploy-preview.sh:192-194`
- `.github/scripts/generate-build-metadata.sh:36-46`

**Benefit**: Single source of truth, easier to maintain, consistent error handling

**Recommendation**: Create `.github/scripts/parse-chart-metadata.sh`

### 2. Add Workflow Dispatch for Manual Deployments

**File**: `.github/workflows/preview-deploy.yml:3-7`

**Current Trigger**:
```yaml
on:
  pull_request:
    types: [opened, synchronize, reopened]
    branches:
      - master
```

**Benefit**: Allow manual preview deployments for testing, demos, or re-deployment after infrastructure changes

**Recommendation**:
```yaml
on:
  pull_request:
    types: [opened, synchronize, reopened]
    branches:
      - master
  workflow_dispatch:
    inputs:
      pr_number:
        description: 'PR number to deploy'
        required: true
        type: number
      force_rebuild:
        description: 'Force rebuild all apps (ignore affected detection)'
        required: false
        type: boolean
        default: false
```

### 3. Improve Script Error Messages

**Files**: All scripts in `.github/scripts/`

**Issue**: Error messages don't include context about which step failed or what the user should do

**Example** from `detect-affected-apps.sh:17`:
```bash
affected_json=$(yarn turbo ls --affected --output=json 2>/dev/null || echo '{"packages":{"items":[]}}')
```

If `yarn turbo` fails, it silently returns empty JSON. Better:
```bash
if ! affected_json=$(yarn turbo ls --affected --output=json 2>&1); then
  echo "Error: Failed to run Turborepo change detection"
  echo "Output: $affected_json"
  exit 1
fi
```

### 4. Add Preview Environment Health Check

**File**: `.github/workflows/preview-deploy.yml` (new step needed)

**Benefit**: Verify services are actually healthy before running tests, fail fast on deployment issues

**Recommendation**: Add between deploy-preview and e2e-tests:
```yaml
- name: Health check preview environment
  run: |
    # Wait for all pods to be ready
    kubectl wait --for=condition=ready pod \
      -l "app.kubernetes.io/instance=${{ env.RELEASE_NAME }}" \
      -n "${{ env.TEAM_NAME }}" \
      --timeout=5m

    # Verify ingresses exist
    INGRESS_COUNT=$(kubectl get ingress \
      -n "${{ env.TEAM_NAME }}" \
      -l "app.kubernetes.io/instance=${{ env.RELEASE_NAME }}" \
      --no-headers | wc -l)

    if [ "$INGRESS_COUNT" -eq 0 ]; then
      echo "Error: No ingresses found for release"
      exit 1
    fi
```

### 5. Use Helm Test for Post-Deployment Validation

**File**: Helm charts don't include test hooks

**Benefit**: Validate deployment using Helm's built-in test framework before E2E tests

**Recommendation**: Add `templates/tests/` to app charts:
```yaml
# apps/web/helm/templates/tests/test-connection.yaml
apiVersion: v1
kind: Pod
metadata:
  name: "{{ include "web.fullname" . }}-test-connection"
  annotations:
    "helm.sh/hook": test
spec:
  containers:
    - name: wget
      image: busybox
      command: ['wget']
      args: ['{{ include "web.fullname" . }}:{{ .Values.service.port }}']
  restartPolicy: Never
```

Then add to workflow:
```yaml
- name: Run Helm tests
  run: helm test ${{ env.RELEASE_NAME }} -n ${{ env.TEAM_NAME }}
```

### 6. Improve Deployment Observability

**File**: `.github/workflows/preview-deploy.yml` (missing observability)

**Benefit**: Better debugging when deployments fail, historical metrics

**Recommendation**:
```yaml
# After deployment
- name: Capture deployment status
  if: always()
  run: |
    echo "## Deployment Status" >> $GITHUB_STEP_SUMMARY
    echo "" >> $GITHUB_STEP_SUMMARY

    echo "### Pods" >> $GITHUB_STEP_SUMMARY
    kubectl get pods -n ${{ env.TEAM_NAME }} -l "app.kubernetes.io/instance=${{ env.RELEASE_NAME }}" >> $GITHUB_STEP_SUMMARY

    echo "" >> $GITHUB_STEP_SUMMARY
    echo "### Services" >> $GITHUB_STEP_SUMMARY
    kubectl get svc -n ${{ env.TEAM_NAME }} -l "app.kubernetes.io/instance=${{ env.RELEASE_NAME }}" >> $GITHUB_STEP_SUMMARY

    echo "" >> $GITHUB_STEP_SUMMARY
    echo "### Ingresses" >> $GITHUB_STEP_SUMMARY
    kubectl get ingress -n ${{ env.TEAM_NAME }} -l "app.kubernetes.io/instance=${{ env.RELEASE_NAME }}" >> $GITHUB_STEP_SUMMARY
```

### 7. Document Local Development Workflow

**File**: Missing from specification.md

**Issue**: Developers need to know how to test preview deployments locally

**Recommendation**: Add to specification.md:
```markdown
## Local Development Testing

### Prerequisites
- Azure CLI installed and logged in
- kubectl configured
- Helm 3.13+ installed

### Deploy Locally
```bash
# Build images locally
docker-compose build

# Tag and push to ACR (or use local images)
docker tag expressjs-monorepo-template-web:latest hmctspublic.azurecr.io/dtsse/expressjs-monorepo-template-web:latest

# Deploy using script
.github/scripts/deploy-preview.sh local

# Access via port-forward
kubectl port-forward -n dtsse svc/expressjs-monorepo-template-pr-local-web 3000:80
```
```

### 8. Add Cost Estimation

**File**: No cost monitoring

**Benefit**: Team awareness of preview environment costs, budget tracking

**Recommendation**: Add to specification.md section on monitoring:
```markdown
### Cost Monitoring

Preview environments consume:
- AKS compute: ~£2-5/day per PR (depending on pod resource requests)
- PostgreSQL database: Shared flexible server, ~£0.50/day per database
- ACR storage: ~£0.01/GB/month for images
- Bandwidth: Negligible for typical workloads

**Estimated monthly cost for 10 active PRs**: £200-400

**Optimization strategies**:
- Automatic cleanup on PR close (already implemented)
- Reduce pod resource requests in preview (already set to 256Mi/200m CPU)
- Use spot instances for preview AKS node pool
- Implement preview environment sleep schedule (stop after 6pm, start at 8am)
```

## Positive Feedback

### 1. Excellent Script Organization

The `.github/scripts/` directory with dedicated, single-purpose scripts is exemplary:
- Clear separation of concerns
- Reusable across workflows and local development
- Well-documented with comprehensive README
- Proper error handling with `set -euo pipefail`

This pattern should be maintained and applied to future infrastructure work.

### 2. Robust Helm Deployment Logic

The `deploy-preview.sh` script shows sophisticated understanding of Helm reliability patterns:
- Automatic detection and recovery from stuck releases
- Retry logic with exponential backoff
- Rollback attempts before forced cleanup
- Clear status reporting and debugging information

This is production-grade infrastructure code.

### 3. Dynamic App Discovery

The Turborepo-based affected app detection is excellent:
- Only builds what changed, saving time and resources
- Automatically handles new apps being added to monorepo
- No hardcoded app lists to maintain
- Proper JSON output for GitHub Actions matrix jobs

### 4. Comprehensive Documentation

The specification.md and tasks.md files are thorough and well-structured:
- Clear architecture diagrams (ASCII art)
- Detailed job breakdowns
- Implementation notes for infrastructure engineers
- Progress tracking with checkboxes

### 5. Good Separation of Deployment Concerns

The approach of using an umbrella chart with file:// dependencies is correct:
- No need to publish Helm charts to OCI registry
- Single deployment command for all services
- Environment-specific configuration in root chart
- Subcharts remain independently testable

### 6. Proper Resource Limits in Helm Values

The preview environment has appropriate resource limits:
```yaml
# 256Mi memory, 200m CPU per pod
```
This prevents resource exhaustion while keeping costs reasonable.

### 7. Cleanup via Platform Labels

Using GitHub PR labels for platform-automated cleanup is the right HMCTS pattern:
- No custom cleanup workflow needed
- Leverages existing platform automation
- Reliable and consistent with other services

## Test Coverage Assessment

### E2E Tests
**Status**: IMPLEMENTED but UNRELIABLE

- **Coverage**: Uses existing Playwright test suite against preview environment
- **Approach**: Port-forward to access services from GitHub Actions runners
- **Strengths**:
  - Reuses existing test suite (no duplication)
  - Tests actual deployed environment
  - Includes test result publishing and artifact upload
- **Weaknesses**:
  - Port-forward approach is fragile and not recommended for CI
  - No health checks before testing
  - No retry logic for transient failures
  - Tests may pass locally but fail in CI due to network issues

**Recommendation**: HIGH - Switch to Azure Playwright Service or ingress-based testing

### Error Scenario Coverage
**Status**: GOOD

Scripts include comprehensive error handling:
- Stuck Helm releases detected and recovered
- Missing services handled gracefully
- Deployment failures trigger retries
- Clear error messages and debugging info

**Gap**: No testing that error scenarios actually work as expected

### Cleanup Verification
**Status**: MISSING

- **Issue**: No verification that platform cleanup occurs
- **Risk**: Resource leaks could accumulate
- **Recommendation**: Add monitoring/alerting for orphaned resources

## Acceptance Criteria Verification

Based on specification.md and tasks.md:

- [x] **PR creation triggers automatic deployment**
  - Status: IMPLEMENTED
  - Evidence: `.github/workflows/preview-deploy.yml` triggers on pull_request events

- [x] **Docker images tagged with pr-{number}-{sha}**
  - Status: IMPLEMENTED
  - Evidence: `generate-build-metadata.sh:62` produces correct tag format
  - Note: Timestamp removed from tag (deviation from spec but acceptable)

- [x] **Root chart deploys all services**
  - Status: IMPLEMENTED
  - Evidence: `helm/expressjs-monorepo-template/Chart.yaml` includes web, api, crons, postgres

- [x] **E2E tests run automatically**
  - Status: IMPLEMENTED but UNRELIABLE
  - Evidence: `preview-deploy.yml:257-392` includes e2e-tests job
  - Concern: Port-forward approach may cause flaky tests

- [x] **Resources cleaned up on PR closure**
  - Status: ASSUMED (platform-managed)
  - Evidence: PR labels added (lines 196-219)
  - Gap: NO VERIFICATION that cleanup occurs

- [ ] **Build and deployment < 10 minutes**
  - Status: UNKNOWN (not tested)
  - Concern: No build caching may cause this to exceed target
  - Concern: Helm dependency updates add unnecessary time

- [ ] **E2E test feedback < 5 minutes**
  - Status: UNKNOWN (not tested)
  - Timeout: 15 minutes configured (line 262)

- [x] **Zero manual intervention required**
  - Status: IMPLEMENTED (assuming secrets are configured)
  - Note: Initial setup requires Azure secret configuration

- [ ] **Cost tracking in place**
  - Status: NOT IMPLEMENTED
  - Evidence: No cost monitoring or alerting configured
  - Recommendation: Add cost estimation and monitoring

## Infrastructure Correctness Review

### Helm Chart Syntax
**Status**: VALID ✓

- Chart.yaml structure is correct
- Dependencies properly declared
- Annotations present for platform integration

**Minor Issue**: Team annotation is `dtsse` but workflow uses `cft` resources (see CRITICAL issue #2)

### Chart Dependencies
**Status**: CORRECT ✓

- file:// paths are correctly relative: `file://../../apps/web/helm`
- All referenced charts exist
- Version matching between parent and subcharts

### Image Tag Resolution
**Status**: PARTIALLY CORRECT ⚠

- Affected apps use correct tag format: `pr-{id}-{sha}`
- Unaffected apps use: `pr-{id}` (may not exist on first PR)
- Recommendation: Use `latest` for unaffected apps

### Port-Forward Setup
**Status**: IMPLEMENTED but CONCERNING ⚠

- Setup script is well-written
- Cleanup is properly handled with PID tracking
- **Issue**: Approach is unreliable for CI/CD (see CRITICAL issue #3)

### Namespace and Release Naming
**Status**: CORRECT ✓

- Namespace: `{team}` from Chart.yaml annotations
- Release name: `{app}-pr-{number}`
- Follows HMCTS naming conventions

### Resource Specifications
**Status**: APPROPRIATE ✓

- Memory: 256Mi per pod (reasonable for preview)
- CPU: 200m per pod (reasonable for preview)
- No excessive resource requests

## Security Review

### Azure Credentials Handling
**Status**: STANDARD GITHUB PATTERN ✓

- Uses GitHub secrets (not hardcoded)
- Service principal pattern is standard
- **Improvement**: Consider Azure OIDC federation for keyless authentication

### Kubernetes Access Patterns
**Status**: SECURE ✓

- Uses `--admin` flag appropriately for automation
- Namespace isolation enforced
- RBAC via service principal

### Container Security
**Status**: GOOD ✓

- Base image: `hmctspublic.azurecr.io/base/node:22-alpine` (HMCTS standard)
- Multi-stage builds reduce attack surface
- No secrets in Dockerfiles

**Gap**: No container scanning in workflow (should add)

### Secrets Management
**Status**: GOOD ✓

- Secrets stored in GitHub Secrets
- Environment variables used for runtime configuration
- KeyVault integration configured in Helm values

**Concern**: Secure cookies disabled (commit f3b8f93) - see CRITICAL issue #4

### Service Account Permissions
**Status**: UNKNOWN ⚠

- Secrets reference service principal but permissions not documented
- No documentation of required Azure RBAC roles
- **Recommendation**: Document minimum required permissions

### Input Validation in Bash Scripts
**Status**: GOOD ✓

All scripts validate input arguments:
```bash
if [ -z "$namespace" ] || [ -z "$release_name" ]; then
  echo "Usage: $0 <namespace> <release_name>"
  exit 1
fi
```

## Reliability & Error Handling

### Workflow Error Handling
**Status**: GOOD ✓

- Jobs fail appropriately on errors
- Artifacts uploaded on failure for debugging
- Test results published even when tests fail

**Improvement**: Add timeout to all jobs (see HIGH PRIORITY issue #7)

### Rollback Mechanisms
**Status**: IMPLEMENTED but UNTESTED ⚠

- Helm rollback logic exists in deploy-preview.sh
- May not work as expected for preview deployments
- Recommendation: Simplify to uninstall + retry for preview

### Cleanup Guarantees
**Status**: PLATFORM-DEPENDENT ⚠

- Cleanup delegated to platform via PR labels
- **Missing**: Verification that cleanup occurs
- **Missing**: Fallback if platform automation fails
- **Recommendation**: Add cleanup validation

### Timeout Handling
**Status**: PARTIAL ⚠

- E2E tests have 15-minute timeout
- Port-forward connectivity test has 5-second timeout
- **Missing**: Timeouts on build and deploy jobs
- **Missing**: Overall workflow timeout

### Stuck State Recovery
**Status**: EXCELLENT ✓

The deploy-preview.sh script handles stuck Helm releases comprehensively:
- Detects pending-upgrade/install/rollback states
- Attempts rollback to last good revision
- Falls back to uninstall if rollback fails
- Clear status reporting

### Race Conditions
**Status**: MINIMAL RISK ✓

- Jobs properly depend on each other (needs: declarations)
- Port-forwards started before tests run
- Sleep delays added where needed (though arbitrary)

## Code Quality

### TypeScript Compliance
**Status**: N/A (infrastructure code)

### Bash Best Practices
**Status**: EXCELLENT ✓

All scripts follow best practices:
- `set -euo pipefail` for strict error handling
- Proper argument validation
- Clear function names and comments
- Exit codes used correctly
- Temporary file cleanup

### Naming Conventions
**Status**: GOOD ✓

- Files: kebab-case (detect-affected-apps.sh)
- Variables: snake_case in bash (release_name)
- Functions: snake_case in bash (check_helm_status)
- Environment variables: SCREAMING_SNAKE_CASE (CHANGE_ID)

### Documentation Completeness
**Status**: EXCELLENT ✓

- README.md in .github/scripts/ directory
- Each script has header comment explaining purpose
- Specification.md is comprehensive
- Tasks.md tracks implementation progress

### Test Coverage
**Status**: LIMITED ⚠

- E2E tests cover deployed application
- **Missing**: Unit tests for bash scripts
- **Missing**: Integration tests for deployment flow
- **Recommendation**: Add shellcheck to CI

## HMCTS Platform Compliance

### Team-Based Namespacing
**Status**: CORRECT ✓

- Namespace derived from Chart.yaml annotations.team
- Pattern matches HMCTS convention

**Issue**: Mismatch between team (dtsse) and resources (cft) - see CRITICAL #2

### Metadata from Helm Charts
**Status**: CORRECT ✓

- Team name from annotations.team
- Application name from chart name
- No hardcoded values in workflow

### Platform-Managed Cleanup
**Status**: CORRECT ✓

- PR labels added: ns:{team}, prd:{team}, rel:{release}
- Pattern matches HMCTS platform automation
- No custom cleanup workflow (correct)

### Flux GitOps Compatibility
**Status**: N/A

Preview environments use direct Helm deployment, not Flux (correct for preview)

### Azure Cloud Standards
**Status**: GOOD ✓

- Uses Azure Container Registry
- Uses Azure Kubernetes Service
- Uses Azure PostgreSQL Flexible Server
- Follows HMCTS resource naming conventions

**Issue**: Resource group mismatch (see CRITICAL #2)

## Next Steps

### CRITICAL - Must Fix Before Any Deployment

1. **Document and configure Azure secrets**
   - Create setup guide with all required GitHub secrets
   - Get secrets from platform team
   - Test authentication works

2. **Fix team/environment mismatch**
   - Decide: DTSSE or CFT?
   - Update workflow resource group and cluster names
   - Update PostgreSQL flexible server reference
   - Verify RBAC permissions

3. **Replace port-forward with reliable testing approach**
   - Option A: Implement Azure Playwright Service
   - Option B: Test against ingress URLs with firewall rules
   - Update E2E test job accordingly

4. **Revert insecure cookie configuration**
   - Identify where secure cookies were disabled
   - Fix root cause (probably port-forward using HTTP)
   - Ensure production always uses secure cookies

5. **Add cleanup verification**
   - Create workflow to verify cleanup on PR close
   - Add monitoring for orphaned resources
   - Document manual cleanup procedure

### HIGH PRIORITY - Should Fix Before Production Use

1. Add Docker build caching to improve build times
2. Add timeouts to all workflow jobs
3. Fix image tag strategy for unaffected apps (use `latest`)
4. Remove redundant Helm dependency updates
5. Simplify rollback logic for preview deployments
6. Use generic TEST_URL instead of app-specific env vars
7. Add timeout failure to port-forward connectivity test

### SUGGESTIONS - Consider for Future Iterations

1. Extract Chart.yaml parsing to shared function
2. Add workflow_dispatch for manual deployments
3. Improve error messages with context and remediation
4. Add preview environment health check
5. Use Helm test hooks for post-deployment validation
6. Improve deployment observability with GitHub step summaries
7. Document local development workflow
8. Add cost estimation and monitoring

## Final Recommendation

**Status**: NEEDS CHANGES

This implementation demonstrates strong technical skills and follows many best practices for infrastructure as code. The script organization, error handling, and Helm patterns are excellent. However, several critical issues prevent this from being production-ready:

1. **Missing Azure credentials documentation** - workflow will fail immediately
2. **Team/environment configuration mismatch** - RBAC will likely fail
3. **Unreliable port-forward testing approach** - will cause flaky tests
4. **No cleanup verification** - risk of resource leaks
5. **Security configuration disabled** - needs investigation

Once these critical issues are addressed, this will be a solid foundation for preview deployments. The infrastructure is well-designed and the implementation is thorough.

**Recommended Action**: Fix CRITICAL issues #1-5, then re-test with an actual PR deployment to verify end-to-end functionality before merging.

---

**Review Completed**: 2025-11-10
**Reviewer**: Code Reviewer Agent
