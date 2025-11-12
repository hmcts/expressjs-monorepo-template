# Change: Add Master Deployment Pipeline

## Why
Need automated deployment pipeline for master branch that provisions infrastructure and publishes artifacts to Azure Container Registry, following HMCTS cloud native platform patterns.

## What Changes
- Add `.github/workflows/master-deploy.yml` workflow triggered on push to master
- Add `infrastructure/` directory with Terraform configuration for Azure resources
- Extend existing app detection and build logic from preview pipeline
- Publish Docker images to ACR with production tags (`latest`, git SHA)
- Package and publish umbrella Helm chart to ACR Helm registry

## Impact
- Affected specs: `ci-cd-pipeline` (new capability)
- Affected code:
  - `.github/workflows/master-deploy.yml` (new workflow, reuses preview pipeline patterns)
  - `infrastructure/` (new Terraform configuration following HMCTS patterns)
  - Uses existing `helm/expressjs-monorepo-template/` chart structure
  - Uses existing app detection scripts from preview pipeline
