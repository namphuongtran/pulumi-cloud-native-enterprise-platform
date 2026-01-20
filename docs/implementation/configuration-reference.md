# Configuration Reference

Complete reference for all configuration options.

## Configuration File

Location: `config/landing-zone.yaml`

## Schema Overview

```yaml
platform:
  billing: { ... }
  organization: { ... }
  region: { ... }
  connectivity: { ... }
  management: { ... }
  identity: { ... }

workloads:
  defaults: { ... }
  applications: [ ... ]
```

## Platform Configuration

### billing

Controls subscription creation behavior.

```yaml
platform:
  billing:
    model: PAYG                    # PAYG | EA | MCA
```

#### PAYG (Pay-As-You-Go) - Default

```yaml
billing:
  model: PAYG
  subscriptions:
    management: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
    connectivity: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
    identity: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"      # Optional
```

#### EA (Enterprise Agreement)

```yaml
billing:
  model: EA
  enrollmentAccountId: "/providers/Microsoft.Billing/enrollmentAccounts/xxxxx"
```

#### MCA (Microsoft Customer Agreement)

```yaml
billing:
  model: MCA
  billingAccountName: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx:xxxxxxxx_2019-05-31"
  billingProfileName: "xxxx-xxxx-xxx-xxx"
  invoiceSectionName: "xxxx-xxxx-xxx-xxx"
```

### organization

```yaml
platform:
  organization:
    name: contoso                  # Short name (used in resource names)
    displayName: Contoso Corp      # Display name
    domain: contoso.com            # Primary domain (optional)
```

### region

```yaml
platform:
  region:
    mode: single                   # single | multi
    primary: eastus                # Primary Azure region
    secondary: westus              # Secondary (only if mode: multi)
```

### connectivity

```yaml
platform:
  connectivity:
    architecture: vwan             # vwan | hub-spoke
```

#### Virtual WAN Options

```yaml
connectivity:
  architecture: vwan
  vwan:
    sku: Standard                  # Basic | Standard
    allowBranchToBranch: true
    hubAddressPrefix: "10.0.0.0/16"
  firewall:
    enabled: true
    sku: Standard                  # Standard | Premium
    threatIntelMode: Alert         # Off | Alert | Deny
    dnsProxy: true
  vpn:
    enabled: false
    sku: VpnGw1
  expressRoute:
    enabled: false
    sku: Standard
```

#### Hub-Spoke Options

```yaml
connectivity:
  architecture: hub-spoke
  hub:
    addressSpace: "10.0.0.0/16"
    subnets:
      gateway: "10.0.0.0/24"
      firewall: "10.0.1.0/26"
      bastion: "10.0.2.0/26"
      management: "10.0.3.0/24"
  firewall:
    enabled: true
    sku: Standard
  bastion:
    enabled: false
    sku: Basic                     # Basic | Standard
```

### management

```yaml
platform:
  management:
    logRetentionDays: 30           # 30-730 days
    enableDefender: true
    defenderTier: Standard         # Free | Standard
    actionGroupEmail: ops@contoso.com
```

### identity

```yaml
platform:
  identity:
    enabled: false                 # Enable identity subscription
    domainServices:
      enabled: false
      domainName: aadds.contoso.com
      sku: Standard                # Standard | Enterprise | Premium
```

## Workloads Configuration

### defaults

Default values applied to all applications:

```yaml
workloads:
  defaults:
    computeType: aks               # aks | appservice | container-apps
    tier: corp                     # corp | online | sandbox
    networkIsolation: true         # Use private endpoints
```

### applications

Array of application definitions:

```yaml
workloads:
  applications:
    - name: payment-service        # Required: unique name
      # All fields below are optional (use defaults)
      tier: corp
      computeType: aks
      environment: prod

      network: { ... }
      aks: { ... }
      appService: { ... }
      containerApps: { ... }
      database: { ... }
      keyVault: { ... }
```

#### Application Network Options

```yaml
network:
  addressSpace: "10.10.0.0/16"     # Auto-assigned if omitted
  subnets:
    app: "10.10.1.0/24"
    data: "10.10.2.0/24"
    privateEndpoints: "10.10.3.0/24"
  nsgRules:
    - name: AllowHttps
      priority: 100
      direction: Inbound
      access: Allow
      protocol: Tcp
      destinationPortRange: "443"
```

#### AKS Options

```yaml
aks:
  kubernetesVersion: "1.28"
  systemPoolSize: 3
  systemPoolVmSize: Standard_D4s_v3
  userPools:
    - name: workload
      size: 3
      vmSize: Standard_D8s_v3
      mode: User
      nodeLabels:
        workload: general
  enableWorkloadIdentity: true
  enablePrivateCluster: true
  networkPlugin: azure             # azure | kubenet
  networkPolicy: calico            # azure | calico | none
  serviceCidr: "172.16.0.0/16"
  dnsServiceIp: "172.16.0.10"
```

#### App Service Options

```yaml
appService:
  sku: P1v3                        # B1, S1, P1v3, etc.
  kind: linux                      # linux | windows
  runtimeStack: NODE|18-lts
  alwaysOn: true
  httpsOnly: true
  minTlsVersion: "1.2"
  slots:
    - name: staging
```

#### Container Apps Options

```yaml
containerApps:
  environmentSku: Consumption      # Consumption | Workload
  zoneRedundant: false
  internalOnly: true               # No public ingress
```

#### Database Options

```yaml
database:
  enabled: true
  type: postgresql                 # postgresql | mysql | sqlserver | cosmosdb
  sku: GP_Gen5_2
  storageSizeGb: 128
  highAvailability: true
  backupRetentionDays: 7
  geoRedundantBackup: false
```

#### Key Vault Options

```yaml
keyVault:
  enabled: true
  sku: standard                    # standard | premium
  enablePurgeProtection: true
  softDeleteRetentionDays: 90
```

## Environment Variables

Override configuration with environment variables:

| Variable | Description |
|----------|-------------|
| `LANDING_ZONE_CONFIG` | Path to config file |
| `AZURE_SUBSCRIPTION_ID` | Override default subscription |
| `PULUMI_CONFIG_PASSPHRASE` | Encryption passphrase |

## Validation

Validate configuration before deployment:

```bash
./scripts/99-utilities/validate-config.sh
```
