# Cloud-Native Enterprise Platform - Multi-Tenant IaC with Pulumi

A **production-ready, multi-tenant, multi-region, zero-trust cloud infrastructure** using **Pulumi TypeScript**. Deploy a complete enterprise platform with automatic disaster recovery, workload identity, and strict governance.

## 🎯 Features

✅ **Multi-Tenant Architecture**
- Tenant-specific resource isolation (databases, KeyVaults, Kubernetes namespaces)
- Shared infrastructure layer (VNet, AKS, SQL Server)
- Per-tenant cost tracking with Azure tags

✅ **Disaster Recovery Ready**
- Automatic SQL Server failover groups (active-passive)
- Geo-redundant storage with automatic failover
- Multi-region stack support (prod-eastus, prod-westus)

✅ **Zero-Trust Networking**
- Private endpoints for all PaaS services
- Pod-to-Azure workload identity (no secrets in code)
- Network segmentation with NSGs

✅ **Governance & Compliance**
- Strict resource naming (enforces 24-char KeyVault limits)
- Multi-tenant tagging (TenantID, Environment, CostCenter)
- Role-based access control (RBAC) per tenant

✅ **Enterprise Scalability**
- Single command to deploy all 3 layers
- Tenant onboarding via automation API
- Configuration-driven deployment

## 📁 Architecture

### 3-Layer Design

```
LAYER 3: APPLICATION (Tenant-Specific)
  • Tenant databases, KeyVault, managed identity
  • Stack: app-{tenantId}-{environment}-{location}

LAYER 2: SERVICES (Shared Add-ons)
  • Grafana, Kyverno, OpenSearch, Uptime Kuma
  • Stack: services-{environment}-{location}

LAYER 1: PLATFORM (Shared Infrastructure)
  • VNet, AKS, SQL Server, Key Vault, monitoring
  • Stack: platform-{environment}-{location}
```

## 🚀 Quick Start

### 1. Prerequisites

```bash
node --version       # 18+
pnpm --version       # 8+
az --version         # 2.50+
pulumi version       # 3+
```

### 2. Setup

```bash
az login
az account set --subscription "your-subscription-id"
pulumi login
git clone <repo>
cd cloud-native-enterprise-platform
pnpm install -r
```

### 3. Deploy Everything

```bash
export DEPLOYMENT_ENV=prod
export DEPLOYMENT_LOCATION=eastus
export TENANT_ID=acme
export SQL_ADMIN_PASSWORD="SecurePassword@123"

cd automation
pnpm run deploy
```

## 📚 Documentation

| Document | Purpose |
|----------|---------|
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | System design, failover topology, workload identity setup |
| [DEPLOYMENT_GUIDE.md](docs/DEPLOYMENT_GUIDE.md) | Step-by-step deployment instructions, troubleshooting |
| [NAMING_CONVENTIONS.md](docs/NAMING_CONVENTIONS.md) | Resource naming rules, 24-char limits, multi-tenant patterns |
| [STATE_MANAGEMENT.md](docs/STATE_MANAGEMENT.md) | 🆕 State backend options: Local, Pulumi Cloud, Azure Blob |
| [STATE_QUICK_REFERENCE.md](docs/STATE_QUICK_REFERENCE.md) | 🆕 Quick commands for state setup and management |

## 🎯 Core Concepts

### Stack Naming

Each Pulumi stack follows: `{layer}-{tenantId?}-{environment}-{location}`

```
Platform (no tenant):
  platform-prod-eastus
  platform-prod-westus

Services (no tenant):
  services-prod-eastus

Application (per tenant):
  app-acme-prod-eastus      (ACME Corp)
  app-bigcorp-prod-eastus   (Big Corp)
```

### Resource Naming

Resources automatically named following Azure constraints with safe truncation.

### Tag Governance

All resources tagged with environment, location, tenantId, costCenter, department.

## 🔄 Deployment Flow

### All 3 Layers (Automated)

```bash
cd automation
pnpm run deploy
```

**Steps:**
1. Platform layer deploys → exports vnetId, aksClusterId, dbServerName
2. Services layer deploys → uses platform outputs
3. Application layer deploys → uses platform + services outputs

## 🧑‍💼 Multi-Tenancy

### Add New Tenant

```bash
export TENANT_ID=newcorp
export DEPLOYMENT_ENV=prod
export DEPLOYMENT_LOCATION=eastus

cd automation
pnpm run provision-tenant
```

### Tenant Isolation

| Layer | Isolation |
|-------|-----------|
| Platform | ❌ Shared |
| Services | ❌ Shared |
| Application | ✅ Isolated (per-tenant database, KeyVault, namespace) |

## 🛡️ Disaster Recovery

```
Primary:     prod-eastus (active)
             ↓
Secondary:   prod-westus (auto-failover)
```

## 📈 Costs

| Environment | Nodes | DB | Monthly |
|-------------|-------|-----|---------|
| Dev | 1 | S0 | $150-200 |
| Prod (single) | 3 | S3 | $800-1000 |
| Prod (DR 2x) | 6 | S3×2 | $1800-2200 |

## 📝 Project Structure

```
cloud-native-enterprise-platform/
├── packages/core/                 # Shared library
│   ├── lib/naming.ts             # Resource naming
│   ├── lib/tagging.ts            # Tag governance
│   └── lib/interfaces.ts         # DTOs
├── stacks/
│   ├── platform-services/        # Layer 1
│   ├── services-addons/          # Layer 2
│   └── application-services/     # Layer 3
├── automation/
│   ├── deploy.ts                 # Deploy all 3 layers
│   └── provision-tenant.ts       # Onboard tenant
└── docs/
    ├── ARCHITECTURE.md
    ├── DEPLOYMENT_GUIDE.md
    └── NAMING_CONVENTIONS.md
```

## 🔗 References

- **Pulumi:** https://www.pulumi.com/docs/
- **Azure:** https://learn.microsoft.com/en-us/azure/
- **Workload Identity:** https://azure.github.io/workload-identity/

## 💡 Next Steps

1. ✅ Read [DEPLOYMENT_GUIDE.md](docs/DEPLOYMENT_GUIDE.md)
2. ✅ Deploy Platform layer
3. ✅ Deploy Services layer
4. ✅ Deploy Application layer (first tenant)

---

Made with ❤️ using Pulumi Infrastructure as Code