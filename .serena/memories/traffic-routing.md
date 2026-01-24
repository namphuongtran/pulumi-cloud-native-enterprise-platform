# Traffic Routing (Blue/Green)

## Two Options Available

### Azure Front Door (Default, Recommended)
- Layer 7 routing
- Built-in WAF
- CDN capabilities
- Faster failover (<1 minute)
- Best for: Most production workloads

### Azure Traffic Manager
- DNS-based routing
- Simpler, lighter weight
- Cross-cloud compatible
- Slower failover (DNS TTL)
- Best for: Simple scenarios, multi-cloud

## Configuration

### Schema Types
```typescript
// packages/core/lib/config/schema.ts
type TrafficRoutingService = "frontdoor" | "trafficmanager";

interface TrafficRoutingConfig {
  enabled: boolean;
  service?: TrafficRoutingService;  // default: "frontdoor"
  frontDoor?: {
    sku: "Standard_AzureFrontDoor" | "Premium_AzureFrontDoor";
    enableWaf?: boolean;
    wafMode?: "Detection" | "Prevention";
  };
  trafficManager?: {
    routingMethod: "Priority" | "Weighted" | "Geographic" | "Performance";
    healthProbePath?: string;
  };
}
```

### YAML Example (Front Door)
```yaml
trafficRouting:
  enabled: true
  service: frontdoor
  frontDoor:
    sku: Standard_AzureFrontDoor
    enableWaf: true
    wafMode: Prevention
```

### YAML Example (Traffic Manager)
```yaml
trafficRouting:
  enabled: true
  service: trafficmanager
  trafficManager:
    routingMethod: Weighted
    healthProbePath: /health
```

## Blue/Green Workflow

1. Deploy to inactive slot (e.g., green)
2. Run smoke tests
3. Switch traffic (update Front Door/TM)
4. Monitor
5. Rollback if needed (instant with Front Door)

## Files

- Example: `config/examples/blue-green-production.yaml`
- Schema: `packages/core/lib/config/schema.ts` (TrafficRoutingConfig)
- Defaults: `DEFAULT_TRAFFIC_ROUTING` constant
