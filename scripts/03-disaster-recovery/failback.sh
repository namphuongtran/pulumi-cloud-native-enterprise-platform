#!/bin/bash
# Disaster Recovery: Failback to primary region
#
# This script helps orchestrate the failback process from DR region
# back to the primary region after it has been restored.
#
# Prerequisites:
#   - Primary region infrastructure must be recovered/redeployed
#   - Data sync/migration plan must be in place
#
# Usage:
#   ./failback.sh [OPTIONS]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../99-utilities/common.sh"

PROJECT_ROOT="$(get_project_root)"

# Default values
PRIMARY_REGION="eastus"
DR_REGION="westus"
ENVIRONMENT="prod"
SKIP_CONFIRM=false
DESTROY_DR=false

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --primary-region)
            PRIMARY_REGION="$2"
            shift 2
            ;;
        --dr-region)
            DR_REGION="$2"
            shift 2
            ;;
        --env)
            ENVIRONMENT="$2"
            shift 2
            ;;
        --destroy-dr)
            DESTROY_DR=true
            shift
            ;;
        --yes|-y)
            SKIP_CONFIRM=true
            shift
            ;;
        -h|--help)
            cat << EOF
Usage: $0 [OPTIONS]

Orchestrates failback from DR region to primary region.

Options:
  --primary-region REGION  Primary region to failback to (default: eastus)
  --dr-region REGION       Current DR region (default: westus)
  --env ENV                Environment name (default: prod)
  --destroy-dr             Destroy DR resources after failback
  --yes, -y                Skip confirmation prompts
  -h, --help               Show this help message

Failback Process:
  1. Validate primary region is healthy
  2. Sync data from DR to primary (if needed)
  3. Update traffic routing to primary
  4. Validate primary is serving traffic
  5. (Optional) Destroy DR resources

IMPORTANT:
  - Ensure primary region is fully recovered before failback
  - Have a data sync plan for changes made during DR period
  - Test failback during maintenance window if possible

EOF
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            exit 1
            ;;
    esac
done

PRIMARY_RG="rg-platform-${ENVIRONMENT}-${PRIMARY_REGION}"
DR_RG="rg-platform-${ENVIRONMENT}-${DR_REGION}"

echo ""
echo "============================================================"
echo "  FAILBACK: ${DR_REGION} -> ${PRIMARY_REGION}"
echo "============================================================"
echo ""

log_info "Current traffic: DR region (${DR_REGION})"
log_info "Target: Primary region (${PRIMARY_REGION})"
echo ""

# Warning
log_warn "============================================================"
log_warn "  IMPORTANT: Failback Checklist"
log_warn "============================================================"
echo ""
echo "Before proceeding, ensure:"
echo "  [ ] Primary region Azure services are healthy"
echo "  [ ] Primary infrastructure has been redeployed"
echo "  [ ] Data sync strategy is in place"
echo "  [ ] Maintenance window is scheduled (if production)"
echo "  [ ] Rollback plan is ready"
echo ""

if [[ "$SKIP_CONFIRM" != "true" ]]; then
    if ! confirm "Have you completed the above checklist?"; then
        log_info "Failback cancelled. Complete the checklist first."
        exit 0
    fi
fi

# ============================================================
# Step 1: Validate Primary Region
# ============================================================
log_info "============================================================"
log_info "Step 1: Validating Primary Region"
log_info "============================================================"

log_info "Checking primary resource group..."
if ! az group show -n "$PRIMARY_RG" &>/dev/null; then
    log_error "Primary resource group not found: $PRIMARY_RG"
    log_error "Redeploy primary infrastructure first:"
    log_error "  cd stacks/02-platform-services"
    log_error "  pulumi stack select ${ENVIRONMENT}-${PRIMARY_REGION}"
    log_error "  pulumi up"
    exit 1
fi
log_success "Primary resource group exists"

# Check AKS
PRIMARY_AKS="aks-platform-${ENVIRONMENT}-${PRIMARY_REGION}"
log_info "Checking primary AKS cluster..."
if az aks show -n "$PRIMARY_AKS" -g "$PRIMARY_RG" &>/dev/null; then
    AKS_STATE=$(az aks show -n "$PRIMARY_AKS" -g "$PRIMARY_RG" --query "provisioningState" -o tsv)
    if [[ "$AKS_STATE" == "Succeeded" ]]; then
        log_success "Primary AKS cluster is healthy"
    else
        log_error "Primary AKS cluster state: $AKS_STATE"
        exit 1
    fi
else
    log_error "Primary AKS cluster not found: $PRIMARY_AKS"
    exit 1
fi

# Check SQL
PRIMARY_SQL="sql-platform-${ENVIRONMENT}-${PRIMARY_REGION}"
log_info "Checking primary SQL Server..."
if az sql server show -n "$PRIMARY_SQL" -g "$PRIMARY_RG" &>/dev/null; then
    SQL_STATE=$(az sql server show -n "$PRIMARY_SQL" -g "$PRIMARY_RG" --query "state" -o tsv)
    if [[ "$SQL_STATE" == "Ready" ]]; then
        log_success "Primary SQL Server is ready"
    else
        log_error "Primary SQL Server state: $SQL_STATE"
        exit 1
    fi
else
    log_error "Primary SQL Server not found: $PRIMARY_SQL"
    exit 1
fi

log_success "Primary region validation passed"

# ============================================================
# Step 2: Data Synchronization
# ============================================================
log_info "============================================================"
log_info "Step 2: Data Synchronization"
log_info "============================================================"

echo ""
log_warn "Data sync must be performed manually based on your data strategy."
echo ""
echo "Options for data sync:"
echo ""
echo "  Option A: Export/Import (for small databases)"
echo "    1. Export data from DR database"
echo "    2. Import data to primary database"
echo ""
echo "  Option B: Database Copy (requires both regions accessible)"
echo "    az sql db copy \\"
echo "      --dest-name shared-tenant-db \\"
echo "      --dest-resource-group $PRIMARY_RG \\"
echo "      --dest-server $PRIMARY_SQL \\"
echo "      --resource-group $DR_RG \\"
echo "      --server sql-platform-${ENVIRONMENT}-${DR_REGION} \\"
echo "      --name shared-tenant-db"
echo ""
echo "  Option C: Accept data loss (use primary backup)"
echo "    If DR changes are acceptable to lose, restore primary from backup"
echo ""

if [[ "$SKIP_CONFIRM" != "true" ]]; then
    if ! confirm "Has data sync been completed?"; then
        log_warn "Complete data sync before continuing"
        log_info "Re-run this script with --yes to skip prompts"
        exit 0
    fi
fi

# ============================================================
# Step 3: Update Traffic Routing
# ============================================================
log_info "============================================================"
log_info "Step 3: Update Traffic Routing"
log_info "============================================================"

echo ""
log_info "Update your traffic routing to point to the primary region:"
echo ""
echo "  DNS-based routing:"
echo "    Update DNS records to point to primary endpoints"
echo ""
echo "  Azure Front Door (if configured):"
echo "    Update origin priority or disable DR origin"
echo ""
echo "  Load Balancer:"
echo "    Update backend pool to primary targets"
echo ""

if [[ "$SKIP_CONFIRM" != "true" ]]; then
    if ! confirm "Has traffic routing been updated to primary?"; then
        log_info "Update traffic routing before continuing"
        exit 0
    fi
fi

# ============================================================
# Step 4: Validate Traffic
# ============================================================
log_info "============================================================"
log_info "Step 4: Validate Traffic"
log_info "============================================================"

echo ""
log_info "Validate that traffic is now being served by primary region:"
echo ""
echo "  1. Check application health endpoints"
echo "  2. Verify logs in primary Log Analytics"
echo "  3. Monitor for errors in Application Insights"
echo "  4. Test critical user flows"
echo ""

if [[ "$SKIP_CONFIRM" != "true" ]]; then
    if ! confirm "Is traffic successfully flowing to primary region?"; then
        log_error "Traffic validation failed. Investigate before continuing."
        exit 1
    fi
fi

log_success "Traffic successfully routed to primary region"

# ============================================================
# Step 5: Cleanup DR Resources (Optional)
# ============================================================
if [[ "$DESTROY_DR" == "true" ]]; then
    log_info "============================================================"
    log_info "Step 5: Cleanup DR Resources"
    log_info "============================================================"

    log_warn "This will DESTROY all resources in the DR region: $DR_REGION"

    if [[ "$SKIP_CONFIRM" != "true" ]]; then
        echo ""
        if ! confirm "Are you sure you want to destroy DR resources?"; then
            log_info "DR resources preserved"
        else
            log_info "Destroying DR infrastructure..."

            cd "$PROJECT_ROOT/stacks/02-platform-services"
            pulumi stack select "${ENVIRONMENT}-${DR_REGION}"
            pulumi destroy --yes

            log_success "DR resources destroyed"
        fi
    else
        cd "$PROJECT_ROOT/stacks/02-platform-services"
        pulumi stack select "${ENVIRONMENT}-${DR_REGION}"
        pulumi destroy --yes
        log_success "DR resources destroyed"
    fi
else
    log_info "============================================================"
    log_info "Step 5: DR Resources Preserved"
    log_info "============================================================"
    echo ""
    log_info "DR resources in $DR_REGION have been preserved."
    log_info "To destroy them later, run:"
    echo ""
    echo "  cd stacks/02-platform-services"
    echo "  pulumi stack select ${ENVIRONMENT}-${DR_REGION}"
    echo "  pulumi destroy"
    echo ""
    log_info "Or re-run this script with --destroy-dr"
fi

# ============================================================
# Summary
# ============================================================
echo ""
echo "============================================================"
echo "  FAILBACK COMPLETE"
echo "============================================================"
echo ""
log_success "Successfully failed back to primary region: $PRIMARY_REGION"
echo ""
echo "Post-failback tasks:"
echo "  [ ] Monitor primary region for stability"
echo "  [ ] Review and archive DR incident report"
echo "  [ ] Update runbooks with lessons learned"
echo "  [ ] Schedule DR drill to test recovery"
echo ""

log_success "Failback script completed"
