#!/bin/bash
# Get EA enrollment account information for automated subscription creation

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../99-utilities/common.sh"

echo "============================================"
echo "  EA Enrollment Account Discovery"
echo "============================================"
echo ""

# Check if logged in
if ! az account show &>/dev/null; then
    log_error "Please login to Azure first: ./scripts/00-prerequisites/azure-login.sh"
    exit 1
fi

# Try to list enrollment accounts
log_info "Searching for enrollment accounts..."
echo ""

# Method 1: Billing API
log_info "Checking billing enrollment accounts..."
ENROLLMENT_ACCOUNTS=$(az billing enrollment-account list 2>/dev/null || echo "[]")

if [[ "$ENROLLMENT_ACCOUNTS" != "[]" ]] && [[ -n "$ENROLLMENT_ACCOUNTS" ]]; then
    echo ""
    echo "Found enrollment accounts:"
    echo "--------------------------"
    echo "$ENROLLMENT_ACCOUNTS" | jq -r '.[] | "Name: \(.name)\nID: \(.id)\nPrincipal: \(.principalName)\n---"'

    echo ""
    echo "============================================"
    echo "  Configuration"
    echo "============================================"
    echo ""
    echo "Add the following to your configuration file:"
    echo ""

    FIRST_ACCOUNT=$(echo "$ENROLLMENT_ACCOUNTS" | jq -r '.[0].id')
    cat << EOF
platform:
  billing:
    model: EA
    enrollmentAccountId: "$FIRST_ACCOUNT"
EOF

else
    log_warn "No enrollment accounts found via Billing API"
    echo ""
    echo "This could mean:"
    echo "  1. You don't have EA Owner/Contributor access"
    echo "  2. Your enrollment doesn't support programmatic subscription creation"
    echo "  3. You need to use the EA portal to get the enrollment account ID"
    echo ""
    echo "To get your enrollment account ID manually:"
    echo "  1. Go to: https://ea.azure.com"
    echo "  2. Navigate to: Manage > Account"
    echo "  3. Find your account ID"
    echo ""
    echo "Or ask your EA administrator for the enrollment account ID."
fi

# Check for MCA billing accounts as alternative
echo ""
log_info "Checking for MCA billing accounts..."

MCA_ACCOUNTS=$(az billing account list 2>/dev/null || echo "[]")

if [[ "$MCA_ACCOUNTS" != "[]" ]] && [[ -n "$MCA_ACCOUNTS" ]]; then
    echo ""
    echo "Found MCA billing accounts:"
    echo "---------------------------"
    echo "$MCA_ACCOUNTS" | jq -r '.[] | "Name: \(.displayName)\nID: \(.name)\nAgreement: \(.agreementType)\n---"'

    echo ""
    echo "For MCA, you also need billing profile and invoice section."
    echo "Run the following to get more details:"
    echo ""
    FIRST_MCA=$(echo "$MCA_ACCOUNTS" | jq -r '.[0].name')
    echo "  az billing profile list --account-name \"$FIRST_MCA\""
    echo "  az billing invoice section list --account-name \"$FIRST_MCA\" --profile-name <profile>"
fi

echo ""
echo "============================================"
echo "  Next Steps"
echo "============================================"
echo ""
echo "1. Update config/landing-zone.yaml with your billing configuration"
echo "2. For EA: Set billing.model to 'EA' and add enrollmentAccountId"
echo "3. For MCA: Set billing.model to 'MCA' and add billing account details"
echo "4. Run: ./scripts/01-azure-setup/validate-permissions.sh"
echo ""
