#!/bin/bash
# Azure authentication helper

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../99-utilities/common.sh"

echo "============================================"
echo "  Azure Authentication"
echo "============================================"
echo ""

# Parse arguments
USE_SERVICE_PRINCIPAL=false
TENANT_ID=""
CLIENT_ID=""
CLIENT_SECRET=""
SUBSCRIPTION_ID=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --sp|--service-principal)
            USE_SERVICE_PRINCIPAL=true
            shift
            ;;
        --tenant-id)
            TENANT_ID="$2"
            shift 2
            ;;
        --client-id)
            CLIENT_ID="$2"
            shift 2
            ;;
        --client-secret)
            CLIENT_SECRET="$2"
            shift 2
            ;;
        --subscription)
            SUBSCRIPTION_ID="$2"
            shift 2
            ;;
        -h|--help)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --sp, --service-principal    Use service principal authentication"
            echo "  --tenant-id TENANT_ID        Azure AD tenant ID"
            echo "  --client-id CLIENT_ID        Service principal client ID"
            echo "  --client-secret SECRET       Service principal client secret"
            echo "  --subscription SUB_ID        Default subscription ID"
            echo "  -h, --help                   Show this help message"
            echo ""
            echo "Examples:"
            echo "  # Interactive login"
            echo "  $0"
            echo ""
            echo "  # Service principal login"
            echo "  $0 --sp --tenant-id xxx --client-id yyy --client-secret zzz"
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Check if already logged in
check_current_login() {
    if az account show &>/dev/null; then
        local account
        account=$(az account show --query "{name:name, id:id}" -o json)
        local name
        name=$(echo "$account" | jq -r '.name')
        local id
        id=$(echo "$account" | jq -r '.id')

        log_info "Currently logged in to: $name"
        log_info "Subscription ID: $id"
        echo ""

        if confirm "Use this account?"; then
            return 0
        fi
    fi
    return 1
}

# Interactive login
interactive_login() {
    log_info "Starting interactive login..."
    az login

    echo ""
    log_info "Available subscriptions:"
    az account list --output table

    echo ""
    read -r -p "Enter subscription ID to use (or press Enter for default): " sub_id

    if [[ -n "$sub_id" ]]; then
        az account set --subscription "$sub_id"
        log_success "Set default subscription to: $sub_id"
    fi
}

# Service principal login
service_principal_login() {
    if [[ -z "$TENANT_ID" ]] || [[ -z "$CLIENT_ID" ]] || [[ -z "$CLIENT_SECRET" ]]; then
        log_error "Service principal login requires --tenant-id, --client-id, and --client-secret"
        exit 1
    fi

    log_info "Logging in with service principal..."
    az login --service-principal \
        --tenant "$TENANT_ID" \
        --username "$CLIENT_ID" \
        --password "$CLIENT_SECRET"

    if [[ -n "$SUBSCRIPTION_ID" ]]; then
        az account set --subscription "$SUBSCRIPTION_ID"
        log_success "Set default subscription to: $SUBSCRIPTION_ID"
    fi
}

# Main flow
main() {
    # Check current login
    if check_current_login; then
        log_success "Using existing Azure login"
        return 0
    fi

    # Perform login
    if [[ "$USE_SERVICE_PRINCIPAL" == "true" ]]; then
        service_principal_login
    else
        interactive_login
    fi

    echo ""
    echo "============================================"
    log_success "Azure authentication successful!"
    echo ""

    # Show current context
    az account show --output table
}

main "$@"
