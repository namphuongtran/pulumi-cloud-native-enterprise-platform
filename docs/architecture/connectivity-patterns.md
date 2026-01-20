# Connectivity Patterns

Comparison of Virtual WAN and Hub-Spoke architectures.

## Decision Flowchart

```mermaid
flowchart TB
    START[Start] --> Q1{Multi-region<br/>required?}
    Q1 -->|Yes| VWAN[Virtual WAN]
    Q1 -->|No| Q2{50+ spokes<br/>expected?}
    Q2 -->|Yes| VWAN
    Q2 -->|No| Q3{Complex custom<br/>routing needed?}
    Q3 -->|Yes| HUB[Hub-Spoke]
    Q3 -->|No| Q4{Cost is<br/>primary concern?}
    Q4 -->|Yes| HUB
    Q4 -->|No| VWAN

    VWAN --> DONE1[Use Virtual WAN]
    HUB --> DONE2[Use Hub-Spoke]

    style VWAN fill:#bfb
    style HUB fill:#bbf
```

## Comparison Matrix

| Aspect | Virtual WAN | Hub-Spoke |
|--------|-------------|-----------|
| Complexity | Lower (managed) | Higher (self-managed) |
| Cost | Higher base | Lower base |
| Scale | Better at scale | Manual scaling |
| Routing | Automatic | Manual (UDRs) |
| Multi-region | Built-in | Manual setup |
| Customization | Limited | Full control |

## Virtual WAN (Default)

```mermaid
flowchart TB
    subgraph "Azure Virtual WAN"
        VWAN[vwan-hub]

        subgraph "East US"
            VHUB_E[vhub-eastus]
            AFW_E[afw-eastus]
        end

        subgraph "West US"
            VHUB_W[vhub-westus]
            AFW_W[afw-westus]
        end
    end

    VWAN --> VHUB_E & VHUB_W
    VHUB_E --> AFW_E
    VHUB_W --> AFW_W

    VHUB_E -.->|Auto-routing| VHUB_W

    AFW_E --> S1[vnet-app1]
    AFW_E --> S2[vnet-app2]
    AFW_W --> S3[vnet-app3]

    VHUB_E --> VPN[vpng<br/>On-Premises]
```

### Resources Created

| Resource | Abbreviation | Purpose |
|----------|--------------|---------|
| Virtual WAN | `vwan` | Parent container |
| Virtual Hub | `vhub` | Regional hub |
| Azure Firewall | `afw` | Secured hub |
| VPN Gateway | `vpng` | S2S VPN |
| ExpressRoute Gateway | `ergw` | Private WAN |

### When to Use

- Large enterprise (50+ spokes)
- Multi-region deployment
- Need automatic spoke-to-spoke routing
- Prefer managed service

### Configuration

```yaml
platform:
  connectivity:
    architecture: vwan
    vwan:
      sku: Standard
      allowBranchToBranch: true
    firewall:
      enabled: true
      sku: Standard
```

## Hub-Spoke

```mermaid
flowchart TB
    subgraph "Hub VNet"
        HUB[vnet-hub<br/>10.0.0.0/16]

        subgraph "Hub Subnets"
            SNET_FW[AzureFirewallSubnet<br/>10.0.1.0/26]
            SNET_GW[GatewaySubnet<br/>10.0.2.0/26]
            SNET_BAS[AzureBastionSubnet<br/>10.0.3.0/26]
        end

        AFW[afw-hub]
        VPNG[vpng-hub]
        BAS[bas-hub]
    end

    SNET_FW --> AFW
    SNET_GW --> VPNG
    SNET_BAS --> BAS

    HUB -.->|Peering| S1[vnet-app1<br/>10.1.0.0/16]
    HUB -.->|Peering| S2[vnet-app2<br/>10.2.0.0/16]
    HUB -.->|Peering| S3[vnet-app3<br/>10.3.0.0/16]

    VPNG -.->|VPN| ONPREM[On-Premises]
```

### Resources Created

| Resource | Abbreviation | Purpose |
|----------|--------------|---------|
| Virtual Network | `vnet` | Hub network |
| Subnet | `snet` | Network segment |
| Azure Firewall | `afw` | Traffic inspection |
| VPN Gateway | `vpng` | S2S VPN |
| Azure Bastion | `bas` | Secure RDP/SSH |
| Route Table | `rt` | Custom routing |
| User Defined Route | `udr` | Route entry |

### When to Use

- Smaller deployments (<50 spokes)
- Need full routing control
- Cost-sensitive workloads
- Custom NVA requirements

### Configuration

```yaml
platform:
  connectivity:
    architecture: hub-spoke
    hub:
      addressSpace: "10.0.0.0/16"
      subnets:
        firewall: "10.0.1.0/26"
        gateway: "10.0.2.0/26"
        bastion: "10.0.3.0/26"
    firewall:
      enabled: true
      sku: Standard
```

## Spoke-to-Spoke Traffic

### Virtual WAN
Traffic flows automatically through the secured hub:

```mermaid
flowchart LR
    S1[Spoke 1] --> VHUB[vhub + afw] --> S2[Spoke 2]
```

### Hub-Spoke
Requires UDRs to force traffic through firewall:

```mermaid
flowchart LR
    S1[Spoke 1] -->|UDR| AFW[afw-hub] -->|UDR| S2[Spoke 2]
```

## Firewall SKUs

| SKU | Features | Cost |
|-----|----------|------|
| Standard | Basic filtering, threat intel, FQDN | Lower |
| Premium | TLS inspection, IDPS, URL categories | Higher |

```yaml
platform:
  connectivity:
    firewall:
      enabled: true
      sku: Standard              # Standard | Premium
      threatIntelMode: Alert     # Off | Alert | Deny
      dnsProxy: true
```

## Migration Path

Can migrate from Hub-Spoke to Virtual WAN later:

```mermaid
flowchart LR
    subgraph "Phase 1"
        HUB[Existing Hub-Spoke]
    end

    subgraph "Phase 2"
        HUB2[Hub-Spoke]
        VWAN[New Virtual WAN]
    end

    subgraph "Phase 3"
        VWAN2[Virtual WAN<br/>All Spokes Migrated]
    end

    HUB --> HUB2 & VWAN --> VWAN2
```

## Related

- [Multi-Region Design](./multi-region-design.md)
- [Platform Landing Zone](./platform-landing-zone.md)
