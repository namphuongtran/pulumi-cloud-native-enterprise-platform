#!/bin/bash
# Deploy a single workload/application landing zone

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../99-utilities/common.sh"

PROJECT_ROOT="$(get_project_root)"

# Default values
APP_NAME=""
REGION="eastus"
ENVIRONMENT="dev"
DRY_RUN=false
CREATE_NEW=false

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --app)
            APP_NAME="$2"
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
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --new)
            CREATE_NEW=true
            shift
            ;;
        -h|--help)
            cat << EOF
Usage: $0 --app APP_NAME [OPTIONS]

Deploy a single application landing zone.

Options:
  --app NAME         Application name (required)
  --region REGION    Azure region (default: eastus)
  --env ENV          Environment name (default: dev)
  --dry-run          Preview changes without deploying
  --new              Create new workload from template
  -h, --help         Show this help message

Examples:
  # Deploy existing workload
  $0 --app payment-service --env prod

  # Create and deploy new workload
  $0 --app my-new-app --new --env dev

  # Preview deployment
  $0 --app my-app --dry-run

EOF
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Validate required arguments
if [[ -z "$APP_NAME" ]]; then
    log_error "Application name is required: --app NAME"
    exit 1
fi

STACK_NAME="${ENVIRONMENT}-${REGION}"
WORKLOAD_PATH="$PROJECT_ROOT/stacks/02-workloads/$APP_NAME"

echo "============================================"
echo "  Deploy Workload: $APP_NAME"
echo "============================================"
echo ""
log_info "Stack: $STACK_NAME"
log_info "Region: $REGION"
log_info "Environment: $ENVIRONMENT"
echo ""

# Create new workload from template if requested
create_from_template() {
    local template_path="$PROJECT_ROOT/stacks/02-workloads/_template"

    if [[ ! -d "$template_path" ]]; then
        log_error "Template not found: $template_path"
        exit 1
    fi

    if [[ -d "$WORKLOAD_PATH" ]]; then
        log_error "Workload already exists: $WORKLOAD_PATH"
        exit 1
    fi

    log_info "Creating new workload from template..."
    cp -r "$template_path" "$WORKLOAD_PATH"

    # Update package.json name
    if [[ -f "$WORKLOAD_PATH/package.json" ]]; then
        sed -i.bak "s/\"name\": \".*\"/\"name\": \"$APP_NAME\"/" "$WORKLOAD_PATH/package.json"
        rm -f "$WORKLOAD_PATH/package.json.bak"
    fi

    # Update Pulumi.yaml name
    if [[ -f "$WORKLOAD_PATH/Pulumi.yaml" ]]; then
        sed -i.bak "s/name: .*/name: $APP_NAME/" "$WORKLOAD_PATH/Pulumi.yaml"
        rm -f "$WORKLOAD_PATH/Pulumi.yaml.bak"
    fi

    log_success "Created workload: $WORKLOAD_PATH"
}

# Deploy the workload
deploy_workload() {
    if [[ ! -d "$WORKLOAD_PATH" ]]; then
        log_error "Workload not found: $WORKLOAD_PATH"
        log_info "Use --new to create from template"
        exit 1
    fi

    cd "$WORKLOAD_PATH"

    # Install dependencies
    if [[ -f "package.json" ]]; then
        log_info "Installing dependencies..."
        pnpm install --silent
    fi

    # Initialize stack if needed
    if ! pulumi stack ls 2>/dev/null | grep -q "$STACK_NAME"; then
        log_info "Initializing stack: $STACK_NAME"
        pulumi stack init "$STACK_NAME"
    fi

    pulumi stack select "$STACK_NAME"

    # Set configuration
    pulumi config set appName "$APP_NAME"
    pulumi config set azure-native:location "$REGION"

    # Deploy or preview
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "Running preview..."
        pulumi preview
    else
        log_info "Deploying..."
        pulumi up
    fi

    cd "$PROJECT_ROOT"
}

# Main
main() {
    if [[ "$CREATE_NEW" == "true" ]]; then
        create_from_template
    fi

    deploy_workload

    echo ""
    echo "============================================"
    log_success "Workload deployment complete: $APP_NAME"
    echo "============================================"

    if [[ "$DRY_RUN" != "true" ]]; then
        echo ""
        log_info "View outputs: cd $WORKLOAD_PATH && pulumi stack output"
    fi
}

main "$@"
