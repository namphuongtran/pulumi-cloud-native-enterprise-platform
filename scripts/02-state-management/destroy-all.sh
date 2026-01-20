#!/bin/bash
# Destroys Azure Landing Zone resources in reverse order
# Phase 3 -> Phase 2 -> Phase 1 -> Phase 0 (optional)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../99-utilities/common.sh"

PROJECT_ROOT="$(get_project_root)"
LOCAL_STATE_DIR="${PULUMI_LOCAL_STATE_DIR:-$HOME/.pulumi-local}"
AZURE_STATE_FILE="$PROJECT_ROOT/.pulumi-azure-state"
STATE_INFO_FILE="$PROJECT_ROOT/.state-backend-info"

# Default values
PHASE="all"
STACK_SUFFIX=""
REGION="eastus"
ENVIRONMENT="dev"
INCLUDE_PHASE0=false
SKIP_CONFIRM=false

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
        --yes|-y)
            SKIP_CONFIRM=true
            shift
            ;;
        -h|--help)
            cat << EOF
Usage: $0 [OPTIONS]

Destroys Azure Landing Zone resources in reverse order.

Phases (destroyed in reverse order):
  workloads  - Phase 3: Application Services
  platform   - Phase 2: Platform Services and Add-ons
  bootstrap  - Phase 1: Management Groups and Policies
  phase0     - State Backend (requires --include-phase0 flag)
  all        - All phases 3-1 (Phase 0 requires --include-phase0)

Options:
  --phase PHASE      Destroy specific phase (default: all)
  --include-phase0   Include Phase 0 in 'all' destruction (DANGER!)
  --stack SUFFIX     Stack name suffix (default: <env>-<region>)
  --region REGION    Azure region (default: eastus)
  --env ENV          Environment name (default: dev)
  --yes, -y          Skip confirmation prompts (USE WITH CAUTION!)
  -h, --help         Show this help message

WARNING: This will PERMANENTLY DELETE Azure resources!

Examples:
  # Destroy all phases except Phase 0
  $0

  # Destroy only workloads
  $0 --phase workloads

  # Destroy everything including state backend
  $0 --include-phase0

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
echo "  Azure Landing Zone DESTRUCTION"
echo "============================================"
echo ""
log_warn "THIS WILL PERMANENTLY DELETE AZURE RESOURCES!"
echo ""
log_info "Phase: $PHASE"
log_info "Stack: $STACK_SUFFIX"
log_info "Include Phase 0: $INCLUDE_PHASE0"
echo ""

# Switch to Azure Blob state
switch_to_azure_state() {
    local storage_account=""
    local container_name=""
    local storage_key=""

    if [[ -f "$AZURE_STATE_FILE" ]]; then
        source "$AZURE_STATE_FILE"
        storage_account="${AZURE_STORAGE_ACCOUNT:-}"
        container_name="${AZURE_STORAGE_CONTAINER:-}"
        storage_key="${AZURE_STORAGE_KEY:-}"
    fi

    if [[ -z "$storage_account" ]] && [[ -f "$STATE_INFO_FILE" ]]; then
        source "$STATE_INFO_FILE"
        storage_account="${STORAGE_ACCOUNT:-}"
        container_name="${CONTAINER_NAME:-}"
    fi

    if [[ -z "$storage_account" ]]; then
        log_error "Could not find state backend information"
        exit 1
    fi

    if [[ -z "$storage_key" ]]; then
        storage_key=$(az storage account keys list \
            --account-name "$storage_account" \
            --query '[0].value' -o tsv 2>/dev/null || echo "")
    fi

    if [[ -n "$storage_key" ]]; then
        export AZURE_STORAGE_KEY="$storage_key"
        pulumi logout --all 2>/dev/null || true
        pulumi login "azblob://${container_name}" --cloud-url "azblob://${container_name}?storage_account=${storage_account}" 2>/dev/null || true
    fi
}

# Switch to local state
switch_to_local_state() {
    pulumi logout --all 2>/dev/null || true
    pulumi login "file://$LOCAL_STATE_DIR"
}

# Destroy a stack
destroy_stack() {
    local stack_path="$1"
    local stack_name="$2"

    log_info "Destroying: $stack_path (stack: $stack_name)"

    cd "$PROJECT_ROOT/$stack_path"

    # Check if stack exists
    if ! pulumi stack ls 2>/dev/null | grep -q "^$stack_name"; then
        log_warn "Stack not found: $stack_name, skipping"
        cd "$PROJECT_ROOT"
        return 0
    fi

    pulumi stack select "$stack_name"

    if [[ "$SKIP_CONFIRM" == "true" ]]; then
        pulumi destroy --yes
    else
        pulumi destroy
    fi

    # Remove stack after destroy
    if confirm "Remove stack '$stack_name' from state?"; then
        pulumi stack rm "$stack_name" --yes
    fi

    cd "$PROJECT_ROOT"
    log_success "Destroyed: $stack_path"
    echo ""
}

# Destroy Phase 3: Workloads
destroy_workloads() {
    log_info "========== DESTROYING PHASE 3: WORKLOADS =========="

    switch_to_azure_state

    if [[ -d "$PROJECT_ROOT/stacks/04-application-services" ]]; then
        destroy_stack "stacks/04-application-services" "$STACK_SUFFIX"
    fi
}

# Destroy Phase 2: Platform
destroy_platform() {
    log_info "========== DESTROYING PHASE 2: PLATFORM =========="

    switch_to_azure_state

    # Services Add-ons first
    if [[ -d "$PROJECT_ROOT/stacks/03-services-addons" ]]; then
        destroy_stack "stacks/03-services-addons" "$STACK_SUFFIX"
    fi

    # Platform Services
    if [[ -d "$PROJECT_ROOT/stacks/02-platform-services" ]]; then
        destroy_stack "stacks/02-platform-services" "$STACK_SUFFIX"
    fi
}

# Destroy Phase 1: Bootstrap
destroy_bootstrap() {
    log_info "========== DESTROYING PHASE 1: BOOTSTRAP =========="

    switch_to_azure_state

    # Policies first
    if [[ -d "$PROJECT_ROOT/stacks/01-bootstrap/policies" ]]; then
        destroy_stack "stacks/01-bootstrap/policies" "bootstrap-policies"
    fi

    # Management Groups
    if [[ -d "$PROJECT_ROOT/stacks/01-bootstrap/management-groups" ]]; then
        destroy_stack "stacks/01-bootstrap/management-groups" "bootstrap"
    fi
}

# Destroy Phase 0: State Backend
destroy_phase0() {
    log_info "========== DESTROYING PHASE 0: STATE BACKEND =========="

    echo ""
    log_warn "WARNING: This will destroy the Pulumi state backend!"
    log_warn "After this, you will lose access to state for all stacks."
    echo ""

    if [[ "$SKIP_CONFIRM" != "true" ]]; then
        if ! confirm "Are you ABSOLUTELY SURE you want to destroy Phase 0?"; then
            log_info "Phase 0 destruction cancelled"
            return
        fi
    fi

    switch_to_local_state

    if [[ -d "$PROJECT_ROOT/stacks/00-state-backend" ]]; then
        destroy_stack "stacks/00-state-backend" "$STACK_SUFFIX"
    fi

    # Clean up state files
    if [[ -f "$STATE_INFO_FILE" ]]; then
        rm -f "$STATE_INFO_FILE"
        log_info "Removed: $STATE_INFO_FILE"
    fi

    if [[ -f "$AZURE_STATE_FILE" ]]; then
        rm -f "$AZURE_STATE_FILE"
        log_info "Removed: $AZURE_STATE_FILE"
    fi

    echo ""
    log_warn "Phase 0 destroyed. Local state remains at: $LOCAL_STATE_DIR"
    log_info "You may want to clean up: rm -rf $LOCAL_STATE_DIR"
}

# Main
main() {
    # Check Azure login
    if ! az account show &>/dev/null; then
        log_error "Not logged in to Azure. Run: ./scripts/00-prerequisites/azure-login.sh"
        exit 1
    fi

    if [[ "$SKIP_CONFIRM" != "true" ]]; then
        echo ""
        log_error "THIS WILL PERMANENTLY DELETE AZURE RESOURCES!"
        echo ""
        if ! confirm "Are you sure you want to proceed?"; then
            log_info "Destruction cancelled"
            exit 0
        fi
    fi

    echo ""

    case "$PHASE" in
        workloads)
            destroy_workloads
            ;;
        platform)
            destroy_platform
            ;;
        bootstrap)
            destroy_bootstrap
            ;;
        phase0)
            destroy_phase0
            ;;
        all)
            destroy_workloads
            destroy_platform
            destroy_bootstrap
            if [[ "$INCLUDE_PHASE0" == "true" ]]; then
                destroy_phase0
            else
                echo ""
                log_info "Phase 0 (state backend) was NOT destroyed."
                log_info "To destroy it: $0 --phase phase0"
            fi
            ;;
        *)
            log_error "Unknown phase: $PHASE"
            exit 1
            ;;
    esac

    echo "============================================"
    log_success "Destruction complete!"
    echo "============================================"
}

main "$@"
