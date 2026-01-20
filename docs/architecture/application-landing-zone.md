# Application Landing Zone

Where your workloads run with per-tenant isolation.

## Architecture

```mermaid
flowchart TB
    subgraph "Application Landing Zone"
        subgraph "Network"
            VNET[vnet-app<br/>Spoke VNet]
            SNET_APP[snet-app]
            SNET_DATA[snet-data]
            SNET_PEP[snet-pep]
            NSG[nsg-app]
        end

        subgraph "Compute"
            AKS[aks-app<br/>AKS Cluster]
            NS[Namespace]
        end

        subgraph "Data"
            KV[kv-tenant<br/>Key Vault]
            SQL[sqldb-tenant<br/>Database]
        end

        subgraph "Identity"
            ID[id-tenant<br/>Managed Identity]
        end
    end

    VNET --> SNET_APP & SNET_DATA & SNET_PEP
    NSG --> SNET_APP
    AKS --> NS
    NS --> ID
    ID -.->|Workload Identity| KV
    SQL -.->|Private Endpoint| SNET_PEP
    KV -.->|Private Endpoint| SNET_PEP

    HUB[Hub Network] -.->|Peering| VNET
```

## Tenant Isolation

### Multi-Tenancy Model

```mermaid
flowchart TB
    subgraph "Platform (Shared)"
        AKS[aks-platform]
        SQL[sql-platform]
    end

    subgraph "Tenant: ACME"
        NS_A[namespace: acme]
        KV_A[kv-acme]
        DB_A[sqldb-acme]
        ID_A[id-acme]
    end

    subgraph "Tenant: BigCorp"
        NS_B[namespace: bigcorp]
        KV_B[kv-bigcorp]
        DB_B[sqldb-bigcorp]
        ID_B[id-bigcorp]
    end

    AKS --> NS_A & NS_B
    SQL --> DB_A & DB_B
    NS_A -.-> ID_A -.-> KV_A
    NS_B -.-> ID_B -.-> KV_B
```

| Layer | Tenant Scope | Isolation |
|-------|--------------|-----------|
| Platform | Shared | All tenants use same AKS, SQL Server |
| Services | Shared | Cluster add-ons serve all tenants |
| Application | Per-Tenant | Separate database, Key Vault, namespace |

### Database Isolation Options

| Mode | Description | Use Case |
|------|-------------|----------|
| `isolated` | Separate database per tenant | High security, compliance |
| `shared` | Same database with RLS | Cost optimization |

## Compute Types

### AKS (Default)

```mermaid
flowchart LR
    AKS[aks-app] --> NP_SYS[npsystem<br/>System Pool]
    AKS --> NP_USER[np-workload<br/>User Pool]

    NP_USER --> POD1[Pod 1]
    NP_USER --> POD2[Pod 2]

    POD1 & POD2 -.->|Workload Identity| ID[id-tenant]
    ID -.-> KV[kv-tenant]
```

**Resources Created:**
| Resource | Abbreviation |
|----------|--------------|
| AKS Cluster | `aks` |
| System Node Pool | `npsystem` |
| User Node Pool | `np` |
| Managed Identity | `id` |

### App Service

```mermaid
flowchart LR
    ASP[asp-app<br/>App Service Plan] --> APP[app-tenant<br/>Web App]
    APP --> SLOT[Staging Slot]
    APP -.->|VNet Integration| SNET[snet-app]
    APP -.->|Private Endpoint| PEP[pep-app]
```

**Resources Created:**
| Resource | Abbreviation |
|----------|--------------|
| App Service Plan | `asp` |
| Web App | `app` |
| Function App | `func` |

### Container Apps

```mermaid
flowchart LR
    CAE[cae-app<br/>Environment] --> CA1[ca-api<br/>API App]
    CAE --> CA2[ca-worker<br/>Worker App]
    CA1 & CA2 -.->|Managed Identity| ID[id-tenant]
```

**Resources Created:**
| Resource | Abbreviation |
|----------|--------------|
| Container Apps Environment | `cae` |
| Container App | `ca` |

## Workload Identity

Zero-trust pod-to-Azure authentication without secrets.

```mermaid
sequenceDiagram
    participant Pod
    participant AKS as AKS OIDC
    participant AAD as Azure AD
    participant KV as Key Vault

    Pod->>AKS: Request token (ServiceAccount)
    AKS->>AAD: Federated token exchange
    AAD->>AKS: Azure AD token
    AKS->>Pod: Token
    Pod->>KV: Access secret (with token)
    KV->>Pod: Secret value
```

**Setup:**
1. AKS cluster with OIDC issuer enabled
2. Managed Identity (`id-tenant`)
3. Federated credential linking K8s SA to Azure AD
4. Pod uses `DefaultAzureCredential()` - no secrets in code!

## Naming Examples

```
# Tenant: ACME, Environment: prod, Region: eastus

rg-app-acme-prod-eastus          # Resource Group
vnet-app-acme-prod-eastus        # Virtual Network
snet-app                          # Subnet (app tier)
snet-data                         # Subnet (data tier)
snet-pep                          # Subnet (private endpoints)
nsg-app-acme-prod-eastus         # Network Security Group
aks-acme-prod-eastus             # AKS Cluster
kv-acme-prod-eastus              # Key Vault (24 char max!)
sqldb-acme-prod                   # SQL Database
id-acme-prod-eastus              # Managed Identity
pep-kv-acme                       # Private Endpoint for KV
```

## Configuration

```yaml
workloads:
  applications:
    - name: acme
      tier: corp                     # corp | online | sandbox
      computeType: aks               # aks | appservice | container-apps

      network:
        addressSpace: "10.10.0.0/16"

      aks:
        kubernetesVersion: "1.28"
        enableWorkloadIdentity: true
        enablePrivateCluster: true

      database:
        enabled: true
        type: postgresql
        isolation: isolated          # isolated | shared

      keyVault:
        enabled: true
```

## Related

- [Connectivity Patterns](./connectivity-patterns.md)
- [Workload Deployment Guide](../implementation/workload-deployment.md)
