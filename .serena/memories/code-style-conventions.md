# Code Style & Conventions

## TypeScript
- Strict mode enabled
- ES2020 target
- Use interfaces for data shapes
- Use classes for errors (ConfigurationError, ValidationError)

## Naming Conventions
- Files: lowercase with hyphens (e.g., `landing-zone-concepts.md`)
- Interfaces: PascalCase with descriptive suffixes (e.g., `PlatformConfig`, `PlatformOutputs`)
- Functions: camelCase (e.g., `platformResourceName`, `validateTags`)
- Constants: UPPER_SNAKE_CASE (e.g., `RESOURCE_LIMITS`)

## Azure Resource Naming
- Uses RESOURCE_LIMITS constant for validation
- Pattern: `{org}-{project}-{env}-{location}-{type}`
- Functions in `packages/core/lib/naming.ts`

## Documentation
- Use lowercase with hyphens for file names
- Index files link to sub-documents
- Keep documents focused and concise

## Tagging
- Standard tags: environment, location, owner, department, costCenter
- Use `getApplicationTags`, `getPlatformTags`, `getServicesTags`
