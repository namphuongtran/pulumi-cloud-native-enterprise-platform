# Deployment Guide

Quick start for deploying the entire cloud-native platform.

## Prerequisites

1. **Azure Account** with subscription
2. **Pulumi Account** (free at https://app.pulumi.com) OR self-managed state
3. **Azure CLI** installed: `az --version`
4. **Node.js 18+**: `node --version`
5. **npm** installed: `npm --version`

## Setup

### 1. Login to Azure
```bash
az login
az account set --subscription "your-subscription-id"
```

### 2. Choose State Backend & Login to Pulumi

**Option A: Pulumi Cloud (Recommended for teams)**
```bash
pulumi login
# Follow prompts to create/use Pulumi token
```

**Option B: Local State (Development only)**
```bash
pulumi login file://$(pwd)/.pulumi
```

**Option C: Azure Blob Storage (Production)**
```bash
# First deploy state backend stack (see below)
# Then login with storage credentials
export AZURE_STORAGE_ACCOUNT=stpulumistateprod
export AZURE_STORAGE_KEY=your-storage-key
pulumi login azurerm://stpulumistateprod/pulumi-state-prod
```

### 3. Install Dependencies
```bash
cd cloud-native-enterprise-platform
npm install
```

## Deployment Order

### Phase 0: Foundation - State Backend (Production Only)

**Deploy FIRST for production environments:**

```bash
cd stacks/foundation-state-backend
pulumi stack create state-backend-prod-eastus
pulumi config set azure:location eastus

# Deploy state infrastructure
pulumi up

# Note the output: stateBackendUrl
# Example: azurerm://stpulumistateprod/pulumi-state-prod

# Switch Pulumi to use this backend for future stacks
pulumi logout
export AZURE_STORAGE_ACCOUNT=stpulumistateprod
export AZURE_STORAGE_KEY=$(az storage account keys list -n stpulumistateprod -g rg-state-backend-prod-eastus --query '[0].value' -o tsv)
pulumi login azurerm://stpulumistateprod/pulumi-state-prod
```

**For development (optional):**
```bash
# Use local state or Pulumi Cloud - no foundation stack needed
pulumi login file://$(pwd)/.pulumi
```

### Phase 1: Platform Services Layer
1. Platform layer deploys (VNet, AKS, SQL Server, Key Vault)
2. Services layer deploys (Grafana, Kyverno, OpenSearch)
3. Application layer deploys (Tenant ACME resources)

---

## Deploy Individual Stacks

### Platform Layer Only

```bash
cd stacks/platform-services

# Select stack
pulumi stack select prod-eastus
pulumi stack select --create prod-eastus  # If first time

# Set config
pulumi config set azure:location eastus
pulumi config set infrastructure:environment prod
pulumi config set sql:adminUsername azureAdmin
pulumi config set sql:adminPassword --secret

# Preview changes
pulumi preview

# Deploy
pulumi up
```

### Services Layer Only

```bash
cd stacks/services-addons

# Select stack
pulumi stack select prod-eastus
pulumi stack select --create prod-eastus

# Set config
pulumi config set infrastructure:environment prod
pulumi config set infrastructure:location eastus

# Deploy
pulumi up
```

### Application Layer (New Tenant)

```bash
cd stacks/application-services

# Select tenant-specific stack
pulumi stack select app-acme-prod-eastus
pulumi stack select --create app-acme-prod-eastus

# Set tenant configuration
pulumi config set infrastructure:tenantId acme
pulumi config set infrastructure:environment prod
pulumi config set infrastructure:location eastus
pulumi config set database:isolation isolated

# Deploy
pulumi up
```

---

## Multi-Environment Deployment

### Production (High Redundancy)

```bash
# Primary region
export DEPLOYMENT_ENV=prod
export DEPLOYMENT_LOCATION=eastus
cd automation && pnpm run deploy

# Failover region (same config, different location)
export DEPLOYMENT_LOCATION=westus
cd automation && pnpm run deploy
```

### Staging (Medium Redundancy)

```bash
export DEPLOYMENT_ENV=staging
export DEPLOYMENT_LOCATION=eastus
cd automation && pnpm run deploy
```

### Development (Low Cost)

```bash
export DEPLOYMENT_ENV=dev
export DEPLOYMENT_LOCATION=eastus
cd automation && pnpm run deploy
```

---

## Tenant Onboarding

### Method 1: Using Automation API (Recommended)

```bash
export TENANT_ID=bigcorp
export TENANT_NAME="Big Corporation"
export DEPLOYMENT_ENV=prod
export DEPLOYMENT_LOCATION=eastus
export TENANT_COST_CENTER=cc-12345
export TENANT_OWNER=platform-team@company.com

cd automation
pnpm run provision-tenant
```

### Method 2: Manual Stack Creation

```bash
cd stacks/application-services

# Create stack
pulumi stack create app-bigcorp-prod-eastus

# Configure
pulumi config set infrastructure:tenantId bigcorp
pulumi config set infrastructure:environment prod
pulumi config set infrastructure:location eastus
pulumi config set database:isolation isolated
pulumi config set keyvault:sku premium

# Deploy
pulumi up
```

---

## Verify Deployment

### Check Resources Created

```bash
# List all Azure resources
az resource list --resource-group rg-platform-prod-eastus --output table

# Check AKS cluster
az aks show --resource-group rg-platform-prod-eastus \
  --name aksc-prod-eastus \
  --query "fqdnName"

# Get kubeconfig
az aks get-credentials --resource-group rg-platform-prod-eastus \
  --name aksc-prod-eastus
kubectl get nodes

# Check database
az sql server show --resource-group rg-platform-prod-eastus \
  --name sql-platform-prod-eastus
```

### Access Services

```bash
# Get Key Vault URI
pulumi stack output keyVaultUri

# Get Grafana (once services deployed)
kubectl get svc -n monitoring grafana

# Get database connection string
az sql server show-connection-string \
  --client sqlcmd \
  --resource-group rg-platform-prod-eastus \
  --name sql-platform-prod-eastus
```

---

## Cleanup

### Remove Single Stack

```bash
cd stacks/platform-services
pulumi stack select prod-eastus
pulumi destroy
```

### Remove All Stacks

```bash
pulumi stack list
# Destroy in reverse order (App → Services → Platform)
pulumi destroy  # app layer
pulumi destroy  # services layer
pulumi destroy  # platform layer
```

---

## Troubleshooting

### Stack won't deploy

**Error: "Operation failed with status 'Conflict'"**
- Resource already exists with different config
- **Solution:** `pulumi refresh` to sync state, then `pulumi up`

### Output not available

**Error: "Upstream config upstream:vnetId not found"**
- Platform layer stack not deployed yet
- **Solution:** Deploy Platform layer first: `pulumi up -s platform-prod-eastus`

### kubeconfig authentication fails

**Error: "Unable to connect to cluster"**
- AKS kubeconfig outdated
- **Solution:** `az aks get-credentials --resource-group ... --name ... --overwrite-existing`

### SQL Admin Password reset

```bash
# Get current password
pulumi config get sql:adminPassword --show-secrets

# Reset
pulumi config set sql:adminPassword --secret
# Enter new password when prompted
pulumi up
```

---

## Cost Estimation

Use Azure pricing calculator:
https://azure.microsoft.com/en-us/pricing/calculator/

Rough estimates (monthly):
- **Dev (1-node AKS):** $150-200
- **Staging (2-node AKS):** $300-400
- **Prod (3-node AKS + SQL S3):** $800-1000

Use `pulumi stack output` to see what's deployed, then check Azure billing.

---

## Next Steps

1. ✅ Deploy Platform layer
2. ✅ Deploy Services layer
3. ✅ Deploy Application layer
4. 📚 Read [ARCHITECTURE.md](./ARCHITECTURE.md) for design details
5. 🔐 Read [DISASTER_RECOVERY.md](./DISASTER_RECOVERY.md) to test failover
6. 👥 Read [MULTI_TENANCY.md](./MULTI_TENANCY.md) to add more tenants
