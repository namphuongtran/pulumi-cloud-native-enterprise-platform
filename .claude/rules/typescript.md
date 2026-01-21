---
paths:
  - "packages/**/*.ts"
  - "stacks/**/*.ts"
---

# TypeScript Conventions

## Imports
- Use `@enterprise/core` for shared utilities (naming, tagging, interfaces, config)
- Pulumi imports: `import * as pulumi from "@pulumi/pulumi"`
- Azure imports: `import * as azure from "@pulumi/azure-native"`

## Naming Functions (from `@enterprise/core`)
- `platformResourceName(type, env, location)` - shared infrastructure (no tenant)
- `serviceResourceName(type, env, location)` - K8s add-ons (no tenant)
- `applicationResourceName(type, tenantId, env, location)` - tenant resources

## Tagging Functions (from `@enterprise/core`)
- `getPlatformTags()` - platform layer resources
- `getServicesTags()` - services layer resources
- `getApplicationTags()` - application layer resources

## Style
- Interfaces for data shapes (PascalCase): `PlatformConfig`, `PlatformOutputs`
- Functions: camelCase
- Constants: UPPER_SNAKE_CASE
- Custom errors: extend Error class (`ConfigurationError`, `ValidationError`)

## Pulumi Stacks
- Export outputs for downstream stack references
- Use `pulumi.getStack()` to derive environment/location from stack name
- Apply tags to all resources using tagging functions
