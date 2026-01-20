# Platform Landing Zone

Shared infrastructure that all applications consume.

## Architecture

```mermaid
flowchart TB
    subgraph "Management Subscription"
        LOG[log-platform<br/>Log Analytics]
        APPI[appi-platform<br/>App Insights]
        AA[aa-platform<br/>Automation]
        RSV[rsv-platform<br/>Recovery Vault]
    end

    subgraph "Connectivity Subscription"
        subgraph "Virtual WAN (Default)"
            VWAN[vwan-hub]
            VHUB[vhub-eastus]
            AFW[afw-hub<br/>Azure Firewall]
        end

        subgraph "Private DNS"
            DNS1[privatelink.database.windows.net]
            DNS2[privatelink.vaultcore.azure.net]
            DNS3[privatelink.blob.core.windows.net]
        end
    end

    subgraph "Identity Subscription (Optional)"
        AADDS[Azure AD DS]
    end

    VHUB --> AFW
    VHUB --> DNS1 & DNS2 & DNS3

    LOG -.->|Diagnostics| VWAN
    LOG -.->|Diagnostics| AFW
```

## Management Subscription

**Purpose**: Centralized monitoring and management.

### Resources Created

| Resource | Abbreviation | Purpose |
|----------|--------------|---------|
| Log Analytics Workspace | `log` | Central log aggregation |
| Application Insights | `appi` | Application performance monitoring |
| Automation Account | `aa` | Runbooks, DSC, Update Management |
| Recovery Services Vault | `rsv` | Backup and disaster recovery |
| Action Group | `ag` | Alert notifications |

### Naming Examples
```
log-platform-prod-eastus
appi-platform-prod-eastus
aa-platform-prod-eastus
rsv-platform-prod-eastus
```

## Connectivity Subscription

**Purpose**: Network hub connecting all spokes.

### Virtual WAN Architecture (Default)

```mermaid
flowchart TB
    VWAN[vwan-hub<br/>Virtual WAN]
    VHUB[vhub-eastus<br/>Virtual Hub]
    AFW[afw-hub<br/>Secured Hub]

    VWAN --> VHUB --> AFW

    AFW --> SPOKE1[Spoke 1<br/>vnet-app1]
    AFW --> SPOKE2[Spoke 2<br/>vnet-app2]
    AFW --> ONPREM[On-Premises<br/>VPN/ER]
```

### Hub-Spoke Architecture (Alternative)

```mermaid
flowchart TB
    HUB[vnet-hub<br/>Hub VNet]

    subgraph "Hub Resources"
        AFW[afw-hub]
        VPNG[vpng-hub]
        BAS[bas-hub]
    end

    HUB --> AFW & VPNG & BAS

    HUB -.->|Peering| SPOKE1[vnet-app1]
    HUB -.->|Peering| SPOKE2[vnet-app2]
    VPNG -.->|VPN| ONPREM[On-Premises]
```

### Resources Created

| Resource | Abbreviation | Purpose |
|----------|--------------|---------|
| Virtual WAN | `vwan` | Parent container |
| Virtual Hub | `vhub` | Regional routing hub |
| Azure Firewall | `afw` | Traffic inspection |
| VPN Gateway | `vpng` | Site-to-site VPN |
| ExpressRoute Gateway | `ergw` | Private WAN |
| Private DNS Zone | - | Private endpoint DNS |

### Naming Examples
```
vwan-hub-prod
vhub-prod-eastus
afw-hub-prod-eastus
vpng-hub-prod-eastus
```

## Disaster Recovery

### Database Failover (SQL Server)

```mermaid
flowchart LR
    subgraph "East US (Primary)"
        SQL1[sql-platform-prod-eastus]
        DB1[(sqldb-platform)]
    end

    subgraph "West US (Secondary)"
        SQL2[sql-platform-prod-westus]
        DB2[(sqldb-platform<br/>Read Replica)]
    end

    SQL1 -->|Failover Group<br/>Auto-failover| SQL2
```

| Level | Configuration | RPO | RTO |
|-------|---------------|-----|-----|
| High (prod) | Active-Passive + Auto-failover | ~5 sec | <1 min |
| Medium (staging) | Active-Passive + Manual | ~5 sec | ~5-10 min |
| Low (dev) | Single region + Backups | 24 hr | 1-4 hr |

## Configuration

```yaml
platform:
  management:
    logRetentionDays: 30
    enableDefender: true

  connectivity:
    architecture: vwan           # vwan | hub-spoke
    firewall:
      enabled: true
      sku: Standard              # Standard | Premium

  identity:
    enabled: false               # Enable identity subscription
```

## Related

- [Connectivity Patterns](./connectivity-patterns.md)
- [Multi-Region Design](./multi-region-design.md)
