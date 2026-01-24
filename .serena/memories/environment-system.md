# Environment System

## Environment Types

```typescript
type BaseEnvironment = "dev" | "test" | "staging" | "prod";
type EphemeralEnvironment = "pr";
type Environment = BaseEnvironment | EphemeralEnvironment;
type DeploymentSlot = "blue" | "green";
```

## Environment Characteristics

| Environment | Criticality | Log Retention | Purge Protection | Cluster Tier |
|-------------|-------------|---------------|------------------|--------------|
| dev | low | 7 days | No | nonprod |
| test | medium | 14 days | No | nonprod |
| staging | medium | 30 days | No | nonprod |
| prod | mission-critical | 365 days | Yes | prod |
| pr-{id} | low | 1 day | No | nonprod |

## Key Helper Functions

```typescript
// packages/core/lib/interfaces.ts

isProductionClass(env) → boolean
// Returns true for "prod" or "prod-*" (blue/green)

getClusterTier(env) → "nonprod" | "prod"
// nonprod: dev, test, staging, pr-*
// prod: prod, prod-blue, prod-green

getEffectiveEnvironmentName(env, ephemeralId?, slot?) → string
// "pr" + "123" → "pr-123"
// "prod" + undefined + "blue" → "prod-blue"

getEnvironmentNamespace(env, ephemeralId?, slot?) → string
// Same as getEffectiveEnvironmentName (for K8s namespaces)
```

## Blue/Green Deployments

For production:
- `environment: prod` + `deploymentSlot: blue` → `prod-blue`
- `environment: prod` + `deploymentSlot: green` → `prod-green`
- Traffic routing via Azure Front Door (default) or Traffic Manager

## PR Preview Environments

For ephemeral environments:
- `environment: pr` + `ephemeralId: "123"` → `pr-123`
- Deployed to nonprod shared cluster
- Auto-cleaned after PR merge
