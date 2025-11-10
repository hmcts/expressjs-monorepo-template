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
- `REGISTRY_PREFIX`: ACR registry prefix (`team/application-name`)
- `IMAGE_TAG`: Combined image tag (`pr-{id}-{sha}`)

**Example:**
```bash
./generate-build-metadata.sh 123 abc1234567890def web

# Outputs:
# team-name=dtsse
# application-name=expressjs-monorepo-template-web
# git-repo=https://github.com/hmcts/expressjs-monorepo-template
# timestamp=20240101120000
# short-sha=abc1234
# REGISTRY_PREFIX=dtsse/expressjs-monorepo-template-web
# IMAGE_TAG=pr-123-abc1234
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
   - Sets `{APP}_IMAGE=pr-{id}-{sha}` (with SHA to force pod recreation)
4. If app was not affected:
   - Sets `{APP}_IMAGE=pr-{id}` (static PR tag, not latest)

**Example:**
```bash
./set-image-variables.sh \
  '["web","api"]' \
  '["web","api","crons"]' \
  123 \
  abc1234 \
  20240101120000 \
  expressjs-monorepo-template

# Outputs:
# Release name: expressjs-monorepo-template-pr-123
# WEB_IMAGE=pr-123-abc1234 (rebuilt)
# API_IMAGE=pr-123-abc1234 (rebuilt)
# CRONS_IMAGE=pr-123 (not rebuilt, using static tag)
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

### `init.sh`

Initializes a new repository from the template by replacing placeholder values with team-specific names.

**Usage:**
```bash
./.github/scripts/init.sh
```

**Interactive Prompts:**
- Team name (e.g., CaTH, Civil, Divorce)
- Product name (e.g., Service, Money-Claims, Possessions)

**Actions:**
1. Validates input (alphanumeric, spaces, and hyphens only)
2. Converts to lowercase with hyphens (e.g., CaTH Service → cath-service)
3. Replaces all template values throughout the codebase:
   - `expressjs-monorepo-template` → `{team}-{product}`
   - `dtsse` → `{team}` (lowercase)
   - `DTSSE` → `{TEAM}` (uppercase)
4. Rebuilds yarn lockfile
5. Runs tests to verify setup
6. Removes itself after completion

**Files excluded from replacement:**
- `node_modules/`
- `.git/`
- `dist/`
- `.turbo/`
- `coverage/`

**Example:**
```bash
$ ./.github/scripts/init.sh
Enter team name (e.g., CaTH): Civil
Enter product name (e.g., Service): Money-Claims
# Replaces values and creates civil-money-claims repository
```

---

### `setup-sonarcloud-project.sh`

Automatically creates SonarCloud projects if they don't already exist, enabling seamless CI/CD integration.

**Usage:**
```bash
export SONAR_TOKEN="your-token"
./.github/scripts/setup-sonarcloud-project.sh
```

**Required Environment Variables:**
- `SONAR_TOKEN`: SonarCloud authentication token with project creation permissions

**Configuration Source:**
Reads from `sonar-project.properties`:
- `sonar.projectKey`: Unique project identifier
- `sonar.projectName`: Display name
- `sonar.organization`: SonarCloud organization

**Logic:**
1. Checks if project exists via SonarCloud API
2. If exists: Exits successfully
3. If not exists: Creates new project with public visibility
4. Sets up main branch configuration

**Example:**
```bash
# In CI/CD pipeline
- name: Setup SonarCloud project
  run: .github/scripts/setup-sonarcloud-project.sh
  env:
    SONAR_TOKEN: ${{ secrets.SONAR_TOKEN }}
```

**Error Handling:**
- Validates all required configuration is present
- Provides clear error messages for permission issues
- Suggests manual creation if token lacks permissions

---

### `setup-port-forwards.sh`

Sets up kubectl port-forwards to preview environment services for local testing against deployed preview environments.

**Usage:**
```bash
./.github/scripts/setup-port-forwards.sh <namespace> <release_name>
```

**Arguments:**
- `namespace`: Kubernetes namespace (typically team name)
- `release_name`: Helm release name (e.g., `expressjs-monorepo-template-pr-123`)

**Port Mappings:**
- Web: `localhost:3000` → service port 80
- API: `localhost:3001` → service port 80
- Postgres: `localhost:5555` → service port 80

**Outputs:**
- PID file: `/tmp/port-forward-pids-{release_name}.txt`
- Service URLs printed to console

**Example:**
```bash
./setup-port-forwards.sh dtsse dtsse-expressjs-monorepo-template-pr-123

# Outputs:
# Port-forwards established successfully!
# Service URLs:
#   Web:      http://localhost:3000
#   API:      http://localhost:3001
#   Postgres: http://localhost:5555
```

**Features:**
- Skips services that don't exist in the deployment
- Verifies port-forwards are running after startup
- Tests connectivity to each service
- Stores PIDs for cleanup

**Cleanup:**
```bash
.github/scripts/cleanup-port-forwards.sh <release_name>
```

---

### `cleanup-port-forwards.sh`

Cleans up kubectl port-forward processes created by `setup-port-forwards.sh`.

**Usage:**
```bash
./.github/scripts/cleanup-port-forwards.sh <release_name>
```

**Arguments:**
- `release_name`: Helm release name (must match the one used in setup)

**Logic:**
1. Reads PIDs from `/tmp/port-forward-pids-{release_name}.txt`
2. Terminates each process gracefully
3. Removes PID file
4. Cleans up log files (`/tmp/port-forward-*.log`)

**Fallback:**
If PID file not found, attempts to kill all `kubectl port-forward` processes.

**Example:**
```bash
# After testing preview environment
.github/scripts/cleanup-port-forwards.sh dtsse-expressjs-monorepo-template-pr-123

# Outputs:
# Cleanup complete: 3/3 processes terminated
```

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
