#!/usr/bin/env bash
set -euo pipefail

# Script: cleanup-port-forwards.sh
# Purpose: Clean up kubectl port-forward processes
# Arguments:
#   $1: release_name - Helm release name (used to find PID file)

main() {
  local release_name="${1:-}"

  if [ -z "$release_name" ]; then
    echo "Usage: $0 <release_name>"
    exit 1
  fi

  local pid_file="/tmp/port-forward-pids-${release_name}.txt"

  echo "Cleaning up port-forwards for release: ${release_name}"

  if [ ! -f "$pid_file" ]; then
    echo "Warning: PID file not found at ${pid_file}"
    echo "Attempting to find and kill any kubectl port-forward processes..."

    # Fallback: kill any kubectl port-forward processes
    pkill -f "kubectl port-forward" || true
    echo "Cleanup complete (fallback method)"
    return 0
  fi

  echo "Reading PIDs from ${pid_file}..."

  local killed_count=0
  local total_count=0

  while IFS= read -r pid; do
    total_count=$((total_count + 1))

    if [ -z "$pid" ]; then
      continue
    fi

    echo "  Killing process ${pid}..."

    if kill -0 "$pid" 2>/dev/null; then
      if kill "$pid" 2>/dev/null; then
        killed_count=$((killed_count + 1))
        echo "    ✓ Process ${pid} terminated"
      else
        echo "    ⚠ Failed to kill process ${pid}"
      fi
    else
      echo "    ℹ Process ${pid} already terminated"
    fi
  done < "$pid_file"

  # Remove PID file
  rm -f "$pid_file"
  echo ""
  echo "Cleanup complete: ${killed_count}/${total_count} processes terminated"

  # Also clean up log files
  rm -f /tmp/port-forward-*.log
}

main "$@"
