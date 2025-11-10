#!/usr/bin/env bash
set -euo pipefail

# Script: setup-port-forwards.sh
# Purpose: Set up kubectl port-forwards for preview environment services
# Arguments:
#   $1: namespace - Kubernetes namespace
#   $2: release_name - Helm release name
# Outputs:
#   Environment variables for service URLs

main() {
  local namespace="${1:-}"
  local release_name="${2:-}"

  if [ -z "$namespace" ] || [ -z "$release_name" ]; then
    echo "Usage: $0 <namespace> <release_name>"
    exit 1
  fi

  echo "Setting up port forwards for namespace: ${namespace}, release: ${release_name}"

  # Define services with local port and service port
  # Format: service_name => "local_port:service_port"
  # Service port is what Kubernetes exposes (usually 80 for HTTP services)
  # Local port is what we forward to on localhost
  declare -A services=(
    ["web"]="3000:80"
    ["api"]="3001:80"
    ["postgres"]="5555:80"
  )

  # Store PID file location
  local pid_file="/tmp/port-forward-pids-${release_name}.txt"
  > "$pid_file"  # Clear/create PID file

  # Start port-forwards
  for service in "${!services[@]}"; do
    local ports="${services[$service]}"
    local local_port="${ports%%:*}"
    local service_port="${ports##*:}"
    local service_name="${release_name}-${service}"

    echo "Setting up port-forward for ${service_name}..."
    echo "  Service: ${service_name}"
    echo "  Local port: ${local_port}"
    echo "  Service port: ${service_port}"

    # Check if service exists
    if ! kubectl get service "${service_name}" -n "${namespace}" &>/dev/null; then
      echo "  Warning: Service ${service_name} not found, skipping"
      continue
    fi

    # Start port-forward in background
    kubectl port-forward \
      "service/${service_name}" \
      "${local_port}:${service_port}" \
      -n "${namespace}" \
      > "/tmp/port-forward-${service}.log" 2>&1 &

    local pid=$!
    echo "$pid" >> "$pid_file"
    echo "  Started port-forward with PID: ${pid}"

    # Give it a moment to establish
    sleep 2

    # Verify port-forward is running
    if ! kill -0 "$pid" 2>/dev/null; then
      echo "  Error: Port-forward failed to start for ${service}"
      cat "/tmp/port-forward-${service}.log"
      exit 1
    fi

    echo "  Port-forward active for ${service}"
  done

  echo ""
  echo "Waiting for port-forwards to be ready..."
  sleep 5

  # Test connectivity
  echo ""
  echo "Testing connectivity..."
  for service in "${!services[@]}"; do
    local ports="${services[$service]}"
    local local_port="${ports%%:*}"
    local service_name="${release_name}-${service}"

    # Skip if service wasn't started
    if ! kubectl get service "${service_name}" -n "${namespace}" &>/dev/null; then
      continue
    fi

    # Test if port is accessible
    if timeout 5 bash -c "echo > /dev/tcp/localhost/${local_port}" 2>/dev/null; then
      echo "  ✓ ${service} is accessible on localhost:${local_port}"
    else
      echo "  ⚠ ${service} is not responding on localhost:${local_port}"
    fi
  done

  echo ""
  echo "=========================================="
  echo "Port-forwards established successfully!"
  echo "=========================================="
  echo "PID file: ${pid_file}"
  echo ""
  echo "Service URLs:"
  echo "  Web:      http://localhost:3000"
  echo "  API:      http://localhost:3001"
  echo "  Postgres: http://localhost:5555"
  echo ""
  echo "To cleanup, run: .github/scripts/cleanup-port-forwards.sh ${release_name}"
}

main "$@"
