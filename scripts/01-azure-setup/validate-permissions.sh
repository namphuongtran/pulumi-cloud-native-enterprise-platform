#!/bin/bash
# Validate Azure permissions for landing zone deployment

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../99-utilities/common.sh"

PROJECT_ROOT="$(get_project_root)"
CONFIG_FILE="$PROJECT_ROOT/config/landing-zone.yaml"

echo "============================================"
echo "  Permission Validation"
echo "============================================"
echo ""

ERRORS=0
WARNINGS=0

# Check if logged in
if ! az account show &>/dev/null; then
    log_error "Please login to Azure first"
    exit 1
fi

CURRENT_USER=$(az ad signed-in-user show --query "userPrincipalName" -o tsv 2>/dev/null || echo "Service Principal")
log_info "Checking permissions for: $CURRENT_USER"
echo ""

# Check tenant-level permissions (for management groups)
check_management_group_permissions() {
    echo "Checking Management Group permissions..."
    echo "----------------------------------------"

    # Try to list management groups
    if az account management-group list &>/dev/null; then
        log_success "Can list management groups"

        # Check if can create
        # This is a best-effort check - actual creation might still fail
        local mg_count
        mg_count=$(az account management-group list --query "length(@)" -o tsv)
        log_info "Found $mg_count existing management groups"
    else
        log_error "Cannot access management groups"
        echo "  Required: Management Group Contributor at tenant root"
        echo "  Request access from your Azure AD Global Administrator"
        ERRORS=$((ERRORS + 1))
    fi
    echo ""
}

# Check subscription permissions
check_subscription_permissions() {
    local sub_id="$1"
    local sub_name="$2"

    echo "Checking $sub_name subscription ($sub_id)..."
    echo "----------------------------------------"

    if ! az account show --subscription "$sub_id" &>/dev/null; then
        log_error "Cannot access subscription"
        ERRORS=$((ERRORS + 1))
        return
    fi

    # Check role assignments
    local roles
    roles=$(az role assignment list --subscription "$sub_id" --assignee "$(az ad signed-in-user show --query 'id' -o tsv 2>/dev/null || echo '')" --query "[].roleDefinitionName" -o tsv 2>/dev/null || echo "")

    if echo "$roles" | grep -q "Owner"; then
        log_success "Has Owner role"
    elif echo "$roles" | grep -q "Contributor"; then
        log_success "Has Contributor role"
        if ! echo "$roles" | grep -q "User Access Administrator"; then
            log_warn "Missing User Access Administrator (needed for RBAC)"
            WARNINGS=$((WARNINGS + 1))
        fi
    else
        log_error "Insufficient permissions (need Owner or Contributor)"
        ERRORS=$((ERRORS + 1))
    fi

    # Check resource provider registrations
    local required_providers=("Microsoft.Network" "Microsoft.Compute" "Microsoft.Storage" "Microsoft.ContainerService" "Microsoft.OperationalInsights" "Microsoft.KeyVault")

    echo ""
    echo "Checking resource providers..."
    for provider in "${required_providers[@]}"; do
        local state
        state=$(az provider show --namespace "$provider" --subscription "$sub_id" --query "registrationState" -o tsv 2>/dev/null || echo "NotRegistered")
        if [[ "$state" == "Registered" ]]; then
            echo -e "  ${GREEN}✓${NC} $provider"
        else
            echo -e "  ${YELLOW}⚠${NC} $provider ($state)"
            WARNINGS=$((WARNINGS + 1))
        fi
    done
    echo ""
}

# Check EA/MCA permissions if applicable
check_billing_permissions() {
    echo "Checking billing permissions..."
    echo "-------------------------------"

    # Check if config file exists and get billing model
    if [[ -f "$CONFIG_FILE" ]]; then
        local billing_model
        billing_model=$(yaml_get "$CONFIG_FILE" "model" || echo "PAYG")

        if [[ "$billing_model" == "EA" ]]; then
            log_info "Billing model: Enterprise Agreement"
            if az billing enrollment-account list &>/dev/null; then
                log_success "Can access enrollment accounts"
            else
                log_warn "Cannot list enrollment accounts - may not be able to create subscriptions"
                WARNINGS=$((WARNINGS + 1))
            fi
        elif [[ "$billing_model" == "MCA" ]]; then
            log_info "Billing model: Microsoft Customer Agreement"
            if az billing account list &>/dev/null; then
                log_success "Can access billing accounts"
            else
                log_warn "Cannot list billing accounts - may not be able to create subscriptions"
                WARNINGS=$((WARNINGS + 1))
            fi
        else
            log_info "Billing model: Pay-As-You-Go (subscriptions must exist)"
        fi
    else
        log_warn "Configuration file not found, assuming PAYG"
    fi
    echo ""
}

# Main validation
main() {
    check_management_group_permissions
    check_billing_permissions

    # Check subscription permissions if config exists
    if [[ -f "$CONFIG_FILE" ]]; then
        local mgmt_sub conn_sub identity_sub

        mgmt_sub=$(yaml_get "$CONFIG_FILE" "management" 2>/dev/null || echo "")
        conn_sub=$(yaml_get "$CONFIG_FILE" "connectivity" 2>/dev/null || echo "")
        identity_sub=$(yaml_get "$CONFIG_FILE" "identity" 2>/dev/null || echo "")

        if [[ -n "$mgmt_sub" ]]; then
            check_subscription_permissions "$mgmt_sub" "Management"
        fi

        if [[ -n "$conn_sub" ]]; then
            check_subscription_permissions "$conn_sub" "Connectivity"
        fi

        if [[ -n "$identity_sub" ]]; then
            check_subscription_permissions "$identity_sub" "Identity"
        fi
    else
        log_warn "No configuration file found - checking current subscription only"
        local current_sub
        current_sub=$(az account show --query "id" -o tsv)
        check_subscription_permissions "$current_sub" "Current"
    fi

    # Summary
    echo "============================================"
    echo "  Summary"
    echo "============================================"
    echo ""

    if [[ $ERRORS -gt 0 ]]; then
        log_error "$ERRORS permission error(s) found"
        echo ""
        echo "Please resolve the errors above before deploying."
        exit 1
    elif [[ $WARNINGS -gt 0 ]]; then
        log_warn "$WARNINGS warning(s) found"
        echo ""
        echo "Warnings may cause issues during deployment."
        echo "Consider resolving them or proceed with caution."
        exit 0
    else
        log_success "All permission checks passed!"
        exit 0
    fi
}

main "$@"
