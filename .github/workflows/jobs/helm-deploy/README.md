# Helm Deploy Job

## Purpose

Deploys the preview environment to Azure Kubernetes Service (AKS) using Helm. Handles Azure authentication, kubelogin setup, and Helm chart installation with retry logic for robust deployments.

## Inputs

| Type | Name | Required | Description |
|------|------|----------|-------------|
| `string` | `timestamp` | Yes | Build timestamp for image tagging |
| `string` | `short-sha` | Yes | Short git SHA for image tagging |
| `string` | `affected-apps` | Yes | JSON array of affected apps |
| `string` | `helm-apps` | Yes | JSON array of all Helm apps |

## Artifacts

| Direction | Name | Description |
|-----------|------|-------------|
| - | - | No artifacts consumed or produced |

## Environment Variables

| Name | Required | Description |
|------|----------|-------------|
| `CHANGE_ID` | Auto | PR number (set from `github.event.pull_request.number`) |
| `TEAM_NAME` | Auto | Team name from Helm chart annotations |
| `APPLICATION_NAME` | Auto | Application name from Helm chart |
| `RELEASE_NAME` | Auto | Helm release name (`{app}-pr-{PR#}`) |
| `WEB_IMAGE` | Auto | Web app image tag |
| `API_IMAGE` | Auto | API app image tag |
| `CRONS_IMAGE` | Auto | Crons app image tag |
| `POSTGRES_IMAGE` | Auto | Postgres app image tag |

## Secrets

| Name | Required | Description |
|------|----------|-------------|
| `AZURE_CREDENTIALS_CFT_PREVIEW` | Yes | Azure service principal credentials for CFT preview |
| `AZURE_SUBSCRIPTION_CFT_PREVIEW` | Yes | Azure subscription ID for preview environment |
| `REGISTRY_USERNAME` | Yes | ACR username for Helm chart registry |
| `REGISTRY_PASSWORD` | Yes | ACR password for Helm chart registry |

## Outputs

| Name | Description |
|------|-------------|
| `preview-urls` | Base64-encoded JSON object with preview environment URLs |

## Scripts

| Script | Purpose |
|--------|---------|
| `deploy-preview.sh` | Main deployment script with retry logic and stuck release recovery |

## Deployment Process

1. **Azure Authentication** - Login to Azure using service principal
2. **AKS Credentials** - Get kubectl credentials for preview cluster
3. **Kubelogin Setup** - Install and configure kubelogin for Azure AD auth
4. **Helm Setup** - Install Helm and login to chart registry
5. **Deploy** - Run deployment script with retry logic
6. **Get URLs** - Extract ingress URLs for deployed services

## Retry Logic

The deployment script includes:
- 3 retry attempts with exponential backoff (30s, 60s, 90s)
- Automatic recovery from stuck Helm releases
- Rollback to last known good revision when possible

## Environment

Uses the `preview` GitHub environment for deployment protection rules.

## Permissions

- `contents: read` - Read repository contents
- `id-token: write` - Required for Azure OIDC authentication
- `pull-requests: write` - Add labels and comments to PR
