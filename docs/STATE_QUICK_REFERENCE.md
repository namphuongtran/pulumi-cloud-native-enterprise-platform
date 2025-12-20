# State Management Quick Reference

## TL;DR - Quick Setup

### Development (Local State)
```bash
pulumi login file://$(pwd)/.pulumi
cd stacks/platform-services
pulumi stack create dev-local
pulumi up
```

### Team/Staging (Pulumi Cloud - Free)
```bash
pulumi login
cd stacks/platform-services
pulumi stack create staging-cloud
pulumi up
```

### Production (Azure Blob Storage)
```bash
# Step 1: Deploy state backend
cd stacks/foundation-state-backend
pulumi stack create state-backend-prod-eastus
pulumi up

# Step 2: Get storage credentials
STORAGE_KEY=$(az storage account keys list -n stpulumistateprod -g rg-state-backend-prod-eastus --query '[0].value' -o tsv)

# Step 3: Switch to Azure Blob backend
pulumi logout
pulumi login azurerm://stpulumistateprod/pulumi-state-prod

# Step 4: Deploy platform
cd ../platform-services
pulumi stack create prod-eastus
pulumi up
```

## State Locations

| Backend | Location | Use Case |
|---------|----------|----------|
| Local | `.pulumi/` | Solo development |
| Pulumi Cloud | app.pulumi.com | Team collaboration |
| Azure Blob | Storage Account | Production, compliance |

## Verify Current State Backend

```bash
pulumi whoami                    # Show current backend
pulumi stack ls                  # List stacks
az storage blob list \           # Verify Azure Blob state
  --account-name stpulumistateprod \
  --container-name pulumi-state-prod
```

## Environment Variables

```bash
# Development (Local)
# No env vars needed

# Pulumi Cloud
export PULUMI_ACCESS_TOKEN=pul-xxxxx

# Azure Blob Storage
export AZURE_STORAGE_ACCOUNT=stpulumistateprod
export AZURE_STORAGE_KEY=your-storage-key
# OR
export AZURE_STORAGE_CONNECTION_STRING=DefaultEndpointsProtocol=...
```

## Common Commands

```bash
# View state file
pulumi stack export > state-backup.json

# View stack outputs
pulumi stack output

# Refresh state from Azure
pulumi refresh

# Create new stack
pulumi stack create {env}-{location}

# List all stacks
pulumi stack ls

# Show resources
pulumi stack show

# Cancel locked stack
pulumi cancel

# Switch backends
pulumi logout
pulumi login <new-backend>
```

## Disaster Recovery

### Backup State
```bash
pulumi stack export > state-$(date +%Y%m%d).json
```

### Restore State
```bash
pulumi stack import < state-20250101.json
```

### Migrate Backends
```bash
# Export from old backend
pulumi logout
pulumi login <old-backend>
pulumi stack export > backup.json

# Import to new backend
pulumi logout
pulumi login <new-backend>
pulumi stack import < backup.json
```

## Troubleshooting

### "Stack is locked"
```bash
pulumi cancel      # Gracefully unlock
# OR
pulumi cancel --force  # Force unlock (use with caution)
```

### "State corrupted"
```bash
pulumi refresh     # Sync with Azure
```

### "Can't access state"
```bash
# Check credentials
az login
az storage account show -n stpulumistateprod

# Verify permissions
az role assignment list --assignee your@email.com
```

## Security Checklist

- ✅ `.pulumi/` in .gitignore (never commit state!)
- ✅ Use Azure Blob for production (encrypted, versioned)
- ✅ Enable soft-delete on storage account
- ✅ Use RBAC for access control
- ✅ Audit via Azure Monitor
- ✅ Rotate storage keys regularly
- ✅ Use managed identities in CI/CD
- ✅ Enable private endpoints (optional)

## References

- [STATE_MANAGEMENT.md](./STATE_MANAGEMENT.md) - Full documentation
- [Pulumi State Docs](https://www.pulumi.com/docs/concepts/state/)
- [Azure Blob Backend](https://www.pulumi.com/docs/concepts/state/#azure-blob-storage)
