#!/usr/bin/env bash
set -euo pipefail

# Script: deploy-preview.sh
# Purpose: Deploy preview environment locally for testing
# Usage: ./deploy-preview.sh [PR_NUMBER] [--dry-run]

print_usage() {
  cat <<EOF
Usage: $0 [PR_NUMBER] [OPTIONS]

Deploy a preview environment to AKS cluster.

Arguments:
  PR_NUMBER         PR number for deployment (default: local)

Options:
  --dry-run        Show what would be deployed without actually deploying
  --skip-update    Skip Helm dependency updates (use cached charts)
  -h, --help       Show this help message

Examples:
  # Deploy PR 114
  $0 114

  # Deploy with "local" tag
  $0 local

  # Deploy locally without updating dependencies
  $0 local --skip-update

  # Dry run to see what would be deployed
  $0 114 --dry-run
EOF
}

main() {
  local pr_number="${1:-local}"
  local dry_run=false
  local skip_update=false

  # Parse arguments
  while [[ $# -gt 0 ]]; do
    case "$1" in
      -h|--help)
        print_usage
        exit 0
        ;;
      --dry-run)
        dry_run=true
        shift
        ;;
      --skip-update)
        skip_update=true
        shift
        ;;
      *)
        pr_number="$1"
        shift
        ;;
    esac
  done

  # Navigate to repository root
  cd "$(git rev-parse --show-toplevel)"

  # Read metadata from root Helm chart
  local chart_path="helm/expressjs-monorepo-template/Chart.yaml"
  if [ ! -f "$chart_path" ]; then
    echo "Error: Chart.yaml not found at ${chart_path}"
    exit 1
  fi

  # Extract metadata
  export AZURE_TENANT_ID=531ff96d-0ae9-462a-8d2d-bec7c0b42082
  export TEAM_NAME=$(grep -A 1 'annotations:' "$chart_path" | grep 'team:' | awk '{print $2}' | tr -d '"')
  export APPLICATION_NAME=$(grep '^name:' "$chart_path" | awk '{print $2}' | tr -d '"')
  export GIT_REPO=$(git config --get remote.origin.url | sed 's/git@github.com:/https:\/\/github.com\//' | sed 's/\.git$//')
  export TIMESTAMP=$(date +%Y%m%d%H%M%S)
  export SHORT_SHA=$(git rev-parse --short HEAD)
  export CHANGE_ID="${pr_number}"

  # Set image tags (allow override from environment)
  if [ "$pr_number" = "local" ]; then
    export WEB_IMAGE="${WEB_IMAGE:-latest}"
    export API_IMAGE="${API_IMAGE:-latest}"
    export CRONS_IMAGE="${CRONS_IMAGE:-latest}"
  else
    export WEB_IMAGE="${WEB_IMAGE:-pr-${pr_number}}"
    export API_IMAGE="${API_IMAGE:-pr-${pr_number}}"
    export CRONS_IMAGE="${CRONS_IMAGE:-pr-${pr_number}}"
  fi

  # Deployment variables
  local release_name="${RELEASE_NAME:-${APPLICATION_NAME}-pr-${CHANGE_ID}}"
  local namespace="${TEAM_NAME}"

  echo "=========================================="
  echo "Preview Deployment Configuration"
  echo "=========================================="
  echo "Team:           ${TEAM_NAME}"
  echo "Application:    ${APPLICATION_NAME}"
  echo "PR/Change ID:   ${CHANGE_ID}"
  echo "Release Name:   ${release_name}"
  echo "Namespace:      ${namespace}"
  echo "Git Repo:       ${GIT_REPO}"
  echo "Git SHA:        ${SHORT_SHA}"
  echo "Timestamp:      ${TIMESTAMP}"
  echo "Web Image:      ${WEB_IMAGE}"
  echo "API Image:      ${API_IMAGE}"
  echo "Crons Image:    ${CRONS_IMAGE}"
  echo "=========================================="
  echo

  if [ "$dry_run" = true ]; then
    echo "DRY RUN MODE - No changes will be made"
    echo
  fi

  # Process values template
  echo "Processing Helm values template..."
  cd "helm/${APPLICATION_NAME}"
  envsubst < values.preview.template.yaml > values.preview.yaml

  if [ "$dry_run" = true ]; then
    echo "Generated values.preview.yaml:"
    cat values.preview.yaml
    echo
  fi

  # Update Helm dependencies
  if [ "$skip_update" = true ]; then
    echo "Skipping Helm dependency updates (using cached charts)..."
  else
    echo "Updating subchart dependencies..."
    for subchart in ../../apps/*/helm; do
      if [ -f "$subchart/Chart.yaml" ]; then
        echo "  Updating dependencies for $subchart"
        if [ "$dry_run" = false ]; then
          (cd "$subchart" && helm dependency update)
        else
          echo "  Would run: cd $subchart && helm dependency update"
        fi
      fi
    done

    echo "Updating parent chart dependencies..."
    if [ "$dry_run" = false ]; then
      helm dependency update
    else
      echo "Would run: helm dependency update"
    fi
  fi

  # Deploy Helm chart
  echo "Deploying Helm chart..."

  local helm_cmd=(
    helm upgrade --install "${release_name}" .
    --namespace "${namespace}"
    --values values.preview.yaml
    --atomic
    --cleanup-on-fail
    --set "global.tenantId=${AZURE_TENANT_ID}"
    --set global.environment=aat
    --set global.enableKeyVaults=true
    --set global.devMode=true
    --set global.disableTraefikTls=false
    --set "global.tags.teamName=${TEAM_NAME}"
    --set "global.tags.applicationName=${APPLICATION_NAME}"
    --set "global.tags.builtFrom=${GIT_REPO}"
    --set global.tags.businessArea=CFT
    --set global.tags.environment=development
    --wait
    --timeout 10m
  )

  if [ "$dry_run" = true ]; then
    echo "Would run:"
    printf '%s\n' "${helm_cmd[@]}"
  else
    "${helm_cmd[@]}"
    echo
    echo "=========================================="
    echo "Deployment completed successfully!"
    echo "=========================================="
    echo "Release: ${release_name}"
    echo "Namespace: ${namespace}"
    echo
    echo "To check status:"
    echo "  kubectl get pods -n ${namespace}"
    echo "  helm status ${release_name} -n ${namespace}"
    echo
    echo "To get URLs:"
    echo "  kubectl get ingress -n ${namespace}"
  fi
}

main "$@"
