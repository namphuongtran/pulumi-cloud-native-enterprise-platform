# Bootstrap Guide

Bootstrap creates the foundational management group hierarchy and policies.

## What Bootstrap Creates

```
Tenant Root Group
└── Landing Zone Root (configurable name)
    ├── Platform
    │   ├── Management
    │   ├── Connectivity
    │   └── Identity
    ├── Landing Zones
    │   ├── Corp
    │   └── Online
    ├── Sandbox
    └── Decommissioned
```

## Prerequisites

- [ ] [Prerequisites](./prerequisites.md) completed
- [ ] Management Group Contributor role at tenant root
- [ ] Configuration file created

## Steps

### 1. Validate Configuration

```bash
./scripts/99-utilities/validate-config.sh
```

### 2. Prepare Subscriptions (PAYG Only)

If using PAYG billing model, create subscriptions first:

```bash
./scripts/01-azure-setup/create-subscriptions-payg.sh
```

This interactive script guides you through:
1. Creating subscriptions in Azure Portal
2. Collecting subscription IDs
3. Updating configuration file

### 3. Deploy Management Groups Stack

```bash
cd stacks/01-bootstrap/management-groups
pnpm install
pulumi stack init bootstrap
pulumi up
```

### 4. Verify Management Groups

```bash
az account management-group list --output table
```

Expected output:
```
Name               DisplayName
-----------------  -------------------
<prefix>           Landing Zone Root
<prefix>-platform  Platform
<prefix>-mgmt      Management
<prefix>-conn      Connectivity
...
```

### 5. Deploy Policies

```bash
cd stacks/01-bootstrap/policies
pnpm install
pulumi stack init bootstrap-policies
pulumi up
```

#### Policy Configuration Options

| Config | Default | Description |
|--------|---------|-------------|
| `enforceMode` | `true` | Enable enforcement (`true`) or audit-only (`false`) |
| `enableSecurityBenchmark` | `false` | Enable Azure Security Benchmark initiative |

To configure:
```bash
pulumi config set enforceMode false  # Audit-only mode
pulumi config set enableSecurityBenchmark true  # Enable security benchmark
```

## Configuration Options

```yaml
platform:
  organization:
    name: contoso                    # Prefix for management groups
    displayName: Contoso Corp        # Display name

  managementGroups:
    root: alz                        # Root MG name
    includeIdentity: false           # Create identity MG?
    includeSandbox: true             # Create sandbox MG?
    includeDecommissioned: true      # Create decommissioned MG?
```

## Subscription Placement

After bootstrap, move subscriptions to correct management groups:

### Using Azure CLI

```bash
# Move management subscription
az account management-group subscription add \
  --name "<prefix>-mgmt" \
  --subscription "<management-subscription-id>"

# Move connectivity subscription
az account management-group subscription add \
  --name "<prefix>-conn" \
  --subscription "<connectivity-subscription-id>"
```

### Using Pulumi (Automated)

If using EA/MCA billing, subscriptions are created and placed automatically:

```yaml
platform:
  billing:
    model: EA
    enrollmentAccountId: /providers/Microsoft.Billing/enrollmentAccounts/xxxxx
```

## Troubleshooting

### "Insufficient permissions"

Verify tenant root access:
```bash
az account management-group list
```

If empty, request `Management Group Contributor` at tenant root.

### "Management group already exists"

Either:
1. Use existing management group by setting `exists: true` in config
2. Change the prefix in configuration
3. Delete existing management group (if safe)

### "Policy assignment failed"

Common causes:
- Subscription not in correct management group
- Missing resource provider registration

Fix:
```bash
# Register providers
az provider register --namespace Microsoft.PolicyInsights
az provider register --namespace Microsoft.Management
```

## Next Steps

After bootstrap completes:
- [Platform Deployment](./platform-deployment.md)
