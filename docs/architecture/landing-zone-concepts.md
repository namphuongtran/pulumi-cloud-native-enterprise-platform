# Landing Zone Concepts

## What is an Azure Landing Zone?

An Azure Landing Zone is a pre-configured, secure, scalable environment that follows Microsoft's best practices.

```mermaid
flowchart TB
    subgraph "Azure Landing Zone"
        direction TB
        GOV[Governance<br/>Policies, RBAC, Tags]
        NET[Networking<br/>Hub-Spoke, Firewall, DNS]
        SEC[Security<br/>Zero-Trust, Encryption]
        MON[Monitoring<br/>Log Analytics, Alerts]
        COST[Cost Management<br/>Budgets, Tags]
    end

    GOV --> NET --> SEC --> MON --> COST
```

## Why Use Landing Zones?

| Benefit | Description |
|---------|-------------|
| Governance | Consistent policies across all workloads |
| Security | Security baseline applied from day one |
| Scalability | Designed to grow with your organization |
| Compliance | Built-in compliance controls |
| Cost Management | Clear cost boundaries via subscriptions |

## Core Components

### Management Groups Hierarchy

```mermaid
flowchart TB
    ROOT[Tenant Root Group]
    ROOT --> ALZ[Azure Landing Zones<br/>mg-alz]

    ALZ --> PLAT[Platform<br/>mg-platform]
    ALZ --> LZ[Landing Zones<br/>mg-landingzones]
    ALZ --> SB[Sandbox<br/>mg-sandbox]
    ALZ --> DECOM[Decommissioned<br/>mg-decommissioned]

    PLAT --> MGMT[Management<br/>mg-management]
    PLAT --> CONN[Connectivity<br/>mg-connectivity]
    PLAT --> ID[Identity<br/>mg-identity]

    LZ --> CORP[Corp<br/>mg-corp]
    LZ --> ONLINE[Online<br/>mg-online]

    style ROOT fill:#f9f,stroke:#333
    style PLAT fill:#bbf,stroke:#333
    style LZ fill:#bfb,stroke:#333
```

## Two Types of Landing Zones

### Platform Landing Zone
Shared services used by ALL applications.

| Component | Subscription | Resources |
|-----------|--------------|-----------|
| Management | sub-management | log, appi, aa |
| Connectivity | sub-connectivity | vnet/vwan, afw, vpng |
| Identity | sub-identity | Azure AD DS (optional) |

### Application Landing Zone
Where your workloads run.

| Type | Use Case | Example Resources |
|------|----------|-------------------|
| Corp | Internal apps | aks, kv, sqldb, pep |
| Online | Public-facing | app, agw, afd |
| Sandbox | Dev/test | vm, vnet |

## Deployment Order

```mermaid
flowchart TB
    subgraph "Phase 0"
        ST[State Backend<br/>st-state]
    end

    subgraph "Phase 1"
        MG[Management Groups<br/>mg-*]
        POL[Policies]
    end

    subgraph "Phase 2"
        MGMT[Management Sub<br/>log, appi]
        CONN[Connectivity Sub<br/>vwan/vnet, afw]
    end

    subgraph "Phase 3"
        APP[Application Subs<br/>aks, kv, sqldb]
    end

    ST --> MG --> POL --> MGMT --> CONN --> APP
```

**Order matters due to dependencies:**
1. **State Backend** → Store Pulumi state securely
2. **Management Groups** → Empty containers first
3. **Policies** → Governance rules
4. **Management Sub** → Logging (everything logs here)
5. **Connectivity Sub** → Hub network (everything connects here)
6. **Application Subs** → Your applications (as needed)

## Key Principles

1. **Subscription democratization** - Each team/app gets isolated subscription
2. **Policy-driven governance** - Enforce standards via policy, not manual review
3. **Single control plane** - Manage everything through Azure Resource Manager
4. **Application-centric** - Focus on applications, not infrastructure

## Related

- [Platform Landing Zone](./platform-landing-zone.md)
- [Application Landing Zone](./application-landing-zone.md)
