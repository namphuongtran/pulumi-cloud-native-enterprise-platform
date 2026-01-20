#!/bin/bash
# PAYG Subscription Setup Guide
#
# IMPORTANT: Azure CLI cannot create PAYG subscriptions programmatically.
# This is an Azure limitation - subscriptions must be created through:
#   1. Azure Portal (https://portal.azure.com)
#   2. Azure Management API with billing account access (EA/MCA only)
#
# This script helps you:
#   1. List your existing subscriptions
#   2. Validate subscription IDs
#   3. Generate configuration for the landing zone
#   4. Configure resource providers

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../99-utilities/common.sh"

PROJECT_ROOT="$(get_project_root)"
CONFIG_FILE="$PROJECT_ROOT/config/landing-zone.yaml"

echo "============================================"
echo "  PAYG Subscription Setup"
echo "============================================"
echo ""

# Check if logged in
if ! az account show &>/dev/null; then
    log_error "Not logged in to Azure. Run: ./scripts/00-prerequisites/azure-login.sh"
    exit 1
fi

# Show current account info
current_tenant=$(az account show --query tenantId -o tsv)
current_user=$(az account show --query user.name -o tsv)

log_info "Logged in as: $current_user"
log_info "Tenant ID: $current_tenant"
echo ""

# IMPORTANT: Azure CLI Limitation Notice
echo "============================================"
echo "  Azure CLI Limitation"
echo "============================================"
echo ""
log_warn "Azure CLI cannot create PAYG subscriptions."
log_info "This is an Azure platform limitation, not a script limitation."
echo ""
echo "To create PAYG subscriptions, you must use the Azure Portal:"
echo "  1. Go to: https://portal.azure.com/#view/Microsoft_Azure_Billing/SubscriptionsBlade"
echo "  2. Click '+ Add'"
echo "  3. Select 'Pay-As-You-Go'"
echo "  4. Complete the subscription creation wizard"
echo ""
echo "For Enterprise Agreement (EA) or Microsoft Customer Agreement (MCA),"
echo "subscriptions can be created programmatically via the Billing API."
echo ""

# List existing subscriptions
echo "============================================"
echo "  Your Existing Subscriptions"
echo "============================================"
echo ""
az account list --output table --query "[].{Name:name, SubscriptionId:id, State:state}" 2>/dev/null || true
echo ""

# Function to register resource providers
register_providers() {
    local sub_id="$1"
    local sub_name="$2"

    log_info "Registering resource providers for: $sub_name"

    # Core providers needed for landing zone
    local providers=(
        "Microsoft.Resources"
        "Microsoft.Storage"
        "Microsoft.Network"
        "Microsoft.Compute"
        "Microsoft.ContainerService"
        "Microsoft.KeyVault"
        "Microsoft.Sql"
        "Microsoft.ManagedIdentity"
        "Microsoft.OperationalInsights"
        "Microsoft.Insights"
        "Microsoft.Authorization"
        "Microsoft.Management"
    )

    for provider in "${providers[@]}"; do
        echo -n "  Registering $provider... "
        if az provider register --namespace "$provider" --subscription "$sub_id" &>/dev/null; then
            echo "OK"
        else
            echo "SKIP (may already be registered)"
        fi
    done

    log_success "Resource providers registered"
}

# Collect subscription information
echo "============================================"
echo "  Configure Subscriptions"
echo "============================================"
echo ""
echo "The Azure Landing Zone can use a single subscription (simple)"
echo "or multiple subscriptions (recommended for production)."
echo ""
echo "Minimum requirement: 1 subscription for all resources"
echo "Recommended: Separate subscriptions for management, connectivity, and workloads"
echo ""

# Single or multiple subscriptions?
echo "Choose configuration mode:"
echo "  1) Single subscription (all resources in one subscription)"
echo "  2) Multiple subscriptions (recommended for production)"
echo ""
read -r -p "Enter choice [1/2]: " config_mode

MGMT_SUB_ID=""
CONN_SUB_ID=""
WORKLOAD_SUB_ID=""

if [[ "$config_mode" == "1" ]]; then
    echo ""
    echo "Enter the subscription ID to use for all resources:"
    read -r -p "Subscription ID: " MGMT_SUB_ID

    if [[ -n "$MGMT_SUB_ID" ]]; then
        if validate_subscription "$MGMT_SUB_ID"; then
            log_success "Subscription validated"
            CONN_SUB_ID="$MGMT_SUB_ID"
            WORKLOAD_SUB_ID="$MGMT_SUB_ID"

            if confirm "Register resource providers on this subscription?"; then
                register_providers "$MGMT_SUB_ID" "Single Subscription"
            fi
        else
            log_error "Could not validate subscription"
            exit 1
        fi
    fi
else
    # Multiple subscriptions
    echo ""
    echo "----------------------------"
    echo "1. MANAGEMENT SUBSCRIPTION"
    echo "----------------------------"
    echo "For: Monitoring, logging, shared services"
    echo ""
    read -r -p "Enter Management Subscription ID: " MGMT_SUB_ID

    if [[ -n "$MGMT_SUB_ID" ]] && validate_subscription "$MGMT_SUB_ID"; then
        log_success "Management subscription validated"
        if confirm "Register resource providers?"; then
            register_providers "$MGMT_SUB_ID" "Management"
        fi
    fi

    echo ""
    echo "----------------------------"
    echo "2. CONNECTIVITY SUBSCRIPTION"
    echo "----------------------------"
    echo "For: Hub network, firewall, DNS, VPN/ExpressRoute"
    echo ""
    read -r -p "Enter Connectivity Subscription ID (or Enter to use Management): " CONN_SUB_ID

    if [[ -z "$CONN_SUB_ID" ]]; then
        CONN_SUB_ID="$MGMT_SUB_ID"
        log_info "Using Management subscription for Connectivity"
    elif validate_subscription "$CONN_SUB_ID"; then
        log_success "Connectivity subscription validated"
        if [[ "$CONN_SUB_ID" != "$MGMT_SUB_ID" ]] && confirm "Register resource providers?"; then
            register_providers "$CONN_SUB_ID" "Connectivity"
        fi
    fi

    echo ""
    echo "----------------------------"
    echo "3. WORKLOAD SUBSCRIPTION"
    echo "----------------------------"
    echo "For: AKS, databases, application resources"
    echo ""
    read -r -p "Enter Workload Subscription ID (or Enter to use Management): " WORKLOAD_SUB_ID

    if [[ -z "$WORKLOAD_SUB_ID" ]]; then
        WORKLOAD_SUB_ID="$MGMT_SUB_ID"
        log_info "Using Management subscription for Workloads"
    elif validate_subscription "$WORKLOAD_SUB_ID"; then
        log_success "Workload subscription validated"
        if [[ "$WORKLOAD_SUB_ID" != "$MGMT_SUB_ID" ]] && [[ "$WORKLOAD_SUB_ID" != "$CONN_SUB_ID" ]]; then
            if confirm "Register resource providers?"; then
                register_providers "$WORKLOAD_SUB_ID" "Workload"
            fi
        fi
    fi
fi

# Generate configuration
echo ""
echo "============================================"
echo "  Generated Configuration"
echo "============================================"
echo ""
echo "Add this to your config/landing-zone.yaml:"
echo ""
echo "---"
cat << EOF
platform:
  organization:
    name: your-org-name
    displayName: Your Organization

  billing:
    model: PAYG
    subscriptions:
      management: "$MGMT_SUB_ID"
      connectivity: "$CONN_SUB_ID"
      workload: "$WORKLOAD_SUB_ID"

  region:
    mode: single
    primary: eastus
EOF
echo "---"
echo ""

# Offer to create config file
if [[ ! -f "$CONFIG_FILE" ]]; then
    if confirm "Create config/landing-zone.yaml with these values?"; then
        mkdir -p "$(dirname "$CONFIG_FILE")"
        cat > "$CONFIG_FILE" << EOF
# Azure Landing Zone Configuration
# Generated by create-subscriptions-payg.sh

platform:
  organization:
    name: your-org-name
    displayName: Your Organization

  billing:
    model: PAYG
    subscriptions:
      management: "$MGMT_SUB_ID"
      connectivity: "$CONN_SUB_ID"
      workload: "$WORKLOAD_SUB_ID"

  region:
    mode: single
    primary: eastus

workloads:
  defaults:
    computeType: aks
    tier: corp
EOF
        log_success "Created: $CONFIG_FILE"
        log_info "Edit this file to customize your organization name and region"
    fi
elif confirm "Update config/landing-zone.yaml with subscription IDs?"; then
    cp "$CONFIG_FILE" "$CONFIG_FILE.bak"
    log_info "Backup created: $CONFIG_FILE.bak"
    log_warn "Please manually update the subscription IDs in the config file"
    log_info "Management: $MGMT_SUB_ID"
    log_info "Connectivity: $CONN_SUB_ID"
    log_info "Workload: $WORKLOAD_SUB_ID"
fi

# Next steps
echo ""
echo "============================================"
echo "  Next Steps"
echo "============================================"
echo ""
echo "1. Edit configuration:"
echo "   nano config/landing-zone.yaml"
echo ""
echo "2. Deploy Phase 0 (State Backend):"
echo "   ./scripts/02-state-management/deploy-phase0.sh"
echo ""
echo "3. Deploy all phases:"
echo "   ./scripts/02-state-management/deploy-all.sh"
echo ""
echo "Or deploy everything including Phase 0:"
echo "   ./scripts/02-state-management/deploy-all.sh --include-phase0"
echo ""
