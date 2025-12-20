# State Management Strategy

## Overview

Pulumi stores stack state (resources, outputs, configuration) in a backend. This document defines the state management strategy for the cloud-native enterprise platform.

## Supported State Backends

### 1. **Local State** (Development Only)
- **Location**: `.pulumi/` directory in project root
- **Use Case**: Local development, testing
- **Pros**: No setup needed, works offline
- **Cons**: Not suitable for team collaboration, no history, risky
- **Recommended**: ❌ Not for production

### 2. **Pulumi Cloud** (Free Tier + Paid)
- **Location**: Managed by Pulumi Inc. (https://app.pulumi.com)
- **Use Case**: Team collaboration, production
- **Pros**: 
  - Free tier (unlimited stacks, 1 user)
  - Encrypted at-rest and in-transit
  - Activity history and auditability
  - Easy disaster recovery
- **Cons**: Requires internet, external service
- **Recommended**: ✅ For development/staging (uses free tier)
- **Setup**: `pulumi login` with Pulumi token

### 3. **Azure Blob Storage** (Self-Managed Remote)
- **Location**: Azure Storage Account blob container
- **Use Case**: Production, complete control, compliance
- **Pros**:
  - Fully controlled, no external dependencies
  - Integrates with Azure environment
  - Encryption via Azure encryption
  - Audit via Azure Monitor
  - RBAC via Azure AD
- **Cons**: Requires setup, storage costs
- **Recommended**: ✅ For production
- **Setup**: `pulumi login azurerm://...`

### 4. **AWS S3** (Alternative Self-Managed)
- **Location**: AWS S3 bucket
- **Use Case**: Multi-cloud, compliance
- **Recommended**: ⚠️ Alternative (not primary for Azure-focused)

## Recommended State Strategy

```
┌─────────────────────────────────────────────────┐
│ Environment         │ Backend        │ Access    │
├─────────────────────────────────────────────────┤
│ Local Dev           │ Local State    │ Dev PC    │
│ Shared Dev/CI       │ Pulumi Cloud   │ Team      │
│ Staging             │ Pulumi Cloud   │ Team      │
│ Production          │ Azure Blob     │ Restricted│
│ Production (DR)     │ Azure Blob     │ Restricted│
└─────────────────────────────────────────────────┘
```

## Implementation

### Phase 1: Configuration

Create `pulumi-config.yaml` at root:

```yaml
state:
  backends:
    local:
      enabled: true
      description: "Local development state"
    
    pulumi-cloud:
      enabled: true
      organization: "your-org"
      description: "Pulumi Cloud for team collaboration"
      free-tier: true
    
    azure-blob:
      enabled: true
      resourceGroup: "rg-pulumi-state"
      storageAccount: "stpulumistate"
      container: "pulumi-state"
      description: "Azure Blob Storage for production"
  
  default: "local"  # override per environment
  
  environment-overrides:
    dev:
      backend: "local"
    staging:
      backend: "pulumi-cloud"
    prod:
      backend: "azure-blob"
```

### Phase 2: Azure Blob Storage Setup

Create infrastructure to store state:

```yaml
# stacks/foundation/state-backend/index.ts

Deploys:
  - Resource Group: rg-pulumi-state-{env}
  - Storage Account: stpulumistate{env} (24-char compliant)
    - SKU: Standard_GRS (geo-redundant)
    - Versioning: Enabled (for state history)
    - Soft delete: Enabled (30-day retention)
    - RBAC: Limited access via managed identities
  - Blob Container: pulumi-state
  - Encryption: Azure-managed + CMK option
  - Audit: Azure Monitor logging enabled
```

### Phase 3: Deployment Script Configuration

Update `automation/deploy.ts` to support state backend selection:

```typescript
interface DeploymentConfig {
  environment: "dev" | "staging" | "prod";
  stateBackend: "local" | "pulumi-cloud" | "azure-blob";
  stateConfig: {
    // For azure-blob
    resourceGroup?: string;
    storageAccount?: string;
    container?: string;
    
    // For pulumi-cloud
    org?: string;
    token?: string;
  };
}

// Usage:
// LOCAL: pulumi login file:///$(pwd)/.pulumi
// PULUMI CLOUD: pulumi login
// AZURE: pulumi login azurerm://stpulumistate/pulumi-state
```

### Phase 4: Docker Container State Persistence

For CI/CD (GitHub Actions, Azure Pipelines):

```dockerfile
# Dockerfile
FROM node:18-alpine
RUN mkdir -p /root/.pulumi
VOLUME ["/root/.pulumi"]  # Mount state from host/volume
WORKDIR /app
COPY . .
RUN npm install -r
CMD ["node", "automation/deploy.ts"]
```

### Phase 5: State Backup & Recovery

Automated backup strategy:

```
Azure Blob Storage:
  - Built-in versioning (all stack state versions)
  - Soft delete (recover deleted stacks)
  - Snapshots (point-in-time backups)
  - Redundancy (GRS = geo-redundant)
  
Pulumi Cloud:
  - Automatic backups (managed by Pulumi)
  - Recovery API available
  
Local State:
  - Manual backup to version control (NOT recommended)
```

## Usage

### Initialize State Backend

```bash
# Local (development)
pulumi login file://$(pwd)/.pulumi

# Pulumi Cloud (team)
export PULUMI_ACCESS_TOKEN=your-token
pulumi login

# Azure Blob Storage (production)
pulumi login azurerm://stpulumistate/pulumi-state
# OR via connection string:
export AZURE_STORAGE_KEY=key
pulumi login azurerm://container/path
```

### Select Stack with Specific Backend

```bash
export STATE_BACKEND=azure-blob
export PULUMI_BACKEND_URL=azurerm://stpulumistate/pulumi-state

cd stacks/platform-services
pulumi stack select prod-eastus
pulumi up
```

### Verify State Location

```bash
pulumi whoami           # Show current backend
pulumi stack ls         # List stacks in current backend
pulumi state show       # Show current state backend URL
```

## Security Considerations

### Local State
- ❌ Never commit `.pulumi/` to version control
- ❌ No encryption by default
- ✅ Add to `.gitignore`:
  ```
  .pulumi/
  **/.pulumi/
  ```

### Pulumi Cloud
- ✅ TLS 1.2+ encryption in transit
- ✅ AES-256 encryption at rest
- ✅ Activity audit trail
- ✅ RBAC via organization roles
- ⚠️ External service dependency

### Azure Blob Storage
- ✅ RBAC via Azure AD / Managed Identity
- ✅ Encryption: Service-side (default) + CMK (optional)
- ✅ Audit: Azure Monitor, Activity Log
- ✅ Network: Private Endpoints available
- ✅ Versioning: Point-in-time recovery
- ✅ Soft Delete: 30-day retention

Recommended for production:
```yaml
Azure Blob Storage Configuration:
  - Enable versioning
  - Enable soft delete (30 days)
  - RBAC: Limit to Service Principal with Storage Blob Data Contributor
  - Encryption: CMK (Customer-Managed Key)
  - Network: Private Endpoint from VNet
  - Audit: Enable diagnostics to Log Analytics
  - Backup: Daily backup via Azure Backup
```

## Implementation Roadmap

| Phase | Task | Timeline |
|-------|------|----------|
| 1 | Document state strategies | ✅ Current |
| 2 | Create state-backend stack | Week 1 |
| 3 | Update deploy.ts for backend selection | Week 1 |
| 4 | Add .gitignore rules | Week 1 |
| 5 | Create Dockerfile for CI/CD | Week 2 |
| 6 | Document disaster recovery procedures | Week 2 |
| 7 | Create state migration scripts | Week 3 |
| 8 | Test failover scenarios | Week 3 |

## Command Reference

```bash
# Local state
pulumi login file://$(pwd)/.pulumi
pulumi stack create dev-local

# Switch to Pulumi Cloud
pulumi logout
pulumi login
pulumi stack create dev-cloud

# Switch to Azure Blob
pulumi logout
pulumi login azurerm://stpulumistate/pulumi-state
pulumi stack create prod-blob

# Migrate state (backup old, create new backend)
pulumi stack export > state-backup.json
pulumi login azurerm://...
pulumi stack import < state-backup.json

# View stack outputs
pulumi stack output

# Refresh state from Azure
pulumi refresh

# Destroy stack (removes all resources)
pulumi destroy
```

## Troubleshooting

### State Lock Issues
```bash
# If stack is locked (failed deployment)
pulumi cancel

# Force unlock (use with caution)
pulumi stack cancel --force
```

### State Corruption
```bash
# Restore from backup
pulumi stack import < state-backup.json
```

### Backend Connectivity
```bash
# Test Pulumi Cloud connection
pulumi whoami

# Test Azure Blob connection
az storage blob list --account-name stpulumistate --container-name pulumi-state
```

## References

- [Pulumi State Backends](https://www.pulumi.com/docs/concepts/state/)
- [Azure Blob Storage Backend](https://www.pulumi.com/docs/concepts/state/#azure-blob-storage)
- [State and Secrets](https://www.pulumi.com/docs/concepts/state-and-secrets/)
- [Disaster Recovery](https://www.pulumi.com/docs/concepts/state-and-secrets/#recovering-from-disasters)
