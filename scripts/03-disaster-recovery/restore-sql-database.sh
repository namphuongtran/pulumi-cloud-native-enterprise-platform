#!/bin/bash
# Disaster Recovery: Restore SQL database from geo-redundant backup
#
# This script restores an Azure SQL database from geo-redundant backup
# to the DR region. The backup is automatically replicated by Azure.
#
# Prerequisites:
#   - Azure CLI logged in with appropriate permissions
#   - Source database must have geo-redundant backup enabled
#   - Target SQL Server must exist in DR region
#
# Usage:
#   ./restore-sql-database.sh [OPTIONS]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../99-utilities/common.sh"

PROJECT_ROOT="$(get_project_root)"

# Default values
DR_REGION="westus"
ENVIRONMENT="prod"
PRIMARY_REGION="eastus"
DATABASE_NAME="shared-tenant-db"
SKIP_CONFIRM=false
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
        --primary-region)
            PRIMARY_REGION="$2"
            shift 2
            ;;
        --database)
            DATABASE_NAME="$2"
            shift 2
            ;;
        --restore-point)
            RESTORE_POINT_TIME="$2"
            shift 2
            ;;
        --yes|-y)
            SKIP_CONFIRM=true
            shift
            ;;
        -h|--help)
            cat << EOF
Usage: $0 [OPTIONS]

Restores SQL database from geo-redundant backup to DR region.

Options:
  --region REGION         Target DR region (default: westus)
  --env ENV               Environment name (default: prod)
  --primary-region REGION Primary region for source backup (default: eastus)
  --database NAME         Database name to restore (default: shared-tenant-db)
  --restore-point TIME    Restore to specific point in time (ISO 8601 format)
  --yes, -y               Skip confirmation prompts
  -h, --help              Show this help message

Examples:
  # Restore to latest available backup
  $0 --region westus --env prod

  # Restore to specific point in time
  $0 --region westus --env prod --restore-point "2024-01-15T10:00:00Z"

Notes:
  - Geo-restore can have up to 1 hour of data loss (RPO)
  - Restore time depends on database size (typically 10-30 minutes)
  - For point-in-time restore, backup must be available

EOF
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Derive names from naming convention
# Pattern: {org}-{project}-{env}-{location}-{type}
# We need to get the org from config or use a default
ORG_NAME="enterprise"  # Default, ideally read from config

PRIMARY_RG="rg-platform-${ENVIRONMENT}-${PRIMARY_REGION}"
PRIMARY_SQL_SERVER="sql-platform-${ENVIRONMENT}-${PRIMARY_REGION}"
DR_RG="rg-platform-${ENVIRONMENT}-${DR_REGION}"
DR_SQL_SERVER="sql-platform-${ENVIRONMENT}-${DR_REGION}"

echo ""
log_info "============================================================"
log_info "SQL DATABASE GEO-RESTORE"
log_info "============================================================"
echo ""
log_info "Source: ${PRIMARY_SQL_SERVER}/${DATABASE_NAME} (${PRIMARY_REGION})"
log_info "Target: ${DR_SQL_SERVER}/${DATABASE_NAME} (${DR_REGION})"
echo ""

# Confirmation
if [[ "$SKIP_CONFIRM" != "true" ]]; then
    log_warn "This will restore the database from geo-redundant backup."
    log_warn "Any existing database with the same name in DR will be overwritten."
    echo ""
    if ! confirm "Proceed with database restore?"; then
        log_info "Restore cancelled"
        exit 0
    fi
fi

# Validate Azure CLI
if ! command_exists az; then
    log_error "Azure CLI not found"
    exit 1
fi

# Check if DR SQL Server exists
log_info "Checking DR SQL Server..."
if ! az sql server show -n "$DR_SQL_SERVER" -g "$DR_RG" &>/dev/null; then
    log_error "DR SQL Server not found: $DR_SQL_SERVER"
    log_error "Please run provision-dr-region.sh first to create the infrastructure."
    exit 1
fi
log_success "DR SQL Server exists: $DR_SQL_SERVER"

# Get the source database resource ID
log_info "Getting source database information..."
SOURCE_DB_ID=$(az sql db show \
    --server "$PRIMARY_SQL_SERVER" \
    --resource-group "$PRIMARY_RG" \
    --name "$DATABASE_NAME" \
    --query "id" -o tsv 2>/dev/null || echo "")

if [[ -z "$SOURCE_DB_ID" ]]; then
    log_warn "Cannot access source database directly (region may be down)"
    log_info "Attempting geo-restore from backup..."
fi

# Check if database already exists in DR
log_info "Checking for existing database in DR..."
if az sql db show --server "$DR_SQL_SERVER" -g "$DR_RG" -n "$DATABASE_NAME" &>/dev/null; then
    log_warn "Database already exists in DR region"
    if [[ "$SKIP_CONFIRM" != "true" ]]; then
        if ! confirm "Delete existing database and restore from backup?"; then
            log_info "Restore cancelled"
            exit 0
        fi
    fi
    log_info "Deleting existing database..."
    az sql db delete --server "$DR_SQL_SERVER" -g "$DR_RG" -n "$DATABASE_NAME" --yes
fi

# Perform geo-restore
log_info "Starting geo-restore..."
log_info "This may take 10-30 minutes depending on database size..."

START_TIME=$(date +%s)

if [[ -n "$RESTORE_POINT_TIME" ]]; then
    # Point-in-time restore from geo-backup
    log_info "Restoring to point-in-time: $RESTORE_POINT_TIME"

    az sql db restore \
        --dest-name "$DATABASE_NAME" \
        --dest-resource-group "$DR_RG" \
        --dest-server "$DR_SQL_SERVER" \
        --resource-group "$PRIMARY_RG" \
        --server "$PRIMARY_SQL_SERVER" \
        --name "$DATABASE_NAME" \
        --time "$RESTORE_POINT_TIME"
else
    # Geo-restore to latest available point
    log_info "Restoring to latest available backup..."

    # Get recoverable database
    RECOVERABLE_DB=$(az sql db list-deleted \
        --server "$PRIMARY_SQL_SERVER" \
        --resource-group "$PRIMARY_RG" \
        --query "[?name=='$DATABASE_NAME'] | [0].id" -o tsv 2>/dev/null || echo "")

    # Use geo-restore
    az sql db geo-backup restore \
        --dest-name "$DATABASE_NAME" \
        --dest-resource-group "$DR_RG" \
        --dest-server "$DR_SQL_SERVER" \
        --geo-backup-id "/subscriptions/$(az account show --query id -o tsv)/resourceGroups/${PRIMARY_RG}/providers/Microsoft.Sql/servers/${PRIMARY_SQL_SERVER}/recoverableDatabases/${DATABASE_NAME}" \
        2>/dev/null || {
            # Fallback: try copy if geo-restore fails
            log_warn "Geo-restore failed, trying database copy..."
            az sql db copy \
                --dest-name "$DATABASE_NAME" \
                --dest-resource-group "$DR_RG" \
                --dest-server "$DR_SQL_SERVER" \
                --resource-group "$PRIMARY_RG" \
                --server "$PRIMARY_SQL_SERVER" \
                --name "$DATABASE_NAME" 2>/dev/null || {
                    log_error "Database restore failed."
                    log_info ""
                    log_info "Manual restore instructions:"
                    log_info "  1. Go to Azure Portal"
                    log_info "  2. Navigate to: SQL Server > $DR_SQL_SERVER"
                    log_info "  3. Click 'Import database' or 'Restore'"
                    log_info "  4. Select geo-backup from $PRIMARY_REGION"
                    log_info "  5. Configure and start restore"
                    exit 1
                }
        }
fi

END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
DURATION_MIN=$((DURATION / 60))

# Verify restore
log_info "Verifying database restore..."
sleep 10  # Wait for Azure to update status

DB_STATUS=$(az sql db show \
    --server "$DR_SQL_SERVER" \
    --resource-group "$DR_RG" \
    --name "$DATABASE_NAME" \
    --query "status" -o tsv 2>/dev/null || echo "Unknown")

if [[ "$DB_STATUS" == "Online" ]]; then
    log_success "Database restored successfully!"
else
    log_warn "Database status: $DB_STATUS (may still be restoring)"
fi

# Get connection info
DR_SQL_FQDN="${DR_SQL_SERVER}.database.windows.net"

echo ""
echo "============================================================"
echo "  RESTORE SUMMARY"
echo "============================================================"
echo ""
echo "Duration: ${DURATION_MIN} minutes"
echo "Database: $DATABASE_NAME"
echo "Server: $DR_SQL_FQDN"
echo "Status: $DB_STATUS"
echo ""
echo "Connection string:"
echo "  Server=tcp:${DR_SQL_FQDN},1433;Initial Catalog=${DATABASE_NAME};..."
echo ""

if [[ "$DB_STATUS" != "Online" ]]; then
    log_warn "Database may still be restoring. Check Azure Portal for status."
fi

log_success "SQL restore script completed"
