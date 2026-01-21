# Agent Instructions

Guidelines for AI agents making multi-file changes in this repository.

## Before Making Changes

1. **Build first**: Run `pnpm -r build` to ensure TypeScript compiles
2. **Preview stacks**: Run `pulumi preview` in affected stack directories
3. **Check types**: Review `packages/core/interfaces.d.ts` for shared type definitions

## Multi-File Edits

When modifying infrastructure components:

- **Core changes**: If editing `packages/core/`, check which stacks import the changed module
- **Stack changes**: If adding features to a stack, check if the component should live in `packages/core/` for reuse
- **Interface changes**: Update both `.ts` source and regenerate `.d.ts` declarations

## Layer Dependencies

Stacks must be deployed in order—respect these dependencies:

```
00-state-backend     → Deploy first (Pulumi state storage)
       ↓
01-bootstrap         → Management groups, policies
       ↓
02-platform-services → Hub networking, shared services
       ↓
03-services-addons   → Monitoring, security add-ons
       ↓
04-application-services → Workload landing zones
```

Stack references flow downward. A stack can only reference outputs from earlier layers.

## Key Files to Know

| File | Purpose |
|------|---------|
| `packages/core/interfaces.d.ts` | Shared TypeScript interfaces |
| `packages/core/naming.ts` | Azure resource naming utilities |
| `docs/development/naming-conventions.md` | Naming rules documentation |
| `docs/development/project-structure.md` | Codebase organization |
| `config/examples/` | Configuration templates |

## Testing Changes

1. TypeScript: `pnpm -r build` (must pass)
2. Stack preview: `pulumi preview` in affected stack
3. Scripts: Run with `bash -n script.sh` for syntax check
