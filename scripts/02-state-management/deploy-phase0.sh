#!/bin/bash
# Deploy Phase 0: State Backend (uses local state)
# This script creates the Azure Storage Account that will be used for Pulumi state
# for all subsequent phases.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../99-utilities/common.sh"

PROJECT_ROOT="$(get_project_root)"
LOCAL_STATE_DIR="${PULUMI_LOCAL_STATE_DIR:-$HOME/.pulumi-local}"

# Default values
REGION="eastus"
ENVIRONMENT="dev"
DRY_RUN=false
SKIP_CONFIRM=false

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --region)
            REGION="$2"
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
        -h|--help)
            cat << EOF
Usage: $0 [OPTIONS]

Deploy Phase 0: State Backend using local state.

This script:
  1. Creates local state directory (~/.pulumi-local)
  2. Logs in to Pulumi local state
  3. Deploys Azure Storage Account for state storage
  4. Outputs storage account details for Phase 1+

Options:
  --region REGION    Azure region (default: eastus)
  --env ENV          Environment name (default: dev)
  --dry-run          Preview changes without deploying
  --yes, -y          Skip confirmation prompts
  -h, --help         Show this help message

Examples:
  # Deploy state backend to eastus
  $0

  # Deploy to westus in production
  $0 --region westus --env prod

  # Preview deployment
  $0 --dry-run

EOF
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            exit 1
            ;;
    esac
done

STACK_NAME="${ENVIRONMENT}-${REGION}"

echo "============================================"
echo "  Phase 0: State Backend Deployment"
echo "============================================"
echo ""
log_info "Environment: $ENVIRONMENT"
log_info "Region: $REGION"
log_info "Stack Name: $STACK_NAME"
log_info "Local State Dir: $LOCAL_STATE_DIR"
log_info "Dry Run: $DRY_RUN"
echo ""

# Pre-flight checks
preflight_checks() {
    log_info "Running pre-flight checks..."

    # Check Azure CLI
    if ! command_exists az; then
        log_error "Azure CLI not found. Run: ./scripts/00-prerequisites/install-tools.sh"
        exit 1
    fi

    # Check Pulumi
    if ! command_exists pulumi; then
        log_error "Pulumi CLI not found. Run: ./scripts/00-prerequisites/install-tools.sh"
        exit 1
    fi

    # Check Azure login
    if ! az account show &>/dev/null; then
        log_error "Not logged in to Azure. Run: ./scripts/00-prerequisites/azure-login.sh"
        exit 1
    fi

    # Check Node.js
    if ! command_exists node; then
        log_error "Node.js not found. Run: ./scripts/00-prerequisites/install-tools.sh"
        exit 1
    fi

    log_success "All pre-flight checks passed"
}

# Setup local state directory
setup_local_state() {
    log_info "Setting up local state directory..."

    if [[ ! -d "$LOCAL_STATE_DIR" ]]; then
        mkdir -p "$LOCAL_STATE_DIR"
        log_success "Created: $LOCAL_STATE_DIR"
    else
        log_info "Local state directory already exists"
    fi

    # Login to local state
    log_info "Logging in to Pulumi local state..."
    pulumi logout --all 2>/dev/null || true
    pulumi login "file://$LOCAL_STATE_DIR"
    log_success "Logged in to local state: file://$LOCAL_STATE_DIR"
}

# Deploy state backend
deploy_state_backend() {
    log_info "Deploying state backend..."

    local stack_dir="$PROJECT_ROOT/stacks/00-state-backend"

    if [[ ! -d "$stack_dir" ]]; then
        log_error "State backend stack not found: $stack_dir"
        exit 1
    fi

    cd "$stack_dir"

    # Install dependencies
    log_info "Installing dependencies..."
    pnpm install --silent

    # Initialize or select stack
    if pulumi stack ls 2>/dev/null | grep -q "$STACK_NAME"; then
        log_info "Selecting existing stack: $STACK_NAME"
        pulumi stack select "$STACK_NAME"
    else
        log_info "Initializing new stack: $STACK_NAME"
        pulumi stack init "$STACK_NAME"
    fi

    # Set configuration
    pulumi config set azure-native:location "$REGION"

    # Deploy or preview
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "Previewing deployment..."
        pulumi preview
    else
        if [[ "$SKIP_CONFIRM" == "true" ]]; then
            pulumi up --yes
        else
            pulumi up
        fi
    fi

    cd "$PROJECT_ROOT"
}

# Get and display outputs
show_outputs() {
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "Dry run - no outputs available"
        return
    fi

    local stack_dir="$PROJECT_ROOT/stacks/00-state-backend"
    cd "$stack_dir"

    local storage_account
    local container_name

    storage_account=$(pulumi stack output storageAccountName 2>/dev/null || echo "")
    container_name=$(pulumi stack output containerName 2>/dev/null || echo "")

    if [[ -n "$storage_account" ]] && [[ -n "$container_name" ]]; then
        echo ""
        echo "============================================"
        echo "  State Backend Deployed Successfully!"
        echo "============================================"
        echo ""
        log_success "Storage Account: $storage_account"
        log_success "Container Name: $container_name"
        echo ""
        echo "Next steps:"
        echo "  1. Switch to Azure Blob state for Phase 1+:"
        echo ""
        echo "     export STORAGE_ACCOUNT=$storage_account"
        echo "     export CONTAINER_NAME=$container_name"
        echo "     export AZURE_STORAGE_KEY=\$(az storage account keys list \\"
        echo "       --account-name \$STORAGE_ACCOUNT \\"
        echo "       --query '[0].value' -o tsv)"
        echo "     pulumi logout"
        echo "     pulumi login azblob://\${STORAGE_ACCOUNT}/\${CONTAINER_NAME}"
        echo ""
        echo "  2. Or run the full deployment script:"
        echo "     ./scripts/02-state-management/deploy-all.sh --env $ENVIRONMENT --region $REGION"
        echo ""

        # Export for use by other scripts
        echo "# Save these for later use:"
        echo "export PULUMI_STATE_STORAGE_ACCOUNT=$storage_account"
        echo "export PULUMI_STATE_CONTAINER=$container_name"

        # Write to a temp file for deploy-all.sh to read
        local state_info_file="$PROJECT_ROOT/.state-backend-info"
        cat > "$state_info_file" << EOF
STORAGE_ACCOUNT=$storage_account
CONTAINER_NAME=$container_name
STACK_NAME=$STACK_NAME
EOF
        log_info "State info saved to: $state_info_file"
    else
        log_warn "Could not retrieve outputs. Check deployment status."
    fi

    cd "$PROJECT_ROOT"
}

# Backup reminder
backup_reminder() {
    echo ""
    echo "============================================"
    echo "  IMPORTANT: Backup Your Local State!"
    echo "============================================"
    echo ""
    log_warn "Your local state directory contains the Phase 0 state."
    log_warn "This is your BOOTSTRAP RECOVERY KEY."
    echo ""
    echo "Back it up now:"
    echo "  cp -r $LOCAL_STATE_DIR ${LOCAL_STATE_DIR}-backup-\$(date +%Y%m%d)"
    echo ""
    echo "Or create a compressed archive:"
    echo "  tar -czf pulumi-local-backup-\$(date +%Y%m%d).tar.gz $LOCAL_STATE_DIR"
    echo ""
}

# Main
main() {
    preflight_checks

    if [[ "$SKIP_CONFIRM" != "true" ]] && [[ "$DRY_RUN" != "true" ]]; then
        echo ""
        log_warn "This will deploy the state backend using LOCAL STATE."
        log_warn "Local state directory: $LOCAL_STATE_DIR"
        echo ""
        if ! confirm "Ready to deploy Phase 0 (State Backend)?"; then
            log_info "Deployment cancelled"
            exit 0
        fi
    fi

    setup_local_state
    deploy_state_backend
    show_outputs

    if [[ "$DRY_RUN" != "true" ]]; then
        backup_reminder
    fi
}

main "$@"
