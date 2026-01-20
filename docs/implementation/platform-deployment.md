# Platform Deployment

Deploy the platform landing zone with shared infrastructure.

## What Platform Creates

### Management Subscription
- Log Analytics Workspace
- Automation Account
- Azure Monitor resources
- Microsoft Defender for Cloud

### Connectivity Subscription
- Virtual WAN + Hub (or Hub VNet)
- Azure Firewall
- Private DNS Zones
- VPN/ExpressRoute Gateways (optional)

### Identity Subscription (Optional)
- Azure AD Domain Services
- Shared identity resources

## Prerequisites

- [ ] [Bootstrap](./bootstrap-guide.md) completed
- [ ] Subscriptions in correct management groups
- [ ] Contributor access to platform subscriptions

## Steps

### 1. Deploy Management Stack

```bash
cd stacks/01-platform/management
pulumi stack init <env>-<region>   # e.g., prod-eastus
pulumi config set azure-native:location eastus
pulumi up
```

Outputs:
- `logAnalyticsWorkspaceId`
- `logAnalyticsWorkspaceName`
- `appInsightsInstrumentationKey`

### 2. Deploy Connectivity Stack

```bash
cd stacks/01-platform/connectivity
pulumi stack init <env>-<region>
pulumi config set azure-native:location eastus
pulumi up
```

Outputs:
- `hubVnetId` or `vwanHubId`
- `firewallPrivateIp`
- `privateDnsZoneIds`

### 3. Deploy Identity Stack (Optional)

Only if `identity.enabled: true`:

```bash
cd stacks/01-platform/identity
pulumi stack init <env>-<region>
pulumi up
```

## Configuration Options

### Management

```yaml
platform:
  management:
    logRetentionDays: 30           # Log Analytics retention
    enableDefender: true           # Microsoft Defender
    defenderTier: Standard         # Free | Standard
```

### Connectivity - Virtual WAN

```yaml
platform:
  connectivity:
    architecture: vwan
    vwan:
      sku: Standard                # Basic | Standard
      allowBranchToBranch: true
    firewall:
      enabled: true
      sku: Standard                # Standard | Premium
      threatIntelMode: Alert       # Off | Alert | Deny
```

### Connectivity - Hub-Spoke

```yaml
platform:
  connectivity:
    architecture: hub-spoke
    hub:
      addressSpace: "10.0.0.0/16"
      subnets:
        gateway: "10.0.0.0/24"
        firewall: "10.0.1.0/24"
        bastion: "10.0.2.0/24"
    firewall:
      enabled: true
      sku: Standard
```

### VPN Gateway (Optional)

```yaml
platform:
  connectivity:
    vpn:
      enabled: true
      sku: VpnGw1
      type: RouteBased
```

### ExpressRoute (Optional)

```yaml
platform:
  connectivity:
    expressRoute:
      enabled: true
      sku: Standard
      tier: MeteredData
```

## Multi-Region Deployment

For `region.mode: multi`:

### Primary Region
```bash
cd stacks/01-platform/connectivity
pulumi stack init prod-eastus
pulumi up
```

### Secondary Region
```bash
pulumi stack init prod-westus
pulumi config set azure-native:location westus
pulumi config set primaryHubId $(pulumi stack output hubVnetId --stack prod-eastus)
pulumi up
```

## Verification

### Check Log Analytics

```bash
az monitor log-analytics workspace show \
  --resource-group <rg-name> \
  --workspace-name <workspace-name>
```

### Check Connectivity

```bash
# For VWAN
az network vwan show --name <vwan-name> --resource-group <rg-name>

# For Hub VNet
az network vnet show --name <hub-vnet-name> --resource-group <rg-name>
```

### Check Firewall

```bash
az network firewall show --name <fw-name> --resource-group <rg-name>
```

## Troubleshooting

### "Subscription not found"

Ensure subscription is in correct management group:
```bash
az account management-group subscription show \
  --name <mg-name> \
  --subscription <sub-id>
```

### "Resource provider not registered"

Register required providers:
```bash
az provider register --namespace Microsoft.Network
az provider register --namespace Microsoft.OperationalInsights
az provider register --namespace Microsoft.Insights
```

### "Quota exceeded"

Check and request quota increase:
```bash
az vm list-usage --location eastus --output table
```

## Next Steps

After platform deployment:
- [Workload Deployment](./workload-deployment.md)
