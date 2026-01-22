#!/bin/bash
# Disaster Recovery: Provision secondary region infrastructure
#
# This script provisions a complete infrastructure stack in a DR region
# using the existing Pulumi IaC definitions. Use when primary region is down.
#
# Prerequisites:
#   - Azure CLI logged in with appropriate permissions
#   - Pulumi CLI installed and configured
#   - Access to Pulumi state backend (Azure Blob or Pulumi Cloud)
#
# Usage:
#   ./provision-dr-region.sh [OPTIONS]
#
# Examples:
#   ./provision-dr-region.sh --region westus --env prod
#   ./provision-dr-region.sh --region westeurope --env prod --yes

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../99-utilities/common.sh"

PROJECT_ROOT="$(get_project_root)"

# Default values
DR_REGION="westus"
ENVIRONMENT="prod"
DRY_RUN=false
SKIP_CONFIRM=false
SKIP_SQL_RESTORE=false
RESTORE_POINT_TIME=""

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
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --yes|-y)
            SKIP_CONFIRM=true
            shift
            ;;
        --skip-sql-restore)
            SKIP_SQL_RESTORE=true
            shift
            ;;
        --restore-point)
            RESTORE_POINT_TIME="$2"
            shift 2
            ;;
        -h|--help)
            cat << EOF
Usage: $0 [OPTIONS]

Provisions disaster recovery infrastructure in a secondary Azure region.

Options:
  --region REGION       Target DR region (default: westus)
  --env ENV             Environment name (default: prod)
  --dry-run             Preview changes without deploying
  --skip-sql-restore    Skip SQL database restore (infrastructure only)
  --restore-point TIME  SQL restore point in ISO 8601 format (default: latest)
  --yes, -y             Skip confirmation prompts
  -h, --help            Show this help message

Examples:
  # Provision DR in West US for production
  $0 --region westus --env prod

  # Dry run to preview what will be deployed
  $0 --region westus --env prod --dry-run

  # Provision with specific restore point
  $0 --region westus --env prod --restore-point "2024-01-15T10:00:00Z"

Estimated Time:
  - Infrastructure provisioning: 15-25 minutes
  - SQL database restore: 10-30 minutes (depends on DB size)
  - Total RTO: 30-60 minutes

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

# Print banner
echo ""
echo "============================================================"
echo "  DISASTER RECOVERY ACTIVATION"
echo "============================================================"
echo ""
log_warn "DR Region: ${DR_REGION}"
log_warn "Environment: ${ENVIRONMENT}"
log_warn "Stack: ${DR_STACK}"
echo ""

# Confirmation
if [[ "$SKIP_CONFIRM" != "true" && "$DRY_RUN" != "true" ]]; then
    echo "This will provision infrastructure in ${DR_REGION}."
    echo "Estimated time: 30-60 minutes"
    echo ""
    if ! confirm "Proceed with DR activation?"; then
        log_info "DR activation cancelled"
        exit 0
    fi
fi

# Validate prerequisites
log_info "Validating prerequisites..."

if ! command_exists az; then
    log_error "Azure CLI not found. Please install: https://docs.microsoft.com/en-us/cli/azure/install-azure-cli"
    exit 1
fi

if ! command_exists pulumi; then
    log_error "Pulumi CLI not found. Please install: https://www.pulumi.com/docs/get-started/install/"
    exit 1
fi

# Check Azure login
if ! az account show &>/dev/null; then
    log_error "Not logged into Azure. Run: az login"
    exit 1
fi

SUBSCRIPTION_ID=$(az account show --query id -o tsv)
log_info "Using subscription: $SUBSCRIPTION_ID"

# Track timing
START_TIME=$(date +%s)

# ============================================================
# PHASE 1: Provision Platform Infrastructure
# ============================================================
log_info "============================================================"
log_info "PHASE 1: Provisioning Platform Infrastructure"
log_info "============================================================"

PLATFORM_DIR="$PROJECT_ROOT/stacks/02-platform-services"

if [[ ! -d "$PLATFORM_DIR" ]]; then
    log_error "Platform services directory not found: $PLATFORM_DIR"
    exit 1
fi

cd "$PLATFORM_DIR"

# Check if stack config exists
STACK_CONFIG="Pulumi.${DR_STACK}.yaml"
if [[ ! -f "$STACK_CONFIG" ]]; then
    log_warn "Stack config not found: $STACK_CONFIG"
    log_info "Creating stack config from template..."

    # Copy from primary region config if exists
    PRIMARY_CONFIG="Pulumi.${ENVIRONMENT}-eastus.yaml"
    if [[ -f "$PRIMARY_CONFIG" ]]; then
        cp "$PRIMARY_CONFIG" "$STACK_CONFIG"
        # Update region in the config
        sed -i.bak "s/eastus/${DR_REGION}/g" "$STACK_CONFIG"
        rm -f "${STACK_CONFIG}.bak"
        log_success "Created $STACK_CONFIG from $PRIMARY_CONFIG"
    else
        log_error "No template config found. Please create $STACK_CONFIG manually."
        exit 1
    fi
fi

# Select or create stack
log_info "Selecting Pulumi stack: $DR_STACK"
if ! pulumi stack select "$DR_STACK" 2>/dev/null; then
    log_info "Stack not found, creating..."
    pulumi stack init "$DR_STACK"
fi

# Install dependencies
log_info "Installing dependencies..."
pnpm install --frozen-lockfile

# Deploy infrastructure
if [[ "$DRY_RUN" == "true" ]]; then
    log_info "Running preview (dry-run mode)..."
    pulumi preview
else
    log_info "Deploying infrastructure to $DR_REGION..."
    log_info "This may take 15-25 minutes..."

    pulumi up --yes --skip-preview

    log_success "Infrastructure deployed successfully"
fi

# Get outputs
if [[ "$DRY_RUN" != "true" ]]; then
    log_info "Retrieving deployment outputs..."

    SQL_SERVER_NAME=$(pulumi stack output sqlServerName_output 2>/dev/null || echo "")
    RESOURCE_GROUP=$(pulumi stack output resourceGroupNameOutput 2>/dev/null || echo "")
    AKS_CLUSTER=$(pulumi stack output aksClusterName 2>/dev/null || echo "")

    log_info "SQL Server: $SQL_SERVER_NAME"
    log_info "Resource Group: $RESOURCE_GROUP"
    log_info "AKS Cluster: $AKS_CLUSTER"
fi

# ============================================================
# PHASE 2: SQL Database Restore (Optional)
# ============================================================
if [[ "$SKIP_SQL_RESTORE" != "true" && "$DRY_RUN" != "true" ]]; then
    log_info "============================================================"
    log_info "PHASE 2: SQL Database Restore"
    log_info "============================================================"

    # Call the SQL restore script
    if [[ -f "$SCRIPT_DIR/restore-sql-database.sh" ]]; then
        log_info "Starting SQL database restore..."

        RESTORE_ARGS="--region $DR_REGION --env $ENVIRONMENT"
        if [[ -n "$RESTORE_POINT_TIME" ]]; then
            RESTORE_ARGS="$RESTORE_ARGS --restore-point $RESTORE_POINT_TIME"
        fi
        if [[ "$SKIP_CONFIRM" == "true" ]]; then
            RESTORE_ARGS="$RESTORE_ARGS --yes"
        fi

        bash "$SCRIPT_DIR/restore-sql-database.sh" $RESTORE_ARGS
    else
        log_warn "SQL restore script not found. Manual restore required."
        echo ""
        echo "To restore SQL database manually:"
        echo "  1. Go to Azure Portal > SQL Server > $SQL_SERVER_NAME"
        echo "  2. Click 'Import database'"
        echo "  3. Select geo-redundant backup from primary region"
        echo "  4. Configure database name and tier"
        echo "  5. Click 'OK' to start restore"
        echo ""
    fi
else
    if [[ "$SKIP_SQL_RESTORE" == "true" ]]; then
        log_info "Skipping SQL restore (--skip-sql-restore specified)"
    fi
fi

# ============================================================
# PHASE 3: Validation
# ============================================================
if [[ "$DRY_RUN" != "true" ]]; then
    log_info "============================================================"
    log_info "PHASE 3: Validation"
    log_info "============================================================"

    # Validate AKS cluster
    if [[ -n "$AKS_CLUSTER" && -n "$RESOURCE_GROUP" ]]; then
        log_info "Validating AKS cluster..."
        if az aks show -n "$AKS_CLUSTER" -g "$RESOURCE_GROUP" --query "provisioningState" -o tsv | grep -q "Succeeded"; then
            log_success "AKS cluster is healthy"
        else
            log_warn "AKS cluster provisioning may still be in progress"
        fi
    fi

    # Validate SQL Server
    if [[ -n "$SQL_SERVER_NAME" && -n "$RESOURCE_GROUP" ]]; then
        log_info "Validating SQL Server..."
        if az sql server show -n "$SQL_SERVER_NAME" -g "$RESOURCE_GROUP" --query "state" -o tsv | grep -q "Ready"; then
            log_success "SQL Server is healthy"
        else
            log_warn "SQL Server may still be provisioning"
        fi
    fi
fi

# ============================================================
# Summary
# ============================================================
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
DURATION_MIN=$((DURATION / 60))

echo ""
echo "============================================================"
echo "  DR ACTIVATION SUMMARY"
echo "============================================================"
echo ""

if [[ "$DRY_RUN" == "true" ]]; then
    log_info "Dry run completed. No resources were created."
else
    log_success "DR infrastructure provisioned in ${DR_REGION}"
    echo ""
    echo "Duration: ${DURATION_MIN} minutes"
    echo ""
    echo "Resources created:"
    echo "  - Resource Group: $RESOURCE_GROUP"
    echo "  - AKS Cluster: $AKS_CLUSTER"
    echo "  - SQL Server: $SQL_SERVER_NAME"
    echo ""

    if [[ "$SKIP_SQL_RESTORE" == "true" ]]; then
        log_warn "SQL database was NOT restored. Run restore-sql-database.sh manually."
    fi

    echo "Next steps:"
    echo "  1. Verify SQL database restore completed"
    echo "  2. Update DNS or traffic routing to point to $DR_REGION"
    echo "  3. Deploy application workloads if needed"
    echo "  4. Notify stakeholders of DR activation"
    echo ""
    echo "To get AKS credentials:"
    echo "  az aks get-credentials -n $AKS_CLUSTER -g $RESOURCE_GROUP"
    echo ""
fi

log_success "DR activation script completed"
