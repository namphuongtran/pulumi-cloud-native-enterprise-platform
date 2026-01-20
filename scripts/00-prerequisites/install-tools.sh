#!/bin/bash
# Install required tools for the landing zone deployment

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../99-utilities/common.sh"

echo "============================================"
echo "  Install Prerequisites"
echo "============================================"
echo ""

# Detect OS
detect_os() {
    case "$(uname -s)" in
        Darwin*)    echo "macos" ;;
        Linux*)     echo "linux" ;;
        MINGW*|MSYS*|CYGWIN*) echo "windows" ;;
        *)          echo "unknown" ;;
    esac
}

OS=$(detect_os)
log_info "Detected OS: $OS"

# Install Azure CLI
install_azure_cli() {
    if command_exists az; then
        log_info "Azure CLI already installed"
        return 0
    fi

    log_info "Installing Azure CLI..."
    case "$OS" in
        macos)
            brew update && brew install azure-cli
            ;;
        linux)
            curl -sL https://aka.ms/InstallAzureCLIDeb | sudo bash
            ;;
        *)
            log_error "Please install Azure CLI manually: https://docs.microsoft.com/cli/azure/install-azure-cli"
            return 1
            ;;
    esac
    log_success "Azure CLI installed"
}

# Install Pulumi CLI
install_pulumi() {
    if command_exists pulumi; then
        log_info "Pulumi already installed"
        return 0
    fi

    log_info "Installing Pulumi CLI..."
    curl -fsSL https://get.pulumi.com | sh

    # Add to PATH for current session
    export PATH="$HOME/.pulumi/bin:$PATH"
    log_success "Pulumi CLI installed"
}

# Install Node.js
install_nodejs() {
    if command_exists node; then
        local version
        version=$(node --version | sed 's/v//' | cut -d. -f1)
        if [[ $version -ge 18 ]]; then
            log_info "Node.js already installed (v$version)"
            return 0
        fi
    fi

    log_info "Installing Node.js..."
    case "$OS" in
        macos)
            brew install node@20
            ;;
        linux)
            curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
            sudo apt-get install -y nodejs
            ;;
        *)
            log_error "Please install Node.js manually: https://nodejs.org/"
            return 1
            ;;
    esac
    log_success "Node.js installed"
}

# Install pnpm
install_pnpm() {
    if command_exists pnpm; then
        log_info "pnpm already installed"
        return 0
    fi

    log_info "Installing pnpm..."
    npm install -g pnpm
    log_success "pnpm installed"
}

# Install jq
install_jq() {
    if command_exists jq; then
        log_info "jq already installed"
        return 0
    fi

    log_info "Installing jq..."
    case "$OS" in
        macos)
            brew install jq
            ;;
        linux)
            sudo apt-get update && sudo apt-get install -y jq
            ;;
        *)
            log_error "Please install jq manually: https://stedolan.github.io/jq/download/"
            return 1
            ;;
    esac
    log_success "jq installed"
}

# Main installation flow
main() {
    echo "This script will install missing prerequisites."
    echo ""

    if ! confirm "Do you want to continue?"; then
        log_info "Installation cancelled"
        exit 0
    fi

    echo ""

    install_azure_cli || true
    install_pulumi || true
    install_nodejs || true
    install_pnpm || true
    install_jq || true

    echo ""
    echo "============================================"
    log_info "Installation complete. Running verification..."
    echo ""

    "$SCRIPT_DIR/check-prerequisites.sh"
}

main "$@"
