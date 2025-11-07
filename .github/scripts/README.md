# GitHub Actions Scripts

This directory contains reusable bash scripts for the GitHub Actions workflows.

## Scripts

### `detect-affected-apps.sh`

Detects which apps have been affected by changes using Turborepo.

**Usage:**
```bash
./detect-affected-apps.sh
```

**Outputs (via GITHUB_OUTPUT):**
- `affected-apps`: JSON array of app names with Dockerfiles that were affected
- `helm-apps`: JSON array of all apps with Helm charts
- `has-changes`: Boolean indicating if any apps were affected

**Example output:**
```json
affected-apps=["web","api"]
helm-apps=["web","api","crons"]
has-changes=true
```

**Logic:**
1. Uses `turbo ls --affected --filter='./apps/*'` to detect changed apps
2. Filters to only apps with `Dockerfile`
3. Finds all apps with `helm/Chart.yaml`
4. Returns JSON arrays for downstream processing

---

### `generate-build-metadata.sh`

Generates build metadata from the repository state.

**Usage:**
```bash
./generate-build-metadata.sh <change_id> <git_sha>
```

**Arguments:**
- `change_id`: PR/change identifier (e.g., PR number)
- `git_sha`: Full git SHA

**Outputs (via GITHUB_OUTPUT):**
- `team-name`: Extracted from package.json name (first part before `-`)
- `application-name`: Extracted from package.json name (after first `-`)
- `git-repo`: Git repository URL (HTTPS format)
- `timestamp`: Current timestamp (YYYYMMDDHHmmss)
- `short-sha`: Short git SHA (first 7 characters)

**Outputs (via GITHUB_ENV):**
- `REGISTRY_PREFIX`: ACR registry prefix (`team/team-app`)
- `IMAGE_TAG`: Combined image tag (`pr-{id}-{sha}-{timestamp}`)

**Example:**
```bash
./generate-build-metadata.sh 123 abc1234567890def

# Outputs:
# team-name=expressjs
# application-name=monorepo-template
# git-repo=https://github.com/hmcts/expressjs-monorepo-template
# timestamp=20240101120000
# short-sha=abc1234
# REGISTRY_PREFIX=expressjs/expressjs-monorepo-template
# IMAGE_TAG=pr-123-abc1234-20240101120000
```

**Logic:**
1. Parses `package.json` name field
2. Splits on first `-` to get team and app names
3. Converts git URL from SSH to HTTPS
4. Generates timestamp and short SHA
5. Constructs derived values

---

### `set-image-variables.sh`

Sets dynamic image tag variables for Helm deployment based on which apps were affected.

**Usage:**
```bash
./set-image-variables.sh <affected_apps_json> <helm_apps_json> <change_id> <short_sha> <timestamp>
```

**Arguments:**
- `affected_apps_json`: JSON array of affected app names (from detect-affected-apps.sh)
- `helm_apps_json`: JSON array of all Helm apps (from detect-affected-apps.sh)
- `change_id`: PR/change identifier
- `short_sha`: Short git SHA
- `timestamp`: Build timestamp

**Outputs (via GITHUB_ENV):**
- `{APP}_IMAGE`: Image tag for each Helm app (e.g., `WEB_IMAGE`, `API_IMAGE`)

**Logic:**
1. Iterates through all apps with Helm charts
2. Converts app name to env var name (e.g., `web` → `WEB_IMAGE`)
3. If app was affected (rebuilt):
   - Sets `{APP}_IMAGE=pr-{id}-{sha}-{timestamp}`
4. If app was not affected:
   - Sets `{APP}_IMAGE=latest`

**Example:**
```bash
./set-image-variables.sh \
  '["web","api"]' \
  '["web","api","crons"]' \
  123 \
  abc1234 \
  20240101120000

# Outputs:
# WEB_IMAGE=pr-123-abc1234-20240101120000 (rebuilt)
# API_IMAGE=pr-123-abc1234-20240101120000 (rebuilt)
# CRONS_IMAGE=latest (not affected)
```

---

### `get-preview-urls.sh`

Retrieves preview environment URLs from Kubernetes ingress resources after deployment.

**Usage:**
```bash
./get-preview-urls.sh <namespace> <release_name>
```

**Arguments:**
- `namespace`: Kubernetes namespace (e.g., `expressjs`)
- `release_name`: Helm release name (e.g., `expressjs-monorepo-template-pr-123`)

**Outputs (via GITHUB_OUTPUT):**
- `urls`: JSON object with all app URLs
- Individual URL variables: `{app}_url` for each discovered ingress

**Example:**
```bash
./get-preview-urls.sh expressjs expressjs-monorepo-template-pr-123

# Outputs:
# urls={"web":"https://web-pr-123.preview.platform.hmcts.net","api":"https://expressjs-monorepo-template-api-pr-123.preview.platform.hmcts.net"}
# web_url=https://web-pr-123.preview.platform.hmcts.net
# api_url=https://expressjs-monorepo-template-api-pr-123.preview.platform.hmcts.net
```

**Logic:**
1. Waits up to 30 seconds for ingress resources to be ready
2. Queries Kubernetes for ingresses with label `app.kubernetes.io/instance={release_name}`
3. Extracts hostname from each ingress
4. Returns JSON object mapping app names to URLs
5. Also outputs individual URL variables for easy access

**Why Use This:**
- URLs are not hardcoded - retrieved from actual deployment
- Works with any number of apps automatically
- Handles dynamic app discovery
- Provides both JSON object and individual variables

---

### `deploy-preview.sh`

Deploys the Helm umbrella chart to a preview environment with robust error handling and recovery.

**Usage:**
```bash
./deploy-preview.sh [PR_NUMBER] [OPTIONS]
```

**Arguments:**
- `PR_NUMBER`: PR number for deployment (default: local)

**Options:**
- `--dry-run`: Show what would be deployed without actually deploying
- `--skip-update`: Skip Helm dependency updates (use cached charts)
- `-h, --help`: Show help message

**Key Features:**

1. **Helm Status Checking** (`check_helm_status`)
   - Detects stuck Helm releases (pending-upgrade/install/rollback)
   - Automatically rolls back to last successful revision
   - Falls back to uninstall if rollback fails
   - Handles failed/uninstalled states with cleanup

2. **Retry Logic** (`deploy_with_retry`)
   - Retries deployment up to 3 times on failure
   - Uses exponential backoff (30s, 60s, 90s between attempts)
   - Re-checks and fixes Helm status before each retry
   - Provides clear success/failure feedback

3. **Enhanced Deployment Flow**
   - Pre-flight Helm status check before deployment
   - Job cleanup to avoid immutability errors
   - Uses `--atomic` and `--cleanup-on-fail` flags
   - Detailed error messages and debugging info

**Example:**
```bash
# Deploy PR 114
./deploy-preview.sh 114

# Deploy with "local" tag
./deploy-preview.sh local

# Deploy without updating dependencies (faster)
./deploy-preview.sh local --skip-update

# Dry run to see what would be deployed
./deploy-preview.sh 114 --dry-run
```

**Error Recovery:**

The script automatically handles common Helm issues:
- **"Another operation is in progress"**: Rolls back or uninstalls stuck release
- **Cancelled workflows**: Detects and recovers from pending states
- **Failed deployments**: Retries with backoff
- **Transient cluster issues**: Multiple retry attempts

This follows patterns from HMCTS cnp-jenkins-library with adaptations for GitHub Actions.

---

## Best Practices

### Error Handling
All scripts use `set -euo pipefail` for strict error handling:
- `-e`: Exit on any error
- `-u`: Exit on undefined variables
- `-o pipefail`: Exit if any command in a pipeline fails

### Testing Locally
Scripts can be tested locally without GitHub Actions:

```bash
# Test detect-affected-apps
cd /path/to/repo
.github/scripts/detect-affected-apps.sh

# Test generate-build-metadata
.github/scripts/generate-build-metadata.sh 123 $(git rev-parse HEAD)

# Test set-image-variables
.github/scripts/set-image-variables.sh \
  '["web"]' \
  '["web","api","crons"]' \
  123 \
  abc1234 \
  20240101120000
```

### Debugging
Set `GITHUB_OUTPUT` and `GITHUB_ENV` to temporary files for local testing:

```bash
export GITHUB_OUTPUT=/tmp/github_output.txt
export GITHUB_ENV=/tmp/github_env.txt

.github/scripts/detect-affected-apps.sh

cat /tmp/github_output.txt
cat /tmp/github_env.txt
```

### Adding New Scripts
When adding new scripts:
1. Use `#!/usr/bin/env bash` shebang
2. Include `set -euo pipefail`
3. Add clear comments explaining purpose, inputs, and outputs
4. Make executable: `chmod +x .github/scripts/your-script.sh`
5. Document in this README
6. Test locally before committing
