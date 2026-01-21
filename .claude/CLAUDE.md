# Project Instructions

## Overview

This is a **Pulumi Infrastructure-as-Code (IaC)** project for deploying a multi-tenant, multi-region cloud-native platform on Azure, following Microsoft's Cloud Adoption Framework and Azure Landing Zone patterns.

See @README.md for full project documentation.

## Tech Stack

- **Language**: TypeScript (ES2020, strict mode enabled)
- **IaC Tool**: Pulumi with Azure Native provider
- **Package Manager**: pnpm with workspaces
- **Runtime**: Node.js >= 18
- **Cloud Provider**: Azure

## Project Structure

```
├── packages/core/lib/          # Core shared library
│   ├── naming.ts               # Resource naming functions
│   ├── tagging.ts              # Tagging functions
│   ├── interfaces.ts           # Type definitions
│   └── config/                 # Configuration loader & schema
│
├── stacks/                     # Pulumi stacks (deployed in order)
│   ├── 00-state-backend/       # Phase 0: Pulumi state storage (local state)
│   ├── 01-bootstrap/           # Phase 1: Governance
│   │   ├── management-groups/  # Azure management group hierarchy
│   │   └── policies/           # Azure Policy assignments
│   ├── 02-platform-services/   # Phase 2: Shared infrastructure (AKS, VNet, SQL)
│   ├── 03-services-addons/     # Phase 2.5: K8s add-ons (Grafana, Kyverno)
│   └── 04-application-services/# Phase 3: Per-tenant resources
│
├── config/examples/            # Configuration templates
├── scripts/                    # Automation scripts
│   ├── 00-prerequisites/       # Tool checks & Azure login
│   ├── 01-azure-setup/         # Subscription setup
│   ├── 02-state-management/    # Deployment orchestration
│   └── 99-utilities/           # Common utilities
│
└── docs/                       # Architecture & implementation guides
```

## Common Commands

### Package Management
```bash
pnpm install                    # Install all dependencies
pnpm -r build                   # Build all packages
pnpm -r test                    # Run all tests
```

### Deployment (Recommended - Script-Based)
```bash
./scripts/02-state-management/deploy-all.sh --include-phase0  # Deploy everything
./scripts/02-state-management/deploy-phase0.sh                # Deploy Phase 0 only
./scripts/02-state-management/switch-to-azure-state.sh        # Switch to Azure backend
./scripts/02-state-management/destroy-all.sh                  # Destroy all resources
```

### Pulumi Commands (Manual)
```bash
pulumi stack ls                 # List stacks
pulumi preview                  # Preview changes
pulumi up                       # Deploy changes
pulumi stack output             # Get outputs
pulumi destroy                  # Destroy resources
```

### Development
```bash
cd packages/core && pnpm build  # Build core package only
cd stacks/<stack> && pulumi up  # Deploy specific stack
```

## Code Style Conventions

### TypeScript
- Strict mode enabled, ES2020 target
- Use **interfaces** for data shapes (e.g., `PlatformConfig`, `PlatformOutputs`)
- Use **classes** for errors (e.g., `ConfigurationError`, `ValidationError`)
- Path alias: `@enterprise/core` → `packages/core`

### Naming Conventions
| Type | Convention | Example |
|------|------------|---------|
| Files | lowercase-with-hyphens | `landing-zone-concepts.md` |
| Interfaces | PascalCase | `PlatformConfig` |
| Functions | camelCase | `platformResourceName` |
| Constants | UPPER_SNAKE_CASE | `RESOURCE_LIMITS` |

### Azure Resource Naming
- Pattern: `{org}-{project}-{env}-{location}-{type}`
- Validation via `RESOURCE_LIMITS` constant
- Functions in `packages/core/lib/naming.ts`

### Tagging
- Standard tags: `environment`, `location`, `owner`, `department`, `costCenter`
- Use helper functions: `getApplicationTags()`, `getPlatformTags()`, `getServicesTags()`

## Architecture Patterns

### Deployment Order
Stacks must be deployed in phase order due to dependencies:
```
Phase 0 → Phase 1a → Phase 1b → Phase 2 → Phase 2.5 → Phase 3
(State)   (MgmtGrps)  (Policies)  (Platform) (Addons)  (Apps)
```

### State Management
- **Phase 0**: Uses local state (`~/.pulumi-local/`) - bootstrap only
- **Phase 1+**: Uses Azure Blob Storage (created by Phase 0)
- Reason: Can't store Phase 0's state in storage that doesn't exist yet

### ComponentResource Pattern
Use Pulumi's `ComponentResource` for reusable infrastructure modules.

### Configuration-Driven
Configuration loaded from YAML files in `config/`. Schema defined in `packages/core/lib/config/schema.ts`.

## Key Files to Know

| File | Purpose |
|------|---------|
| `packages/core/lib/config/schema.ts` | Configuration schema definitions |
| `packages/core/lib/naming.ts` | Resource naming utilities |
| `packages/core/lib/tagging.ts` | Tag generation utilities |
| `packages/core/lib/interfaces.ts` | Shared TypeScript interfaces |
| `config/examples/*.yaml` | Configuration templates |

## When Working on This Project

1. **Core library source** is in `packages/core/lib/` (not root-level `.js`/`.d.ts` files)
2. **Each stack** has its own `package.json` and `tsconfig.json`
3. **Build order matters**: Build `packages/core` before stacks that depend on it
4. **State switching**: Use scripts to switch between local and Azure blob state
5. **Never edit generated files** in `packages/core/*.js` or `*.d.ts`

## Documentation References

- @docs/user-guide.md - Complete deployment guide
- @docs/architecture/index.md - Landing zone concepts
- @docs/implementation/index.md - Implementation details
- @docs/development/index.md - Developer guide
