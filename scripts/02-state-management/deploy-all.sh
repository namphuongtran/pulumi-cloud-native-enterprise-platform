#!/bin/bash
# Orchestrates full Azure Landing Zone deployment
# Handles Phase 0 (local state) through Phase 3 (Azure Blob state)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../99-utilities/common.sh"

PROJECT_ROOT="$(get_project_root)"
CONFIG_FILE="$PROJECT_ROOT/config/landing-zone.yaml"
LOCAL_STATE_DIR="${PULUMI_LOCAL_STATE_DIR:-$HOME/.pulumi-local}"
STATE_INFO_FILE="$PROJECT_ROOT/.state-backend-info"
AZURE_STATE_FILE="$PROJECT_ROOT/.pulumi-azure-state"

# Default values
PHASE="all"
STACK_SUFFIX=""
DRY_RUN=false
SKIP_CONFIRM=false
REGION="eastus"
ENVIRONMENT="dev"
INCLUDE_PHASE0=false

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --phase)
            PHASE="$2"
            shift 2
            ;;
        --stack)
            STACK_SUFFIX="$2"
            shift 2
            ;;
        --region)
            REGION="$2"
            shift 2
            ;;
        --env)
            ENVIRONMENT="$2"
            shift 2
            ;;
        --include-phase0)
            INCLUDE_PHASE0=true
            shift
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

Orchestrates the Azure Landing Zone deployment.

Phases:
  phase0     - State Backend (uses local state)
  bootstrap  - Phase 1: Management Groups and Policies
  platform   - Phase 2: Platform Services and Add-ons
  workloads  - Phase 3: Application Services
  all        - Phases 1-3 (default, requires Phase 0 already deployed)

Options:
  --phase PHASE      Deploy specific phase (default: all)
  --include-phase0   Include Phase 0 in 'all' deployment
  --stack SUFFIX     Stack name suffix (default: <env>-<region>)
  --region REGION    Azure region (default: eastus)
  --env ENV          Environment name (default: dev)
  --dry-run          Preview changes without deploying
  --yes, -y          Skip confirmation prompts
  -h, --help         Show this help message

Examples:
  # Deploy Phase 0 (state backend with local state)
  $0 --phase phase0

  # Deploy all phases 1-3 (requires Phase 0 already deployed)
  $0

  # Deploy everything including Phase 0
  $0 --include-phase0

  # Deploy only bootstrap phase
  $0 --phase bootstrap

  # Deploy platform to production
  $0 --phase platform --env prod --region eastus

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

# Set stack suffix if not provided
if [[ -z "$STACK_SUFFIX" ]]; then
    STACK_SUFFIX="${ENVIRONMENT}-${REGION}"
fi

echo "============================================"
echo "  Azure Landing Zone Deployment"
echo "============================================"
echo ""
log_info "Phase: $PHASE"
log_info "Stack: $STACK_SUFFIX"
log_info "Region: $REGION"
log_info "Environment: $ENVIRONMENT"
log_info "Include Phase 0: $INCLUDE_PHASE0"
log_info "Dry Run: $DRY_RUN"
echo ""

# Validate configuration
validate_config() {
    log_info "Validating configuration..."
    if [[ ! -f "$CONFIG_FILE" ]]; then
        log_error "Configuration file not found: $CONFIG_FILE"
        log_info "Create one with: cp config/examples/minimal-payg-single.yaml config/landing-zone.yaml"
        exit 1
    fi
    log_success "Configuration file found"
}

# Check Azure login
check_azure_login() {
    if ! az account show &>/dev/null; then
        log_error "Not logged in to Azure. Run: ./scripts/00-prerequisites/azure-login.sh"
        exit 1
    fi
    log_success "Azure CLI authenticated"
}

# Switch to local state for Phase 0
switch_to_local_state() {
    log_info "Switching to local state backend..."

    if [[ ! -d "$LOCAL_STATE_DIR" ]]; then
        mkdir -p "$LOCAL_STATE_DIR"
        log_success "Created: $LOCAL_STATE_DIR"
    fi

    pulumi logout --all 2>/dev/null || true
    pulumi login "file://$LOCAL_STATE_DIR"
    log_success "Logged in to local state: file://$LOCAL_STATE_DIR"
}

# Switch to Azure Blob state for Phase 1+
switch_to_azure_state() {
    log_info "Switching to Azure Blob state backend..."

    local storage_account=""
    local container_name=""
    local storage_key=""

    # Try to read from Azure state file
    if [[ -f "$AZURE_STATE_FILE" ]]; then
        source "$AZURE_STATE_FILE"
        storage_account="${AZURE_STORAGE_ACCOUNT:-}"
        container_name="${AZURE_STORAGE_CONTAINER:-}"
        storage_key="${AZURE_STORAGE_KEY:-}"
    fi

    # Try to read from state info file
    if [[ -z "$storage_account" ]] && [[ -f "$STATE_INFO_FILE" ]]; then
        source "$STATE_INFO_FILE"
        storage_account="${STORAGE_ACCOUNT:-}"
        container_name="${CONTAINER_NAME:-}"
    fi

    # Get from Pulumi outputs if not found
    if [[ -z "$storage_account" ]]; then
        log_info "Getting state backend info from Pulumi outputs..."

        # Temporarily switch to local state
        pulumi logout --all 2>/dev/null || true
        pulumi login "file://$LOCAL_STATE_DIR" 2>/dev/null || true

        cd "$PROJECT_ROOT/stacks/00-state-backend"

        local stack_name
        stack_name=$(pulumi stack ls --json 2>/dev/null | jq -r '.[0].name // empty' 2>/dev/null || echo "")

        if [[ -n "$stack_name" ]]; then
            pulumi stack select "$stack_name" 2>/dev/null || true
            storage_account=$(pulumi stack output storageAccountName 2>/dev/null || echo "")
            container_name=$(pulumi stack output containerName 2>/dev/null || echo "")
        fi

        cd "$PROJECT_ROOT"
    fi

    if [[ -z "$storage_account" ]] || [[ -z "$container_name" ]]; then
        log_error "Could not find state backend information"
        log_info "Please deploy Phase 0 first: $0 --phase phase0"
        exit 1
    fi

    # Get storage key if not cached
    if [[ -z "$storage_key" ]]; then
        log_info "Getting storage account key..."
        storage_key=$(az storage account keys list \
            --account-name "$storage_account" \
            --query '[0].value' -o tsv)
    fi

    export AZURE_STORAGE_KEY="$storage_key"

    # Login to Azure Blob backend
    pulumi logout --all 2>/dev/null || true
    pulumi login "azblob://${container_name}" --cloud-url "azblob://${container_name}?storage_account=${storage_account}"

    log_success "Logged in to Azure Blob state: azblob://${storage_account}/${container_name}"

    # Cache for later
    cat > "$AZURE_STATE_FILE" << EOF
export AZURE_STORAGE_ACCOUNT=$storage_account
export AZURE_STORAGE_CONTAINER=$container_name
export AZURE_STORAGE_KEY=$storage_key
EOF
}

# Deploy a stack
deploy_stack() {
    local stack_path="$1"
    local stack_name="$2"

    log_info "Deploying: $stack_path (stack: $stack_name)"

    cd "$PROJECT_ROOT/$stack_path"

    # Ensure dependencies are installed
    if [[ -f "package.json" ]]; then
        pnpm install --silent
    fi

    # Initialize stack if needed
    if ! pulumi stack ls 2>/dev/null | grep -q "^$stack_name"; then
        pulumi stack init "$stack_name" 2>/dev/null || true
    fi

    pulumi stack select "$stack_name"

    # Set configuration
    pulumi config set azure-native:location "$REGION" 2>/dev/null || true

    # Deploy or preview
    if [[ "$DRY_RUN" == "true" ]]; then
        pulumi preview
    else
        if [[ "$SKIP_CONFIRM" == "true" ]]; then
            pulumi up --yes
        else
            pulumi up
        fi
    fi

    cd "$PROJECT_ROOT"
    log_success "Completed: $stack_path"
    echo ""
}

# Phase 0: State Backend (Local State)
deploy_phase0() {
    log_info "========== PHASE 0: STATE BACKEND =========="

    switch_to_local_state

    if [[ -d "$PROJECT_ROOT/stacks/00-state-backend" ]]; then
        deploy_stack "stacks/00-state-backend" "$STACK_SUFFIX"

        # Save outputs for later phases
        cd "$PROJECT_ROOT/stacks/00-state-backend"
        local storage_account
        local container_name
        storage_account=$(pulumi stack output storageAccountName 2>/dev/null || echo "")
        container_name=$(pulumi stack output containerName 2>/dev/null || echo "")

        if [[ -n "$storage_account" ]] && [[ -n "$container_name" ]]; then
            cat > "$STATE_INFO_FILE" << EOF
STORAGE_ACCOUNT=$storage_account
CONTAINER_NAME=$container_name
STACK_NAME=$STACK_SUFFIX
EOF
            log_success "State backend info saved"
        fi
        cd "$PROJECT_ROOT"

        echo ""
        log_warn "IMPORTANT: Backup your local state directory!"
        log_info "Run: cp -r $LOCAL_STATE_DIR ${LOCAL_STATE_DIR}-backup-\$(date +%Y%m%d)"
        echo ""
    else
        log_error "State backend stack not found: stacks/00-state-backend"
        exit 1
    fi
}

# Phase 1: Bootstrap (Azure Blob State)
deploy_bootstrap() {
    log_info "========== PHASE 1: BOOTSTRAP =========="

    switch_to_azure_state

    # Management Groups
    if [[ -d "$PROJECT_ROOT/stacks/01-bootstrap/management-groups" ]]; then
        deploy_stack "stacks/01-bootstrap/management-groups" "bootstrap"
    else
        log_warn "Management groups stack not found, skipping"
    fi

    # Policies
    if [[ -d "$PROJECT_ROOT/stacks/01-bootstrap/policies" ]]; then
        deploy_stack "stacks/01-bootstrap/policies" "bootstrap-policies"
    else
        log_warn "Policies stack not found, skipping"
    fi
}

# Phase 2: Platform (Azure Blob State)
deploy_platform() {
    log_info "========== PHASE 2: PLATFORM =========="

    switch_to_azure_state

    # Platform Services
    if [[ -d "$PROJECT_ROOT/stacks/02-platform-services" ]]; then
        deploy_stack "stacks/02-platform-services" "$STACK_SUFFIX"
    else
        log_warn "Platform services stack not found, skipping"
    fi

    # Services Add-ons
    if [[ -d "$PROJECT_ROOT/stacks/03-services-addons" ]]; then
        deploy_stack "stacks/03-services-addons" "$STACK_SUFFIX"
    else
        log_warn "Services addons stack not found, skipping"
    fi
}

# Phase 3: Workloads (Azure Blob State)
deploy_workloads() {
    log_info "========== PHASE 3: WORKLOADS =========="

    switch_to_azure_state

    # Application Services
    if [[ -d "$PROJECT_ROOT/stacks/04-application-services" ]]; then
        deploy_stack "stacks/04-application-services" "$STACK_SUFFIX"
    else
        log_warn "Application services stack not found, skipping"
    fi
}

# Main deployment logic
main() {
    validate_config
    check_azure_login

    if [[ "$SKIP_CONFIRM" != "true" ]] && [[ "$DRY_RUN" != "true" ]]; then
        echo ""
        if ! confirm "Ready to deploy. Continue?"; then
            log_info "Deployment cancelled"
            exit 0
        fi
    fi

    echo ""

    case "$PHASE" in
        phase0)
            deploy_phase0
            ;;
        bootstrap)
            deploy_bootstrap
            ;;
        platform)
            deploy_platform
            ;;
        workloads)
            deploy_workloads
            ;;
        all)
            if [[ "$INCLUDE_PHASE0" == "true" ]]; then
                deploy_phase0
            fi
            deploy_bootstrap
            deploy_platform
            deploy_workloads
            ;;
        *)
            log_error "Unknown phase: $PHASE"
            log_info "Valid phases: phase0, bootstrap, platform, workloads, all"
            exit 1
            ;;
    esac

    echo "============================================"
    log_success "Deployment complete!"
    echo "============================================"

    # Show current backend
    echo ""
    log_info "Current Pulumi backend:"
    pulumi whoami -v 2>/dev/null || true
}

main "$@"
