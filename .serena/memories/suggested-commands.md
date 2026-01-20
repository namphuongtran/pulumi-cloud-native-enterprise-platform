# Suggested Commands

## Package Management
```bash
pnpm install              # Install all dependencies
pnpm -r build            # Build all packages
pnpm -r test             # Run all tests
```

## Deployment
```bash
pnpm run deploy          # Deploy via automation
pnpm run provision-tenant # Provision a new tenant
```

## Pulumi Commands
```bash
pulumi stack ls          # List stacks
pulumi preview           # Preview changes
pulumi up                # Deploy changes
pulumi stack output      # Get outputs
```

## Development
```bash
cd packages/core && pnpm build    # Build core package
cd stacks/<stack> && pulumi up    # Deploy specific stack
```

## Linting/Formatting
```bash
# TypeScript compilation check
pnpm -r build
```
