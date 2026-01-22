#!/bin/bash
# Common utilities for all scripts

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if command exists
command_exists() {
    command -v "$1" &> /dev/null
}

# Get script and project directories
get_script_dir() {
    echo "$(cd "$(dirname "${BASH_SOURCE[1]}")" && pwd)"
}

get_project_root() {
    local script_dir
    script_dir="$(get_script_dir)"
    echo "$(cd "$script_dir/../.." && pwd)"
}

# Load configuration
load_config() {
    local config_file="${1:-$(get_project_root)/config/landing-zone.yaml}"
    if [[ ! -f "$config_file" ]]; then
        log_error "Configuration file not found: $config_file"
        exit 1
    fi
    echo "$config_file"
}

# Parse YAML value (simple parser for flat values)
yaml_get() {
    local file="$1"
    local key="$2"
    grep -E "^[[:space:]]*${key}:" "$file" | head -1 | sed 's/.*:[[:space:]]*//' | tr -d '"' | tr -d "'"
}

# Confirm action
confirm() {
    local message="${1:-Are you sure?}"
    read -r -p "$message [y/N] " response
    case "$response" in
        [yY][eE][sS]|[yY])
            return 0
            ;;
        *)
            return 1
            ;;
    esac
}

# Wait for Azure operation
wait_for_operation() {
    local resource_id="$1"
    local timeout="${2:-300}"
    local interval="${3:-10}"
    local elapsed=0

    log_info "Waiting for operation to complete..."
    while [[ $elapsed -lt $timeout ]]; do
        local state
        state=$(az resource show --ids "$resource_id" --query "properties.provisioningState" -o tsv 2>/dev/null || echo "Unknown")

        if [[ "$state" == "Succeeded" ]]; then
            log_success "Operation completed successfully"
            return 0
        elif [[ "$state" == "Failed" ]]; then
            log_error "Operation failed"
            return 1
        fi

        sleep "$interval"
        elapsed=$((elapsed + interval))
    done

    log_error "Operation timed out after ${timeout}s"
    return 1
}

# Validate Azure subscription
validate_subscription() {
    local sub_id="$1"
    if ! az account show --subscription "$sub_id" &>/dev/null; then
        log_error "Cannot access subscription: $sub_id"
        return 1
    fi
    return 0
}

# Export for use in other scripts
export -f log_info log_success log_warn log_error
export -f command_exists get_script_dir get_project_root
export -f load_config yaml_get confirm
export -f wait_for_operation validate_subscription
