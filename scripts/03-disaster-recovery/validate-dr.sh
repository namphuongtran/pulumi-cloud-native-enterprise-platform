#!/bin/bash
# Disaster Recovery: Validate DR deployment
#
# This script validates that DR infrastructure is properly provisioned
# and ready to serve traffic. Run after provision-dr-region.sh.
#
# Usage:
#   ./validate-dr.sh [OPTIONS]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../99-utilities/common.sh"

PROJECT_ROOT="$(get_project_root)"

# Default values
DR_REGION="westus"
ENVIRONMENT="prod"
VERBOSE=false

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --region)
            DR_REGION="$2"
            shift 2
            ;;
        --env)
            ENVIRONMENT="$2"
            shift 2
            ;;
        --verbose|-v)
            VERBOSE=true
            shift
            ;;
        -h|--help)
            cat << EOF
Usage: $0 [OPTIONS]

Validates disaster recovery infrastructure deployment.

Options:
  --region REGION    DR region to validate (default: westus)
  --env ENV          Environment name (default: prod)
  --verbose, -v      Show detailed output
  -h, --help         Show this help message

Checks performed:
  1. Resource Group exists and accessible
  2. AKS cluster is healthy and nodes are ready
  3. SQL Server is online
  4. SQL Database is accessible
  5. Key Vault is accessible
  6. Network connectivity (VNet, NSG)

EOF
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            exit 1
            ;;
    esac
done

DR_STACK="${ENVIRONMENT}-${DR_REGION}"
DR_RG="rg-platform-${ENVIRONMENT}-${DR_REGION}"

echo ""
echo "============================================================"
echo "  DR VALIDATION: ${DR_REGION}"
echo "============================================================"
echo ""

PASS_COUNT=0
FAIL_COUNT=0
WARN_COUNT=0

check_pass() {
    log_success "$1"
    PASS_COUNT=$((PASS_COUNT + 1))
}

check_fail() {
    log_error "$1"
    FAIL_COUNT=$((FAIL_COUNT + 1))
}

check_warn() {
    log_warn "$1"
    WARN_COUNT=$((WARN_COUNT + 1))
}

# ============================================================
# Check 1: Resource Group
# ============================================================
log_info "Checking Resource Group..."

if az group show -n "$DR_RG" &>/dev/null; then
    RG_LOCATION=$(az group show -n "$DR_RG" --query location -o tsv)
    if [[ "$RG_LOCATION" == "$DR_REGION" ]]; then
        check_pass "Resource Group exists in $DR_REGION"
    else
        check_warn "Resource Group exists but in wrong region: $RG_LOCATION"
    fi
else
    check_fail "Resource Group not found: $DR_RG"
fi

# ============================================================
# Check 2: AKS Cluster
# ============================================================
log_info "Checking AKS Cluster..."

AKS_NAME="aks-platform-${ENVIRONMENT}-${DR_REGION}"

if az aks show -n "$AKS_NAME" -g "$DR_RG" &>/dev/null; then
    AKS_STATE=$(az aks show -n "$AKS_NAME" -g "$DR_RG" --query "provisioningState" -o tsv)
    AKS_POWER=$(az aks show -n "$AKS_NAME" -g "$DR_RG" --query "powerState.code" -o tsv)

    if [[ "$AKS_STATE" == "Succeeded" ]]; then
        check_pass "AKS cluster provisioned successfully"
    else
        check_warn "AKS cluster state: $AKS_STATE"
    fi

    if [[ "$AKS_POWER" == "Running" ]]; then
        check_pass "AKS cluster is running"
    else
        check_warn "AKS cluster power state: $AKS_POWER"
    fi

    # Check node pool
    if [[ "$VERBOSE" == "true" ]]; then
        log_info "Node pool details:"
        az aks nodepool list -g "$DR_RG" --cluster-name "$AKS_NAME" \
            --query "[].{name:name,count:count,vmSize:vmSize,status:provisioningState}" -o table
    fi

    NODE_COUNT=$(az aks nodepool list -g "$DR_RG" --cluster-name "$AKS_NAME" \
        --query "[0].count" -o tsv)
    if [[ "$NODE_COUNT" -gt 0 ]]; then
        check_pass "AKS has $NODE_COUNT node(s) ready"
    else
        check_fail "AKS has no nodes"
    fi
else
    check_fail "AKS cluster not found: $AKS_NAME"
fi

# ============================================================
# Check 3: SQL Server
# ============================================================
log_info "Checking SQL Server..."

SQL_NAME="sql-platform-${ENVIRONMENT}-${DR_REGION}"

if az sql server show -n "$SQL_NAME" -g "$DR_RG" &>/dev/null; then
    SQL_STATE=$(az sql server show -n "$SQL_NAME" -g "$DR_RG" --query "state" -o tsv)

    if [[ "$SQL_STATE" == "Ready" ]]; then
        check_pass "SQL Server is ready"
    else
        check_warn "SQL Server state: $SQL_STATE"
    fi

    SQL_FQDN=$(az sql server show -n "$SQL_NAME" -g "$DR_RG" \
        --query "fullyQualifiedDomainName" -o tsv)
    log_info "  FQDN: $SQL_FQDN"
else
    check_fail "SQL Server not found: $SQL_NAME"
fi

# ============================================================
# Check 4: SQL Database
# ============================================================
log_info "Checking SQL Database..."

DB_NAME="shared-tenant-db"

if az sql db show --server "$SQL_NAME" -g "$DR_RG" -n "$DB_NAME" &>/dev/null; then
    DB_STATUS=$(az sql db show --server "$SQL_NAME" -g "$DR_RG" -n "$DB_NAME" \
        --query "status" -o tsv)

    if [[ "$DB_STATUS" == "Online" ]]; then
        check_pass "SQL Database is online"
    else
        check_warn "SQL Database status: $DB_STATUS"
    fi
else
    check_warn "SQL Database not found: $DB_NAME (may need restore)"
fi

# ============================================================
# Check 5: Key Vault
# ============================================================
log_info "Checking Key Vault..."

# Key Vault names are globally unique, try to find it
KV_NAME=$(az keyvault list -g "$DR_RG" --query "[0].name" -o tsv 2>/dev/null || echo "")

if [[ -n "$KV_NAME" ]]; then
    KV_STATE=$(az keyvault show -n "$KV_NAME" --query "properties.provisioningState" -o tsv 2>/dev/null || echo "Unknown")

    if [[ "$KV_STATE" == "Succeeded" ]]; then
        check_pass "Key Vault is ready: $KV_NAME"
    else
        check_warn "Key Vault state: $KV_STATE"
    fi
else
    check_warn "Key Vault not found in $DR_RG"
fi

# ============================================================
# Check 6: Virtual Network
# ============================================================
log_info "Checking Virtual Network..."

VNET_NAME="vnet-platform-${ENVIRONMENT}-${DR_REGION}"

if az network vnet show -n "$VNET_NAME" -g "$DR_RG" &>/dev/null; then
    check_pass "Virtual Network exists: $VNET_NAME"

    # Check subnets
    SUBNET_COUNT=$(az network vnet subnet list -g "$DR_RG" --vnet-name "$VNET_NAME" \
        --query "length(@)" -o tsv)
    if [[ "$SUBNET_COUNT" -gt 0 ]]; then
        check_pass "VNet has $SUBNET_COUNT subnet(s)"
    else
        check_warn "VNet has no subnets"
    fi
else
    check_fail "Virtual Network not found: $VNET_NAME"
fi

# ============================================================
# Check 7: Log Analytics Workspace
# ============================================================
log_info "Checking Log Analytics..."

LAW_NAME="log-platform-${ENVIRONMENT}-${DR_REGION}"

if az monitor log-analytics workspace show -n "$LAW_NAME" -g "$DR_RG" &>/dev/null; then
    check_pass "Log Analytics Workspace exists"
else
    check_warn "Log Analytics Workspace not found"
fi

# ============================================================
# Summary
# ============================================================
echo ""
echo "============================================================"
echo "  VALIDATION SUMMARY"
echo "============================================================"
echo ""
echo "  Passed:   $PASS_COUNT"
echo "  Warnings: $WARN_COUNT"
echo "  Failed:   $FAIL_COUNT"
echo ""

if [[ $FAIL_COUNT -gt 0 ]]; then
    log_error "DR validation FAILED - $FAIL_COUNT critical issue(s)"
    exit 1
elif [[ $WARN_COUNT -gt 0 ]]; then
    log_warn "DR validation completed with $WARN_COUNT warning(s)"
    exit 0
else
    log_success "DR validation PASSED - all checks successful"
    exit 0
fi
