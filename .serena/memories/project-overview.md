# Project Overview

## Purpose
Multi-tenant, multi-region cloud-native platform using Pulumi IaC for Azure.
Implements Azure Landing Zone architecture patterns.

## Tech Stack
- **Language**: TypeScript (ES2020, strict mode)
- **IaC**: Pulumi with Azure Native provider
- **Package Manager**: pnpm with workspaces
- **Runtime**: Node.js

## Project Structure
```
├── packages/core/       # Shared library (naming, tagging, interfaces)
├── stacks/             # Pulumi stacks (deployed in order)
│   ├── 00-state-backend/        # Phase 0: Pulumi state storage
│   ├── 01-bootstrap/            # Phase 1: Governance
│   │   ├── management-groups/
│   │   └── policies/
│   ├── 02-platform-services/    # Phase 2: Shared infrastructure
│   ├── 03-services-addons/      # Phase 2.5: K8s add-ons
│   └── 04-application-services/ # Phase 3: Tenant resources
├── scripts/            # Automation scripts
│   ├── 00-prerequisites/        # Tools, Azure login, checks
│   ├── 01-azure-setup/          # Azure-specific setup (subscriptions)
│   ├── 02-state-management/     # Pulumi deployment orchestration
│   └── 99-utilities/            # Common utilities
├── docs/              # Documentation
└── config/            # Configuration files
```

## Deployment Workflows
- **Team workflow**: Use `./scripts/02-state-management/deploy-all.sh` (handles state switching automatically)
- **Manual workflow**: Run Pulumi commands directly (for learning/debugging)

## Key Patterns
- Path aliases: `@enterprise/core` → `packages/core`
- ComponentResource pattern for reusable infrastructure
- Configuration-driven architecture (billing, region, connectivity)
