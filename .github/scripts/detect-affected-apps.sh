#!/usr/bin/env bash
set -euo pipefail

# Script: detect-affected-apps.sh
# Purpose: Detect which apps have been affected by changes using Turborepo
# Outputs:
#   - affected_apps: JSON array of apps with Dockerfiles that were affected
#   - helm_apps: JSON array of all apps with Helm charts
#   - has_changes: boolean indicating if any apps were affected

main() {
  echo "Detecting affected apps using Turborepo..."

  # Get affected packages using Turborepo (comparing against base branch)
  # Note: --affected and --filter cannot be used together
  local affected_json
  affected_json=$(yarn turbo ls --affected --output=json 2>/dev/null || echo '{"packages":{"items":[]}}')

  # Extract paths, filter to apps directory, strip apps/ prefix, and filter to only those with Dockerfiles
  local affected_apps
  affected_apps=$(echo "$affected_json" | jq -r '.packages.items[].path' | grep '^apps/' | sed 's|^apps/||' | while read -r app_name; do
    if [ -f "apps/${app_name}/Dockerfile" ]; then
      echo "$app_name"
    fi
  done | jq -R -s -c 'split("\n") | map(select(. != ""))')

  # Find all apps with Helm charts
  local helm_apps
  helm_apps=$(find apps/*/helm -name Chart.yaml 2>/dev/null | sed 's|apps/\([^/]*\)/helm/Chart.yaml|\1|' | jq -R -s -c 'split("\n") | map(select(. != ""))')

  # Determine if we have any changes
  local has_changes="false"
  if [ "$affected_apps" != "[]" ] && [ -n "$affected_apps" ]; then
    has_changes="true"
  fi

  # Output results for GitHub Actions
  if [ -n "${GITHUB_OUTPUT:-}" ]; then
    echo "affected-apps=$affected_apps" >> "$GITHUB_OUTPUT"
    echo "helm-apps=$helm_apps" >> "$GITHUB_OUTPUT"
    echo "has-changes=$has_changes" >> "$GITHUB_OUTPUT"
  fi

  # Log results
  echo "Affected apps (with Dockerfiles): $affected_apps"
  echo "Helm apps (all): $helm_apps"
  echo "Has changes: $has_changes"
}

main "$@"
