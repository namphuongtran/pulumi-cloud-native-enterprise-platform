#!/bin/bash
# Validate landing zone configuration

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/common.sh"

PROJECT_ROOT="$(get_project_root)"
CONFIG_FILE="${1:-$PROJECT_ROOT/config/landing-zone.yaml}"

echo "============================================"
echo "  Configuration Validation"
echo "============================================"
echo ""

ERRORS=0
WARNINGS=0

# Check if config file exists
if [[ ! -f "$CONFIG_FILE" ]]; then
    log_error "Configuration file not found: $CONFIG_FILE"
    exit 1
fi

log_info "Validating: $CONFIG_FILE"
echo ""

# Validate YAML syntax
validate_yaml_syntax() {
    echo "Checking YAML syntax..."
    echo "-----------------------"

    # Try to parse with Python (more common) or yq
    if command_exists python3; then
        if python3 -c "import yaml; yaml.safe_load(open('$CONFIG_FILE'))" 2>/dev/null; then
            log_success "YAML syntax is valid"
        else
            log_error "YAML syntax error"
            ERRORS=$((ERRORS + 1))
        fi
    elif command_exists yq; then
        if yq '.' "$CONFIG_FILE" &>/dev/null; then
            log_success "YAML syntax is valid"
        else
            log_error "YAML syntax error"
            ERRORS=$((ERRORS + 1))
        fi
    else
        log_warn "Cannot validate YAML syntax (install python3 or yq)"
        WARNINGS=$((WARNINGS + 1))
    fi
    echo ""
}

# Validate required fields
validate_required_fields() {
    echo "Checking required fields..."
    echo "---------------------------"

    # Check billing model
    local billing_model
    billing_model=$(yaml_get "$CONFIG_FILE" "model" || echo "")

    if [[ -z "$billing_model" ]]; then
        log_warn "billing.model not set, defaulting to PAYG"
        WARNINGS=$((WARNINGS + 1))
    else
        if [[ "$billing_model" =~ ^(PAYG|EA|MCA)$ ]]; then
            log_success "billing.model: $billing_model"
        else
            log_error "Invalid billing.model: $billing_model (must be PAYG, EA, or MCA)"
            ERRORS=$((ERRORS + 1))
        fi
    fi

    # For PAYG, check subscription IDs
    if [[ "$billing_model" == "PAYG" ]] || [[ -z "$billing_model" ]]; then
        local mgmt_sub
        mgmt_sub=$(yaml_get "$CONFIG_FILE" "management" || echo "")
        local conn_sub
        conn_sub=$(yaml_get "$CONFIG_FILE" "connectivity" || echo "")

        if [[ -z "$mgmt_sub" ]]; then
            log_error "PAYG requires billing.subscriptions.management"
            ERRORS=$((ERRORS + 1))
        else
            log_success "Management subscription: $mgmt_sub"
        fi

        if [[ -z "$conn_sub" ]]; then
            log_error "PAYG requires billing.subscriptions.connectivity"
            ERRORS=$((ERRORS + 1))
        else
            log_success "Connectivity subscription: $conn_sub"
        fi
    fi

    echo ""
}

# Validate region
validate_region() {
    echo "Checking region configuration..."
    echo "--------------------------------"

    local region_mode
    region_mode=$(yaml_get "$CONFIG_FILE" "mode" || echo "single")

    if [[ "$region_mode" =~ ^(single|multi)$ ]]; then
        log_success "region.mode: $region_mode"
    else
        log_error "Invalid region.mode: $region_mode (must be single or multi)"
        ERRORS=$((ERRORS + 1))
    fi

    local primary_region
    primary_region=$(yaml_get "$CONFIG_FILE" "primary" || echo "")

    if [[ -z "$primary_region" ]]; then
        log_warn "region.primary not set, will use default"
        WARNINGS=$((WARNINGS + 1))
    else
        log_success "region.primary: $primary_region"
    fi

    if [[ "$region_mode" == "multi" ]]; then
        local secondary_region
        secondary_region=$(yaml_get "$CONFIG_FILE" "secondary" || echo "")

        if [[ -z "$secondary_region" ]]; then
            log_error "Multi-region mode requires region.secondary"
            ERRORS=$((ERRORS + 1))
        else
            log_success "region.secondary: $secondary_region"
        fi
    fi

    echo ""
}

# Validate connectivity
validate_connectivity() {
    echo "Checking connectivity configuration..."
    echo "--------------------------------------"

    local architecture
    architecture=$(yaml_get "$CONFIG_FILE" "architecture" || echo "vwan")

    if [[ "$architecture" =~ ^(vwan|hub-spoke)$ ]]; then
        log_success "connectivity.architecture: $architecture"
    else
        log_error "Invalid connectivity.architecture: $architecture (must be vwan or hub-spoke)"
        ERRORS=$((ERRORS + 1))
    fi

    echo ""
}

# Validate workloads
validate_workloads() {
    echo "Checking workload configuration..."
    echo "----------------------------------"

    local compute_type
    compute_type=$(yaml_get "$CONFIG_FILE" "computeType" || echo "aks")

    if [[ "$compute_type" =~ ^(aks|appservice|container-apps)$ ]]; then
        log_success "workloads.defaults.computeType: $compute_type"
    else
        log_warn "Unknown workloads.defaults.computeType: $compute_type"
        WARNINGS=$((WARNINGS + 1))
    fi

    echo ""
}

# Run validations
main() {
    validate_yaml_syntax
    validate_required_fields
    validate_region
    validate_connectivity
    validate_workloads

    # Summary
    echo "============================================"
    echo "  Validation Summary"
    echo "============================================"
    echo ""

    if [[ $ERRORS -gt 0 ]]; then
        log_error "$ERRORS error(s) found"
        echo ""
        echo "Please fix the errors above before deploying."
        exit 1
    elif [[ $WARNINGS -gt 0 ]]; then
        log_warn "$WARNINGS warning(s) found"
        echo ""
        echo "Configuration is valid but has warnings."
        exit 0
    else
        log_success "Configuration is valid!"
        exit 0
    fi
}

main "$@"
