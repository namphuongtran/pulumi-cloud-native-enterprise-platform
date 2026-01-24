# Suggested Commands

## Quick Reference - Environment Deployment

```bash
# Deploy specific environment
cd stacks/04-application-services
pulumi stack select app-dev-eastus && pulumi up

# Deploy blue/green production
pulumi stack select app-prod-blue-eastus && pulumi up
pulumi stack select app-prod-green-eastus && pulumi up

# Deploy PR preview environment
pulumi stack select app-pr-123-eastus && pulumi up
```

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
