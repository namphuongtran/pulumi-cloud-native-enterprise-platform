# Project Structure

Detailed breakdown of the codebase organization.

## Directory Layout

```
pulumi-cloud-native-enterprise-platform/
├── packages/                      # Shared libraries
│   └── core/                     # Core library
│       ├── lib/
│       │   ├── config/           # Configuration
│       │   │   ├── loader.ts     # Load & validate
│       │   │   ├── schema.ts     # Type definitions
│       │   │   └── defaults.ts   # Default values
│       │   ├── billing/          # Billing logic
│       │   │   ├── index.ts
│       │   │   ├── payg.ts
│       │   │   ├── ea.ts
│       │   │   └── mca.ts
│       │   ├── networking/       # Network components
│       │   │   ├── index.ts
│       │   │   ├── vwan.ts
│       │   │   └── hub-spoke.ts
│       │   ├── compute/          # Compute components
│       │   │   ├── index.ts
│       │   │   ├── aks.ts
│       │   │   ├── appservice.ts
│       │   │   └── container-apps.ts
│       │   ├── interfaces.ts     # Shared interfaces
│       │   ├── naming.ts         # Naming utilities
│       │   ├── tagging.ts        # Tagging utilities
│       │   └── index.ts          # Re-exports
│       ├── package.json
│       └── tsconfig.json
│
├── stacks/                        # Pulumi stacks
│   ├── 00-state-backend/         # Phase 0: Pulumi state storage
│   │   ├── index.ts
│   │   ├── Pulumi.yaml
│   │   └── package.json
│   ├── 01-bootstrap/             # Phase 1: Governance
│   │   ├── management-groups/    # Management group hierarchy
│   │   └── policies/             # Azure Policy assignments
│   ├── 02-platform-services/     # Phase 2: Shared infrastructure
│   │   ├── index.ts              # VNet, AKS, SQL, KeyVault
│   │   └── Pulumi.yaml
│   ├── 03-services-addons/       # Phase 2.5: K8s add-ons
│   │   ├── index.ts              # Grafana, Kyverno, monitoring
│   │   └── Pulumi.yaml
│   └── 04-application-services/  # Phase 3: Tenant resources
│       ├── index.ts              # Per-tenant KeyVault, DB, identity
│       └── Pulumi.yaml
│
├── scripts/                       # Automation
│   ├── 00-prerequisites/
│   ├── 01-bootstrap/
│   ├── 02-state-management/
│   └── 99-utilities/
│
├── config/                        # Configuration
│   ├── schema.json               # JSON Schema
│   ├── defaults.yaml             # Default values
│   └── examples/
│
├── docs/                          # Documentation
│   ├── index.md
│   ├── architecture/
│   ├── implementation/
│   └── development/
│
├── package.json                   # Root package
├── pnpm-workspace.yaml           # Workspace config
└── tsconfig.json                 # Root TS config
```

## Package: core

The shared library used by all stacks.

### Modules

| Module | Purpose |
|--------|---------|
| `config/` | Configuration loading, validation, types |
| `billing/` | PAYG/EA/MCA subscription handling |
| `networking/` | VNet, VWAN, hub-spoke components |
| `compute/` | AKS, App Service, Container Apps |
| `interfaces.ts` | Shared type definitions |
| `naming.ts` | Resource naming conventions |
| `tagging.ts` | Resource tagging utilities |

### Usage

```typescript
import {
  loadLandingZoneConfig,
  platformResourceName,
  getTags,
  createConnectivity,
  createCompute
} from "@enterprise/core";
```

## Stacks

### Naming Convention

`{phase-number}-{component}` for directories, `{env}-{region}` for stack names.

| Directory | Stack Names | Phase |
|-----------|-------------|-------|
| `00-state-backend` | `dev-eastus`, `prod-eastus` | 0 |
| `01-bootstrap/management-groups` | `bootstrap` | 1 |
| `01-bootstrap/policies` | `bootstrap-policies` | 1 |
| `02-platform-services` | `dev-eastus`, `prod-eastus` | 2 |
| `03-services-addons` | `dev-eastus`, `prod-eastus` | 2.5 |
| `04-application-services` | `acme-prod-eastus` | 3 |

### Dependencies

```
00-state-backend
     │
     ▼
01-bootstrap/management-groups
     │
     ▼
01-bootstrap/policies
     │
     ▼
02-platform-services
     │
     ▼
03-services-addons
     │
     ▼
04-application-services
```

## Code Style

### TypeScript Configuration

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "strict": true,
    "esModuleInterop": true
  }
}
```

### Naming Conventions

| Element | Convention | Example |
|---------|------------|---------|
| Files | lowercase-hyphen | `hub-spoke.ts` |
| Interfaces | PascalCase | `PlatformConfig` |
| Types | PascalCase | `BillingModel` |
| Functions | camelCase | `createConnectivity` |
| Variables | camelCase | `hubVnetId` |
| Constants | UPPER_SNAKE_CASE | `RESOURCE_LIMITS` |
| Classes | PascalCase | `VirtualWanHub` |

### Imports

Order:
1. Node.js built-ins
2. External packages
3. Internal packages (`@enterprise/core`)
4. Relative imports

```typescript
import * as fs from "fs";
import * as pulumi from "@pulumi/pulumi";
import * as azure from "@pulumi/azure-native";
import { platformResourceName } from "@enterprise/core";
import { MyComponent } from "./components";
```

## Configuration Files

### Pulumi.yaml

Each stack has its own:
- `Pulumi.yaml` - Stack definition
- `Pulumi.{stack}.yaml` - Stack-specific config

### landing-zone.yaml

Global configuration in `config/landing-zone.yaml`, loaded by all stacks.

## Scripts

All scripts are bash, executable, with consistent patterns:

```bash
#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Source common functions
source "$SCRIPT_DIR/../99-utilities/common.sh"

# Script logic...
```
