#!/bin/bash
# Switch Pulumi backend from local state to Azure Blob state
# Run this after Phase 0 (state backend) is deployed

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../99-utilities/common.sh"

PROJECT_ROOT="$(get_project_root)"
LOCAL_STATE_DIR="${PULUMI_LOCAL_STATE_DIR:-$HOME/.pulumi-local}"
STATE_INFO_FILE="$PROJECT_ROOT/.state-backend-info"

echo "============================================"
echo "  Switch to Azure Blob State Backend"
echo "============================================"
echo ""

# Check if logged in to Azure
if ! az account show &>/dev/null; then
    log_error "Not logged in to Azure. Run: ./scripts/00-prerequisites/azure-login.sh"
    exit 1
fi

# Try to get storage account info from saved file or from Pulumi outputs
get_storage_info() {
    local storage_account=""
    local container_name=""

    # Option 1: Try to read from saved file
    if [[ -f "$STATE_INFO_FILE" ]]; then
        log_info "Reading state info from: $STATE_INFO_FILE"
        source "$STATE_INFO_FILE"
        storage_account="${STORAGE_ACCOUNT:-}"
        container_name="${CONTAINER_NAME:-}"
    fi

    # Option 2: Try to get from Pulumi outputs (requires local state login)
    if [[ -z "$storage_account" ]] || [[ -z "$container_name" ]]; then
        log_info "Attempting to get outputs from Pulumi local state..."

        # Save current login
        local current_backend
        current_backend=$(pulumi whoami -v 2>/dev/null | grep -oP 'Backend URL: \K.*' || echo "")

        # Login to local state temporarily
        pulumi login "file://$LOCAL_STATE_DIR" 2>/dev/null || true

        cd "$PROJECT_ROOT/stacks/00-state-backend"

        # Get available stacks
        local stack_name
        stack_name=$(pulumi stack ls --json 2>/dev/null | jq -r '.[0].name' 2>/dev/null || echo "")

        if [[ -n "$stack_name" ]] && [[ "$stack_name" != "null" ]]; then
            pulumi stack select "$stack_name" 2>/dev/null || true
            storage_account=$(pulumi stack output storageAccountName 2>/dev/null || echo "")
            container_name=$(pulumi stack output containerName 2>/dev/null || echo "")
        fi

        cd "$PROJECT_ROOT"
    fi

    # Option 3: Ask user
    if [[ -z "$storage_account" ]]; then
        echo ""
        log_warn "Could not automatically detect storage account info."
        echo ""
        read -r -p "Enter Storage Account Name: " storage_account
    fi

    if [[ -z "$container_name" ]]; then
        read -r -p "Enter Container Name (default: pulumi-state): " container_name
        container_name="${container_name:-pulumi-state}"
    fi

    # Validate
    if [[ -z "$storage_account" ]]; then
        log_error "Storage account name is required"
        exit 1
    fi

    echo "$storage_account:$container_name"
}

# Main logic
main() {
    log_info "Getting storage account information..."
    local storage_info
    storage_info=$(get_storage_info)

    local storage_account="${storage_info%%:*}"
    local container_name="${storage_info##*:}"

    log_info "Storage Account: $storage_account"
    log_info "Container Name: $container_name"
    echo ""

    # Verify storage account exists
    log_info "Verifying storage account exists..."
    if ! az storage account show --name "$storage_account" &>/dev/null; then
        log_error "Storage account not found: $storage_account"
        log_info "Did you deploy Phase 0? Run: ./scripts/02-state-management/deploy-phase0.sh"
        exit 1
    fi
    log_success "Storage account verified"

    # Get storage account key
    log_info "Getting storage account key..."
    local storage_key
    storage_key=$(az storage account keys list \
        --account-name "$storage_account" \
        --query '[0].value' -o tsv)

    if [[ -z "$storage_key" ]]; then
        log_error "Could not retrieve storage account key"
        exit 1
    fi
    log_success "Storage key retrieved"

    # Export the key for Pulumi
    export AZURE_STORAGE_KEY="$storage_key"

    # Verify container exists
    log_info "Verifying container exists..."
    if ! az storage container show \
        --name "$container_name" \
        --account-name "$storage_account" \
        --account-key "$storage_key" &>/dev/null; then
        log_error "Container not found: $container_name"
        exit 1
    fi
    log_success "Container verified"

    # Switch Pulumi backend
    echo ""
    log_info "Switching Pulumi backend to Azure Blob..."
    pulumi logout --all 2>/dev/null || true
    pulumi login "azblob://${container_name}" --cloud-url "azblob://${container_name}?storage_account=${storage_account}"

    # Verify login
    echo ""
    log_info "Verifying Pulumi backend..."
    pulumi whoami -v

    echo ""
    echo "============================================"
    echo "  Successfully Switched to Azure Blob!"
    echo "============================================"
    echo ""
    log_success "Pulumi is now using Azure Blob state"
    echo ""
    echo "Backend: azblob://${storage_account}/${container_name}"
    echo ""
    echo "Next steps:"
    echo "  1. Deploy Phase 1+:"
    echo "     ./scripts/02-state-management/deploy-all.sh"
    echo ""
    echo "  2. Or deploy individual phases:"
    echo "     ./scripts/02-state-management/deploy-all.sh --phase bootstrap"
    echo "     ./scripts/02-state-management/deploy-all.sh --phase platform"
    echo "     ./scripts/02-state-management/deploy-all.sh --phase workloads"
    echo ""

    # Save environment variables for convenience
    local env_file="$PROJECT_ROOT/.pulumi-azure-state"
    cat > "$env_file" << EOF
# Pulumi Azure Blob State Configuration
# Source this file: source .pulumi-azure-state

export AZURE_STORAGE_ACCOUNT=$storage_account
export AZURE_STORAGE_CONTAINER=$container_name
export AZURE_STORAGE_KEY=$storage_key
EOF

    log_info "State configuration saved to: $env_file"
    log_info "Source it with: source .pulumi-azure-state"
}

main "$@"
