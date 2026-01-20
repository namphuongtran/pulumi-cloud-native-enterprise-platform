# Workload Deployment

Deploy application landing zones for your workloads.

## What Workload Deployment Creates

Per application:
- Subscription (or uses existing)
- Resource Groups
- Spoke Virtual Network (peered to hub)
- Network Security Groups
- Compute resources (AKS/App Service/Container Apps)
- Supporting services (Key Vault, Database, etc.)
- Diagnostic settings

## Prerequisites

- [ ] [Platform Deployment](./platform-deployment.md) completed
- [ ] Hub network deployed
- [ ] Log Analytics workspace available

## Adding a New Workload

### 1. Define in Configuration

```yaml
workloads:
  applications:
    - name: payment-service
      tier: corp                    # corp | online | sandbox
      computeType: aks              # aks | appservice | container-apps
      environment: prod
```

### 2. Create Stack

```bash
cd stacks/02-workloads
cp -r _template payment-service
cd payment-service
```

### 3. Initialize and Configure

```bash
pulumi stack init prod-eastus
pulumi config set appName payment-service
pulumi config set azure-native:location eastus
```

### 4. Deploy

```bash
pulumi up
```

## Configuration Options

### Basic Workload

```yaml
workloads:
  applications:
    - name: my-app
      tier: corp
      computeType: aks
```

### Full Configuration

```yaml
workloads:
  applications:
    - name: payment-service
      tier: corp
      computeType: aks
      environment: prod

      network:
        addressSpace: "10.10.0.0/16"
        subnets:
          app: "10.10.1.0/24"
          data: "10.10.2.0/24"
          privateEndpoints: "10.10.3.0/24"

      aks:
        kubernetesVersion: "1.28"
        systemPoolSize: 3
        systemPoolVmSize: Standard_D4s_v3
        enableWorkloadIdentity: true
        enablePrivateCluster: true

      database:
        enabled: true
        type: postgresql            # postgresql | mysql | sqlserver
        sku: GP_Gen5_2
        highAvailability: true

      keyVault:
        enabled: true
        sku: standard               # standard | premium

      monitoring:
        enabled: true
        # Uses central Log Analytics
```

## Compute Types

### AKS (Default)

```yaml
computeType: aks
aks:
  kubernetesVersion: "1.28"
  systemPoolSize: 3
  systemPoolVmSize: Standard_D4s_v3
  userPools:
    - name: workload
      size: 3
      vmSize: Standard_D8s_v3
      mode: User
  enableWorkloadIdentity: true
  enablePrivateCluster: true
  networkPlugin: azure              # azure | kubenet
```

### App Service

```yaml
computeType: appservice
appService:
  sku: P1v3
  kind: linux                       # linux | windows
  runtimeStack: NODE|18-lts
  alwaysOn: true
  httpsOnly: true
```

### Container Apps

```yaml
computeType: container-apps
containerApps:
  environmentSku: Consumption       # Consumption | Workload
  zoneRedundant: false
```

## Batch Deployment

Deploy multiple workloads at once:

```bash
./scripts/02-state-management/deploy-all.sh --phase workloads
```

Or specific workloads:

```bash
./scripts/02-state-management/deploy-workload.sh --app payment-service
./scripts/02-state-management/deploy-workload.sh --app order-service
```

## Network Peering

Spoke networks are automatically peered to the hub:

```
Hub (Connectivity)
├── Spoke: payment-service (10.10.0.0/16)
├── Spoke: order-service (10.11.0.0/16)
└── Spoke: inventory-service (10.12.0.0/16)
```

Address spaces are auto-assigned if not specified.

## Accessing Outputs

```bash
# All outputs
pulumi stack output

# Specific output
pulumi stack output kubeconfig --show-secrets

# Export for kubectl
pulumi stack output kubeconfig --show-secrets > ~/.kube/config
```

## Troubleshooting

### "Address space conflict"

Ensure no overlapping CIDR ranges:
```yaml
workloads:
  applications:
    - name: app1
      network:
        addressSpace: "10.10.0.0/16"  # OK
    - name: app2
      network:
        addressSpace: "10.11.0.0/16"  # OK, no overlap
```

### "AKS creation failed"

Common causes:
- Insufficient quota for VM size
- Service Principal issues
- Network plugin conflicts

Check AKS provider registration:
```bash
az provider register --namespace Microsoft.ContainerService
```

### "Private endpoint DNS resolution"

Ensure Private DNS Zones are linked to spoke VNet:
```bash
az network private-dns link vnet list \
  --resource-group <dns-rg> \
  --zone-name privatelink.database.windows.net
```

## Cleanup

Remove a workload:

```bash
cd stacks/02-workloads/payment-service
pulumi destroy
pulumi stack rm prod-eastus
```

## Next Steps

- [Developer Guide](../development/index.md) for extending components
- [Configuration Reference](./configuration-reference.md) for all options
