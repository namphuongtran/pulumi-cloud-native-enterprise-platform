# Architecture

Multi-tenant, multi-region, zero-trust cloud infrastructure architecture.

## High-Level Architecture

```mermaid
flowchart TB
    subgraph "Management Groups"
        ROOT[Landing Zone Root<br/>mg-alz]
        ROOT --> PLAT[Platform<br/>mg-platform]
        ROOT --> LZ[Landing Zones<br/>mg-landingzones]
        ROOT --> SB[Sandbox<br/>mg-sandbox]

        PLAT --> MGMT[Management<br/>mg-management]
        PLAT --> CONN[Connectivity<br/>mg-connectivity]
        PLAT --> IDENT[Identity<br/>mg-identity]

        LZ --> CORP[Corp<br/>mg-corp]
        LZ --> ONLINE[Online<br/>mg-online]
    end

    subgraph "Subscriptions"
        MGMT -.-> SUB_MGMT[sub-management]
        CONN -.-> SUB_CONN[sub-connectivity]
        CORP -.-> SUB_APP1[sub-app-1]
        CORP -.-> SUB_APP2[sub-app-2]
    end
```

## Contents

| Document | Description |
|----------|-------------|
| [Landing Zone Concepts](./landing-zone-concepts.md) | What is a landing zone, why use it |
| [Platform Landing Zone](./platform-landing-zone.md) | Shared infrastructure components |
| [Application Landing Zone](./application-landing-zone.md) | Workload-specific environments |
| [Connectivity Patterns](./connectivity-patterns.md) | Virtual WAN vs Hub-Spoke |
| [Multi-Region Design](./multi-region-design.md) | Single vs multi-region deployment |

## Three-Layer Architecture

```mermaid
flowchart TB
    subgraph "Layer 1: Platform Services"
        direction LR
        VNET[vnet-hub]
        AKS[aks-platform]
        SQL[sql-platform]
        KV1[kv-platform]
        LOG[log-platform]
        AFW[afw-hub]
    end

    subgraph "Layer 2: Services Add-ons"
        direction LR
        GRAF[Grafana]
        KYV[Kyverno]
        OSEARCH[OpenSearch]
        UPTIME[Uptime Kuma]
    end

    subgraph "Layer 3: Application Services"
        direction LR
        subgraph "Tenant: ACME"
            KV_A[kv-acme]
            DB_A[sqldb-acme]
            NS_A[ns-acme]
        end
        subgraph "Tenant: BigCorp"
            KV_B[kv-bigcorp]
            DB_B[sqldb-bigcorp]
            NS_B[ns-bigcorp]
        end
    end

    AKS --> GRAF & KYV & OSEARCH & UPTIME
    AKS --> NS_A & NS_B
    SQL --> DB_A & DB_B
```

## Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Connectivity | Virtual WAN (default) | Simpler at scale, automatic routing |
| Compute | AKS (default) | Cloud-native, Kubernetes ecosystem |
| Billing | PAYG (default) | Safest for getting started |
| Region | Single (default) | Simpler initial deployment |
| State Backend | Azure Blob | Full control, compliance ready |

## Security: Zero-Trust Principles

```mermaid
flowchart LR
    subgraph "Zero Trust"
        direction TB
        NS[Network Segmentation<br/>vnet, snet, nsg]
        PE[Private Endpoints<br/>pep-*]
        WI[Workload Identity<br/>id-*]
        KV[Secrets in Key Vault<br/>kv-*]
        FW[Firewall Inspection<br/>afw-*]
    end

    NS --> PE --> WI --> KV --> FW
```

1. **Network Segmentation**: Separate subnets for app, data, system
2. **Private Endpoints**: No public endpoints for PaaS services
3. **Workload Identity**: Pod-to-Azure auth without secrets
4. **Key Vault**: All secrets managed centrally
5. **Firewall**: Centralized traffic inspection
