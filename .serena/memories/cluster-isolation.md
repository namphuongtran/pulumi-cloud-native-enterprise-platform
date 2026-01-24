# Cluster Isolation Strategies

## Two Modes Available

### 1. Dedicated Clusters (Default)
- Each environment gets its own AKS cluster
- Maximum isolation
- Higher cost
- Best for: Enterprise with strict compliance requirements

### 2. Shared Clusters (Cost-Optimized)
- Namespace-based multi-tenancy
- Two clusters: nonprod + prod
- 60-70% cost savings
- Best for: Startups, SMBs, cost-conscious deployments

## Shared Cluster Architecture

```
AKS-NonProd Cluster         AKS-Prod Cluster
├── namespace: dev          ├── namespace: prod
├── namespace: test         ├── namespace: prod-blue
├── namespace: staging      └── namespace: prod-green
├── namespace: pr-123
└── namespace: pr-456
```

**Why staging in nonprod?**
- Better production isolation
- Prod cluster only handles actual production traffic
- Reduces blast radius of staging issues

## Configuration

### Schema Types
```typescript
// packages/core/lib/config/schema.ts
type ClusterIsolationMode = "dedicated" | "shared";

interface SharedClusterConfig {
  enabled: boolean;
  clusterTier?: "nonprod" | "prod";
}
```

### YAML Example
```yaml
applications:
  - name: my-service
    environment: dev
    clusterIsolation: shared
    sharedCluster:
      enabled: true
      clusterTier: nonprod
```

## Required for Shared Clusters

1. **Network Policies** - Calico for namespace isolation
2. **Resource Quotas** - Per-namespace limits
3. **Pod Security Standards** - Restrict namespace access
4. **Namespace Labels** - For network policy matching

## Files

- Example: `config/examples/shared-cluster-cost-optimized.yaml`
- Schema: `packages/core/lib/config/schema.ts` (SharedClusterConfig)
- Helper: `packages/core/lib/interfaces.ts` (getClusterTier)
