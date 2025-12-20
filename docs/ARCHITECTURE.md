# Cloud-Native Enterprise Platform - Architecture

This is a **multi-tenant, multi-region, zero-trust cloud infrastructure** using **Pulumi TypeScript**.

## Overview

The platform is organized into **3 deployment layers** with strict separation of concerns:

### 1. **Platform Layer** (`stacks/platform-services`)
Shared infrastructure deployed once per environment-region combination.

**Resources:**
- Virtual Network (VNet) with zero-trust network segmentation
- AKS cluster with workload identity (OIDC-based authentication)
- SQL Server with automatic failover groups (DR support)
- Key Vault for secrets management
- Log Analytics workspace for monitoring
- Azure Firewall for centralized security

**Stack naming:** `platform-{environment}-{location}`
- `platform-prod-eastus` (primary)
- `platform-prod-westus` (DR region)
- `platform-staging-eastus`
- `platform-dev-eastus`

**No tenant context** - fully shared.

---

### 2. **Services Layer** (`stacks/services-addons`)
Kubernetes cluster add-ons deployed on Platform layer AKS.

**Resources:**
- **Grafana** - Monitoring and visualization
- **Kyverno** - Kubernetes policy engine (security policies)
- **OpenSearch** - Centralized logging
- **Uptime Kuma** - Service health monitoring

**Stack naming:** `services-{environment}-{location}`
- `services-prod-eastus`
- `services-prod-westus`
- `services-staging-eastus`
- `services-dev-eastus`

**No tenant context** - cluster-wide add-ons.

---

### 3. **Application Layer** (`stacks/application-services`)
Tenant-specific resources deployed per tenant.

**Resources per tenant:**
- Tenant-specific database (isolated or shared with RLS)
- Tenant-specific Key Vault
- Managed identity for workload identity
- Kubernetes namespace with RBAC
- Private endpoints for zero-trust networking

**Stack naming:** `app-{tenantId}-{environment}-{location}`
- `app-acme-prod-eastus` (ACME Corporation, production)
- `app-bigcorp-staging-eastus` (BigCorp, staging)
- `app-startup-dev-eastus` (Startup, development)

**Has tenant context** - each stack is tenant-specific.

---

## Directory Structure

```
cloud-native-enterprise-platform/
├── packages/
│   ├── core/                      # Shared library (not a Pulumi stack)
│   │   ├── lib/
│   │   │   ├── naming.ts          # Resource naming (enforces 24-char limits)
│   │   │   ├── tagging.ts         # Tag governance (TenantID, Environment, CostCenter)
│   │   │   ├── interfaces.ts      # DTOs for inter-stack communication
│   │   │   └── index.ts           # Re-exports
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── shared-config/             # Config schemas (future)
│
├── stacks/
│   ├── platform-services/         # Layer 1: Shared infrastructure
│   │   ├── Pulumi.yaml
│   │   ├── Pulumi.prod-eastus.yaml
│   │   ├── Pulumi.prod-westus.yaml
│   │   ├── Pulumi.staging-eastus.yaml
│   │   ├── Pulumi.dev-eastus.yaml
│   │   ├── index.ts               # Entry point
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── services-addons/           # Layer 2: Kubernetes add-ons
│   │   ├── Pulumi.yaml
│   │   ├── Pulumi.prod-eastus.yaml
│   │   ├── Pulumi.prod-westus.yaml
│   │   ├── Pulumi.staging-eastus.yaml
│   │   ├── Pulumi.dev-eastus.yaml
│   │   ├── index.ts               # Entry point
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── application-services/      # Layer 3: Tenant-specific resources
│       ├── Pulumi.yaml
│       ├── Pulumi.acme-prod-eastus.yaml
│       ├── index.ts               # Entry point
│       ├── package.json
│       └── tsconfig.json
│
├── automation/                    # Deployment orchestration (NOT a Pulumi stack)
│   ├── deploy.ts                 # Single command to deploy all 3 layers
│   ├── provision-tenant.ts       # Onboard new tenant
│   ├── package.json
│   └── tsconfig.json
│
├── config/                        # Static governance configs
│   ├── naming-limits.json         # Resource name constraints per Azure type
│   ├── sku-definitions.json       # Environment-specific SKUs
│   └── policy-definitions.json
│
├── docs/                          # Documentation
│   ├── ARCHITECTURE.md            # This file
│   ├── NAMING_CONVENTIONS.md      # Resource naming rules
│   ├── TAG_GOVERNANCE.md          # Tag enforcement
│   ├── MULTI_TENANCY.md           # Tenant isolation patterns
│   ├── DISASTER_RECOVERY.md       # DR architecture
│   └── DEPLOYMENT_GUIDE.md        # How to deploy
│
├── pnpm-workspace.yaml            # Monorepo configuration
├── package.json                   # Root dependencies
└── tsconfig.json                  # Shared TypeScript config
```

---

## Deployment Flow

### Single Command Deployment

```bash
# Install dependencies
pnpm install -r

# Deploy entire platform
DEPLOYMENT_ENV=prod \
DEPLOYMENT_LOCATION=eastus \
TENANT_ID=acme \
ts-node automation/deploy.ts
```

### What Happens:

1. **Platform Layer Deployed**
   - Creates VNet, AKS, SQL Server, Key Vault, monitoring
   - Exports: `vnetId`, `aksClusterId`, `dbServerName`, etc.
   - Outputs passed to Services layer via config

2. **Services Layer Deployed**
   - Uses Platform outputs (VNet ID, AKS cluster ID)
   - Deploys Grafana, Kyverno, OpenSearch on AKS
   - Outputs passed to Application layer

3. **Application Layer Deployed**
   - Uses Platform & Services outputs
   - Creates tenant-specific database, Key Vault, managed identity
   - Enables workload identity pod-to-Azure authentication

---

## Resource Naming Conventions

### Platform Layer (No Tenant)
Pattern: `{type}-platform-{environment}-{location}`

Examples:
- `kv-platform-prod-eastus` - Key Vault (24 chars max) ✅
- `st-platform-prod-eastus` - Storage Account (24 chars max, no hyphens)
- `aksc-prod-eastus` - AKS Cluster
- `vnet-platform-prod-eastus` - Virtual Network

### Services Layer (No Tenant)
Pattern: `{type}-svc-{environment}-{location}`

Examples:
- `grafana-svc-prod-eastus` - Grafana namespace/service

### Application Layer (With Tenant)
Pattern: `{type}-{tenantId}-{environment}-{location}`

Examples:
- `kv-acme-prod-eastus` - ACME's Key Vault (19 chars - fits 24-char limit) ✅
- `db-acme-prod-eastus` - ACME's database
- `st-acme-prod-eastus` - ACME's storage account

**Enforcement:** [packages/core/lib/naming.ts](../packages/core/lib/naming.ts)

---

## Tag Governance

All resources tagged with multi-tenant, cost management, and governance tags:

### Required Tags (Enforced)
- `environment` - prod, staging, dev
- `location` - eastus, westus
- `tenantId` - unique tenant identifier (or "shared" for platform/services)
- `costCenter` - for cost tracking
- `department` - infrastructure, tenant-services
- `managedBy` - always "pulumi" for audit trail
- `createdDate` - ISO 8601 date

### Optional Tags (Environment-specific)
- `owner` - team email or name
- `criticality` - mission-critical, medium, low
- `dataClassification` - pii, confidential, internal, public

**Enforcement:** [packages/core/lib/tagging.ts](../packages/core/lib/tagging.ts)

---

## Disaster Recovery Architecture

### Database Failover (SQL Server)

**Configuration:** `database:redundancyLevel`

- **High (prod):** Active-Passive with automatic Failover Groups
  - Primary: `eastus`
  - Secondary: `westus` (read-only, auto-failover on 60-min grace period)
  - RPO: ~5 seconds
  - RTO: <1 minute (automatic)

- **Medium (staging):** Active-Passive with manual failover
  - Primary: `eastus`
  - Secondary: `westus` (read-only, manual failover)
  - RPO: ~5 seconds
  - RTO: ~5-10 minutes (manual)

- **Low (dev):** Single region, backups only
  - Primary: `eastus`
  - No secondary
  - RPO: 24 hours (daily backup)
  - RTO: 1-4 hours (restore from backup)

### Storage Failover (Geo-Replication)

- **GZRS** (Geo-Zone-Redundant Storage): 3x replication across regions
- Automatic failover on primary region outage
- Read-only access to secondary region during recovery

### Validation

After deployment, validate failover endpoints:
```bash
# Check SQL Server failover group
az sql failover-group show --resource-group rg-platform-prod-eastus \
  --server-name sql-platform-prod-eastus \
  --name failover-group

# Check storage account secondary endpoint
az storage account show --resource-group rg-platform-prod-eastus \
  --name stplatformproductus \
  --query "secondaryEndpoints"
```

---

## Multi-Tenancy & Isolation

### Tenant Scope

| Layer | Tenant? | Isolation |
|-------|---------|-----------|
| Platform | ❌ NO | Shared: all tenants use same VNet, AKS, SQL Server |
| Services | ❌ NO | Shared: cluster add-ons serve all tenants |
| Application | ✅ YES | Per-tenant: database, KeyVault, namespace, RBAC |

### Database Isolation (Configurable)

**`database:isolation: "isolated"`** (Default)
- Each tenant gets separate SQL database
- Full RBAC and encryption isolation
- Higher cost, maximum security

**`database:isolation: "shared"`**
- All tenants use same database
- Row-Level Security (RLS) + tenant schema isolation
- Tenant column in every table enforces data isolation
- Lower cost, acceptable for non-sensitive workloads

### Kubernetes Isolation

- Each tenant gets dedicated namespace: `{tenantId}`
- Pod-to-pod traffic restricted via network policies
- RBAC roles limit tenant access to own namespace only
- Service accounts bound to tenant-specific managed identities

---

## Zero-Trust Networking

### Principles Implemented

1. **Network Segmentation**
   - Separate subnets for app tier, data tier, system pods
   - Network Security Groups (NSGs) enforce inbound/outbound rules
   - Azure Firewall for centralized threat inspection

2. **Identity & Access**
   - Workload Identity: Pods authenticate as Azure AD service principals
   - No API keys or connection strings in code
   - RBAC roles with least-privilege principle

3. **Private Endpoints**
   - All PaaS services (SQL, Storage, KeyVault) remove public endpoints
   - Private endpoints ensure traffic stays within Azure network
   - DNS resolution via Private DNS Zones

4. **Encryption**
   - In-transit: TLS 1.2+ for all communications
   - At-rest: Service encryption for SQL, Storage, KeyVault
   - Backup encryption: Encrypted at rest and in transit

---

## Workload Identity (Pod-to-Azure Authentication)

### Setup (Platform Layer)

1. AKS cluster OIDC issuer URL: `https://eastus.oic.prod-aks.azure.com/{guid}`
2. Azure AD service principal created for workload identity
3. Federated identity credential links K8s SA to Azure AD app

### Usage (Application Layer)

1. Create Kubernetes service account with annotation:
   ```yaml
   metadata:
     annotations:
       azure.workload.identity/client-id: {client-id}
   ```

2. Pod uses `DefaultAzureCredential()` to authenticate:
   ```csharp
   var credential = new DefaultAzureCredential();
   var client = new SecretClient(keyVaultUri, credential);
   var secret = client.GetSecret("my-secret"); // No secrets in code!
   ```

3. Pod automatically gets Azure token without any secrets.

---

## Configuration Management

### Stack Files Hierarchy

```
Pulumi.yaml (base - rarely changes)
├─ Pulumi.prod-eastus.yaml (environment + region override)
│  ├ infrastructure:environment = prod
│  ├ infrastructure:location = eastus
│  ├ database:redundancyLevel = high
│  └─ database:isolation = shared
│
├─ Pulumi.prod-westus.yaml (DR region - same as eastus)
│
├─ Pulumi.staging-eastus.yaml
│  ├ infrastructure:environment = staging
│  ├ database:redundancyLevel = medium
│  └─ database:isolation = shared
│
└─ Pulumi.dev-eastus.yaml
   ├ infrastructure:environment = dev
   ├ database:redundancyLevel = low
   └─ database:isolation = shared (or isolated per tenant)
```

### Environment Differences

| Config | Dev | Staging | Prod |
|--------|-----|---------|------|
| AKS nodes | 1 | 2 | 3+ |
| VM size | B2s | B2s | B4ms |
| SQL tier | S0 | S1 | S3 |
| DR level | low | medium | high |
| Backups | 7 days | 14 days | 30 days |
| Monitoring | basic | full | full + alerting |

---

## Next Steps

1. **Configure Azure credentials:** `az login`
2. **Create Pulumi organization:** https://app.pulumi.com
3. **Deploy:** See [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md)
4. **Add tenants:** See [MULTI_TENANCY.md](./MULTI_TENANCY.md)
5. **Test DR:** See [DISASTER_RECOVERY.md](./DISASTER_RECOVERY.md)

---

## References

- **Pulumi Docs:** https://www.pulumi.com/docs/
- **Azure Naming Rules:** https://docs.microsoft.com/en-us/azure/azure-resource-manager/management/resource-name-rules
- **Workload Identity:** https://azure.github.io/workload-identity/docs/
- **Zero-Trust:** https://learn.microsoft.com/en-us/security/zero-trust/
