# Schema vs Implementation Architecture

This project uses a **schema-driven** architecture where configuration defines infrastructure behavior.

## Architecture Layers

```
┌─────────────────────────────────────────────────────────┐
│  Configuration (YAML)                                    │
│  config/examples/*.yaml                                  │
│  - Declares WHAT to deploy                               │
│  - Environment-specific settings                         │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│  Schema (TypeScript Interfaces)                          │
│  packages/core/lib/config/schema.ts                     │
│  - Defines STRUCTURE of configuration                    │
│  - Provides type safety and validation                   │
│  - Includes defaults (DEFAULT_*)                         │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│  Interfaces (TypeScript Types)                           │
│  packages/core/lib/interfaces.ts                        │
│  - Environment types (dev, test, staging, prod, pr)     │
│  - Output DTOs for inter-stack communication            │
│  - Helper functions (isProductionClass, getClusterTier) │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│  Implementation (Pulumi Stacks)                          │
│  stacks/*/index.ts                                       │
│  - Reads configuration                                   │
│  - Uses schema types                                     │
│  - Creates actual Azure resources                        │
└─────────────────────────────────────────────────────────┘
```

## Key Relationships

### Environment System
| Layer | File | Content |
|-------|------|---------|
| Types | `interfaces.ts` | `Environment`, `DeploymentSlot`, `ClusterTier` types |
| Schema | `schema.ts` | `ApplicationConfig.environment`, cost profiles |
| Helper | `interfaces.ts` | `isProductionClass()`, `getClusterTier()` |
| Stack | `**/index.ts` | Uses helpers for production-specific settings |

### Cluster Isolation
| Layer | File | Content |
|-------|------|---------|
| Types | `schema.ts` | `ClusterIsolationMode`, `SharedClusterConfig` |
| Schema | `schema.ts` | `ApplicationConfig.clusterIsolation/sharedCluster` |
| Config | `*.yaml` | `clusterIsolation: shared` |
| Stack | `**/index.ts` | Deploy to shared or dedicated cluster |

### Traffic Routing (Blue/Green)
| Layer | File | Content |
|-------|------|---------|
| Types | `schema.ts` | `TrafficRoutingService`, `TrafficRoutingConfig` |
| Schema | `schema.ts` | `ApplicationConfig.trafficRouting` |
| Config | `*.yaml` | `trafficRouting.enabled: true` |
| Stack | `**/index.ts` | Create Front Door or Traffic Manager |

## When Adding Features

1. **Define Types** in `interfaces.ts` (if needed for cross-stack use)
2. **Add Schema** in `schema.ts` (configuration structure)
3. **Add Defaults** in `schema.ts` (DEFAULT_* constants)
4. **Create Example** in `config/examples/*.yaml`
5. **Implement** in `stacks/*/index.ts`
6. **Document** in `docs/user-guide.md`

## Common Patterns

### Production-Class Detection
```typescript
// In interfaces.ts
export function isProductionClass(env: Environment | string): boolean {
  return env === "prod" || env.startsWith("prod-");
}

// In stacks - use for prod-specific settings
retentionInDays: isProductionClass(environment) ? 30 : 7,
enablePurgeProtection: isProductionClass(environment),
```

### Environment-Aware Settings
```typescript
// In schema.ts - cost profiles per environment
export const ENVIRONMENT_COST_PROFILES: Record<Environment, EnvironmentCostProfile> = {
  dev: { aksNodeCount: 1, ... },
  prod: { aksNodeCount: 3, enableGeoRedundancy: true, ... },
};
```

### Cluster Tier Mapping
```typescript
// In interfaces.ts
export function getClusterTier(env: Environment | string): ClusterTier {
  if (env === "prod" || env.startsWith("prod-")) return "prod";
  return "nonprod"; // dev, test, staging, pr-*
}
```

## Verification Checklist

When modifying environment/configuration behavior:

- [ ] Types updated in `interfaces.ts`?
- [ ] Schema updated in `schema.ts`?
- [ ] Defaults added/updated?
- [ ] Example YAML created/updated?
- [ ] All stacks using consistent helpers?
- [ ] Documentation reflects changes?
- [ ] Tagging functions updated if criticality changes?
