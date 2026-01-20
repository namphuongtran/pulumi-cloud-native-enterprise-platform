# Multi-Region Design

Single vs multi-region deployment patterns.

## Decision Flowchart

```mermaid
flowchart TB
    START[Start] --> Q1{Production<br/>workload?}
    Q1 -->|No| SINGLE[Single Region]
    Q1 -->|Yes| Q2{RPO < 1 hour<br/>required?}
    Q2 -->|Yes| MULTI[Multi-Region]
    Q2 -->|No| Q3{RTO < 4 hours<br/>required?}
    Q3 -->|Yes| MULTI
    Q3 -->|No| Q4{Global users<br/>need low latency?}
    Q4 -->|Yes| MULTI
    Q4 -->|No| SINGLE

    SINGLE --> DONE1[Start Single<br/>Migrate Later]
    MULTI --> DONE2[Deploy Multi-Region]

    style SINGLE fill:#bbf
    style MULTI fill:#bfb
```

## Comparison

| Aspect | Single Region | Multi-Region |
|--------|---------------|--------------|
| Complexity | Lower | Higher |
| Cost | ~1x | ~2x |
| Availability | 99.9-99.99% | 99.99-99.999% |
| DR | Limited | Built-in |
| Latency | Single point | Geo-distributed |

## Single Region (Default)

```mermaid
flowchart TB
    subgraph "East US (Primary)"
        subgraph "Management"
            LOG[log-platform]
            APPI[appi-platform]
        end

        subgraph "Connectivity"
            VWAN[vwan-hub]
            AFW[afw-hub]
        end

        subgraph "Workloads"
            AKS[aks-app]
            SQL[sql-platform]
            KV[kv-tenant]
        end
    end

    LOG -.-> AKS & SQL
    VWAN --> AFW --> AKS
```

### When to Use

- Getting started / MVP
- Cost-sensitive deployments
- No geo-redundancy requirements
- Regional compliance requirements
- Development/staging environments

### Configuration

```yaml
platform:
  region:
    mode: single
    primary: eastus
```

## Multi-Region

```mermaid
flowchart TB
    subgraph "Global"
        AFD[afd-global<br/>Front Door]
    end

    subgraph "East US (Primary)"
        VHUB_E[vhub-eastus]
        AFW_E[afw-eastus]
        AKS_E[aks-prod-eastus]
        SQL_E[sql-platform-eastus<br/>Primary]
    end

    subgraph "West US (Secondary)"
        VHUB_W[vhub-westus]
        AFW_W[afw-westus]
        AKS_W[aks-prod-westus]
        SQL_W[sql-platform-westus<br/>Replica]
    end

    AFD --> AKS_E & AKS_W
    VHUB_E <-.->|Hub-to-Hub| VHUB_W
    SQL_E -->|Failover Group| SQL_W
```

### When to Use

- Production requiring high availability
- Global user base needing low latency
- Business continuity requirements
- Compliance requiring geo-redundancy

### Configuration

```yaml
platform:
  region:
    mode: multi
    primary: eastus
    secondary: westus
```

## Data Replication

### SQL Server Failover Groups

```mermaid
flowchart LR
    subgraph "East US"
        SQL_P[sql-platform-eastus<br/>Primary]
        DB_P[(sqldb-app<br/>Read-Write)]
    end

    subgraph "West US"
        SQL_S[sql-platform-westus<br/>Secondary]
        DB_S[(sqldb-app<br/>Read-Only)]
    end

    SQL_P -->|Async Replication<br/>~5 sec RPO| SQL_S

    APP[Application] -->|Write| SQL_P
    APP -->|Read| SQL_S
```

### Replication Strategies

| Strategy | Description | Use Case |
|----------|-------------|----------|
| Active-Active | Both regions serve traffic | Low latency globally |
| Active-Passive | Secondary is hot standby | Cost optimization |
| Active-Cold | Secondary is minimal | Dev/test |

## Deployment Strategy

### Single Region
```bash
pulumi up --stack prod-eastus
```

### Multi-Region

```mermaid
flowchart LR
    P1[Deploy Primary<br/>prod-eastus] --> P2[Deploy Secondary<br/>prod-westus] --> P3[Deploy Global<br/>prod-global]
```

```bash
# 1. Deploy primary
pulumi up --stack prod-eastus

# 2. Deploy secondary (references primary)
pulumi up --stack prod-westus

# 3. Deploy global services
pulumi up --stack prod-global
```

## Cost Considerations

| Component | Single | Multi (estimate) |
|-----------|--------|------------------|
| Compute | 1x | 2x |
| Networking | 1x | 2x + cross-region |
| Storage | 1x | 2x (or GRS) |
| Database | 1x | 2x (or geo-replica) |
| Monitoring | 1x | 1.5x |

## Disaster Recovery Tiers

| Tier | Configuration | RPO | RTO |
|------|---------------|-----|-----|
| High | Active-Passive + Auto-failover | ~5 sec | <1 min |
| Medium | Active-Passive + Manual | ~5 sec | ~5-10 min |
| Low | Single region + Backups | 24 hr | 1-4 hr |

```yaml
platform:
  region:
    mode: multi
    primary: eastus
    secondary: westus

  database:
    redundancyLevel: high      # high | medium | low
```

## Related

- [Connectivity Patterns](./connectivity-patterns.md)
- [Platform Landing Zone](./platform-landing-zone.md)
