#!/usr/bin/env bash
set -euo pipefail

# Script: set-image-variables.sh
# Purpose: Set dynamic image tag variables for Helm deployment
# Arguments:
#   $1: affected_apps - JSON array of affected app names
#   $2: helm_apps - JSON array of all apps with Helm charts
#   $3: change_id - PR/change ID
#   $4: short_sha - Short git SHA
#   $5: timestamp - Build timestamp
# Outputs:
#   Environment variables: {APP}_IMAGE for each Helm app
#   - If app was affected: pr-{change_id}-{sha}-{timestamp}
#   - If app was not affected: latest

main() {
  local affected_apps="${1:-}"
  local helm_apps="${2:-}"
  local change_id="${3:-}"
  local short_sha="${4:-}"
  local timestamp="${5:-}"

  if [ -z "$affected_apps" ] || [ -z "$helm_apps" ] || [ -z "$change_id" ] || [ -z "$short_sha" ] || [ -z "$timestamp" ]; then
    echo "Usage: $0 <affected_apps_json> <helm_apps_json> <change_id> <short_sha> <timestamp>"
    exit 1
  fi

  echo "Setting image tag variables for Helm apps..."

  # Process each Helm app
  echo "$helm_apps" | jq -r '.[]' | while read -r app; do
    # Convert app name to environment variable name
    # Example: web -> WEB_IMAGE, my-app -> MY_APP_IMAGE
    local env_var_name
    env_var_name=$(echo "${app}" | tr '[:lower:]' '[:upper:]' | tr '-' '_')_IMAGE

    # Check if app was affected (needs rebuild)
    if echo "$affected_apps" | jq -e --arg app "$app" 'index($app)' > /dev/null 2>&1; then
      # App was affected - use PR-specific tag
      local image_tag="pr-${change_id}-${short_sha}-${timestamp}"

      if [ -n "${GITHUB_ENV:-}" ]; then
        echo "${env_var_name}=${image_tag}" >> "$GITHUB_ENV"
      fi

      echo "✓ ${app}: ${image_tag} (rebuilt)"
    else
      # App not affected - use latest
      if [ -n "${GITHUB_ENV:-}" ]; then
        echo "${env_var_name}=latest" >> "$GITHUB_ENV"
      fi

      echo "○ ${app}: latest (not affected)"
    fi
  done
}

main "$@"
