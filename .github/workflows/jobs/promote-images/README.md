# Promote Images Job

## Purpose

Promotes Docker images from `staging-{sha}` tag to `latest` tag after successful E2E tests on master. This makes the tested images available for production deployments.

## Inputs

| Type | Name | Required | Description |
|------|------|----------|-------------|
| `string` | `short-sha` | Yes | Short git SHA for source image tag |
| `string` | `affected-apps` | Yes | JSON array of affected apps |
| `string` | `helm-apps` | Yes | JSON array of all Helm apps |

## Secrets

| Name | Required | Description |
|------|----------|-------------|
| `REGISTRY_USERNAME` | Yes | ACR username for Docker registry |
| `REGISTRY_PASSWORD` | Yes | ACR password for Docker registry |

## Behavior

- Only runs if E2E tests pass (`needs.e2e-stage.result == 'success'`)
- Only promotes apps that were affected (rebuilt)
- Uses matrix strategy to promote in parallel
- Pulls `staging-{sha}` tag, retags to `latest`, pushes

## Image Tagging Flow

```
Build Stage:     staging-{sha}  (e.g., staging-abc1234)
                      ↓
E2E Tests:       Test against staging-{sha}
                      ↓
Promote Stage:   latest        (production-ready)
```

## Registry

- **Registry**: `hmctspublic.azurecr.io`
- **Image Format**: `{team}/{app-name}:{tag}`
