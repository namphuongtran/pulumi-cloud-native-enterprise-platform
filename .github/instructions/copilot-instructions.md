# Copilot Instructions

## Overview

This is a **Pulumi TypeScript monorepo** for deploying Azure enterprise landing zones. It uses:

- **Runtime**: Node.js ≥18, pnpm workspaces
- **IaC**: Pulumi with `@pulumi/azure-native`, `@pulumi/azuread`, `@pulumi/kubernetes`
- **Language**: TypeScript 5.x with strict mode

## Commands

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm -r build

# Preview/deploy a stack (run from stack directory)
cd stacks/02-platform-services
pulumi preview
pulumi up

# Run shell scripts
./scripts/00-prerequisites/check-prerequisites.sh
```

## Project Layout

| Path | Purpose |
|------|---------|
| `packages/core/` | Shared components, naming utilities, interfaces |
| `stacks/00-state-backend/` | Pulumi state storage (deploy first) |
| `stacks/01-bootstrap/` | Management groups, policies |
| `stacks/02-platform-services/` | Hub networking, shared services |
| `stacks/03-services-addons/` | Platform add-ons (monitoring, security) |
| `stacks/04-application-services/` | Workload landing zones |
| `scripts/` | Automation scripts (bash) |
| `config/examples/` | Landing zone configuration templates |
| `docs/` | Architecture and development guides |

## TypeScript Conventions

### Import Order

1. Node.js built-ins (`import * as fs from "fs"`)
2. External packages (`import * as pulumi from "@pulumi/pulumi"`)
3. Internal packages (`import { generateName } from "@project/core"`)
4. Relative imports (`import { createVnet } from "./networking"`)

### Naming

| Element | Convention | Example |
|---------|------------|---------|
| Files | kebab-case | `hub-spoke.ts` |
| Interfaces | PascalCase | `PlatformConfig` |
| Functions | camelCase | `createConnectivity` |
| Constants | UPPER_SNAKE_CASE | `DEFAULT_LOCATION` |

### Pulumi Patterns

- Use components from `@project/core` when available
- Create Pulumi `ComponentResource` classes for reusable infrastructure
- Export stack outputs for cross-stack references
- Use `pulumi.interpolate` for string interpolation with outputs

## Azure Resource Naming

Use the naming utilities from `@project/core`:

```typescript
import { generateName, generateStorageAccountName } from "@project/core";

// Standard resources: {prefix}-{layer}-{resource}-{env}-{region}-{suffix}
const vnetName = generateName("vnet", args);

// Storage accounts: no hyphens, max 24 chars
const storageName = generateStorageAccountName("diag", args);

// Key Vault: max 24 chars
const kvName = generateName("kv", args);
```

**Constraints**:
- Key Vault: ≤24 characters
- Storage Account: ≤24 characters, no hyphens, lowercase only
- Resource Group: ≤90 characters

## Shell Scripts

```bash
#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../99-utilities/common.sh"

# Use logging functions
log_info "Starting deployment..."
log_success "Deployment complete"
log_error "Failed to deploy"

# Validate prerequisites before operations
check_azure_cli
check_pulumi_cli
```

## YAML Configuration

### Pulumi Stack Config

Stack files follow pattern `Pulumi.{env}-{region}.yaml`:

```yaml
config:
  azure-native:location: eastus
  project:environment: dev
  project:platformConfig:
    connectivity:
      hubVnetAddressSpace: "10.0.0.0/16"
```

### Landing Zone Config

See `config/examples/` for configuration templates. Schema defined in `packages/core/config/`.

## Markdown Documentation

- Use **Mermaid** for architecture diagrams (```mermaid code blocks)
- Use relative links to other docs (`[Guide](../development/index.md)`)
- Follow heading hierarchy: single `#` for title, `##` for sections
- Include code examples with syntax highlighting
