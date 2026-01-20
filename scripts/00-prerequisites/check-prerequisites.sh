#!/bin/bash
# Check all prerequisites for the landing zone deployment

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../99-utilities/common.sh"

echo "============================================"
echo "  Azure Landing Zone Prerequisites Check"
echo "============================================"
echo ""

ERRORS=0

# Check Azure CLI
check_azure_cli() {
    echo -n "Checking Azure CLI... "
    if command_exists az; then
        local version
        version=$(az version --query '"azure-cli"' -o tsv 2>/dev/null)
        echo -e "${GREEN}✓${NC} Installed (v${version})"
    else
        echo -e "${RED}✗${NC} Not installed"
        ERRORS=$((ERRORS + 1))
    fi
}

# Check Pulumi CLI
check_pulumi_cli() {
    echo -n "Checking Pulumi CLI... "
    if command_exists pulumi; then
        local version
        version=$(pulumi version 2>/dev/null)
        echo -e "${GREEN}✓${NC} Installed (${version})"
    else
        echo -e "${RED}✗${NC} Not installed"
        ERRORS=$((ERRORS + 1))
    fi
}

# Check Node.js
check_nodejs() {
    echo -n "Checking Node.js... "
    if command_exists node; then
        local version
        version=$(node --version 2>/dev/null)
        local major
        major=$(echo "$version" | sed 's/v//' | cut -d. -f1)
        if [[ $major -ge 18 ]]; then
            echo -e "${GREEN}✓${NC} Installed (${version})"
        else
            echo -e "${YELLOW}⚠${NC} Installed (${version}) - v18+ recommended"
        fi
    else
        echo -e "${RED}✗${NC} Not installed"
        ERRORS=$((ERRORS + 1))
    fi
}

# Check pnpm
check_pnpm() {
    echo -n "Checking pnpm... "
    if command_exists pnpm; then
        local version
        version=$(pnpm --version 2>/dev/null)
        echo -e "${GREEN}✓${NC} Installed (v${version})"
    else
        echo -e "${RED}✗${NC} Not installed"
        ERRORS=$((ERRORS + 1))
    fi
}

# Check jq
check_jq() {
    echo -n "Checking jq... "
    if command_exists jq; then
        local version
        version=$(jq --version 2>/dev/null)
        echo -e "${GREEN}✓${NC} Installed (${version})"
    else
        echo -e "${RED}✗${NC} Not installed"
        ERRORS=$((ERRORS + 1))
    fi
}

# Check git
check_git() {
    echo -n "Checking git... "
    if command_exists git; then
        local version
        version=$(git --version 2>/dev/null | awk '{print $3}')
        echo -e "${GREEN}✓${NC} Installed (v${version})"
    else
        echo -e "${RED}✗${NC} Not installed"
        ERRORS=$((ERRORS + 1))
    fi
}

# Check Azure CLI login status
check_azure_login() {
    echo -n "Checking Azure CLI login... "
    if az account show &>/dev/null; then
        local account
        account=$(az account show --query "name" -o tsv 2>/dev/null)
        echo -e "${GREEN}✓${NC} Logged in (${account})"
    else
        echo -e "${YELLOW}⚠${NC} Not logged in (run: az login)"
    fi
}

# Check Pulumi login status
check_pulumi_login() {
    echo -n "Checking Pulumi login... "
    if pulumi whoami &>/dev/null; then
        local user
        user=$(pulumi whoami 2>/dev/null)
        echo -e "${GREEN}✓${NC} Logged in (${user})"
    else
        echo -e "${YELLOW}⚠${NC} Not logged in (run: pulumi login)"
    fi
}

# Run all checks
echo "Required Tools:"
echo "---------------"
check_azure_cli
check_pulumi_cli
check_nodejs
check_pnpm
check_jq
check_git

echo ""
echo "Authentication Status:"
echo "----------------------"
check_azure_login
check_pulumi_login

echo ""
echo "============================================"

if [[ $ERRORS -gt 0 ]]; then
    echo -e "${RED}Prerequisites check failed with $ERRORS error(s)${NC}"
    echo ""
    echo "Run the following to install missing tools:"
    echo "  ./scripts/00-prerequisites/install-tools.sh"
    exit 1
else
    echo -e "${GREEN}All prerequisites satisfied!${NC}"
    exit 0
fi
