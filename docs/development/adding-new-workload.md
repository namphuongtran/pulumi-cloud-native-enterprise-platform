# Adding New Workload

Guide for creating a new application landing zone.

## Quick Start

### 1. Add to Configuration

```yaml
# config/landing-zone.yaml
workloads:
  applications:
    - name: my-new-app
      tier: corp
      computeType: aks
```

### 2. Create Stack from Template

```bash
cd stacks/02-workloads
cp -r _template my-new-app
cd my-new-app
```

### 3. Initialize

```bash
pulumi stack init prod-eastus
pulumi config set appName my-new-app
pulumi config set azure-native:location eastus
```

### 4. Deploy

```bash
pulumi up
```

## Detailed Steps

### Step 1: Define Application

Add to `config/landing-zone.yaml`:

```yaml
workloads:
  applications:
    - name: my-new-app              # Required: unique identifier
      tier: corp                    # corp | online | sandbox
      computeType: aks              # aks | appservice | container-apps
      environment: prod             # Environment name

      # Optional: Network customization
      network:
        addressSpace: "10.20.0.0/16"

      # Optional: Compute customization
      aks:
        kubernetesVersion: "1.28"
        systemPoolSize: 3
```

### Step 2: Create Stack Directory

Copy the template:

```bash
cd stacks/02-workloads
cp -r _template my-new-app
```

Template structure:
```
my-new-app/
├── index.ts              # Main entry point
├── package.json
├── tsconfig.json
├── Pulumi.yaml
└── Pulumi.prod-eastus.yaml
```

### Step 3: Customize (Optional)

Edit `index.ts` if needed:

```typescript
import * as pulumi from "@pulumi/pulumi";
import { loadLandingZoneConfig, createWorkload } from "@enterprise/core";

const config = loadLandingZoneConfig();
const appConfig = config.workloads.applications.find(a => a.name === "my-new-app");

// Standard workload creation
const workload = createWorkload("my-new-app", appConfig);

// Add custom resources if needed
const customResource = new azure.SomeResource("custom", {
  ...
}, { parent: workload });

export const outputs = workload.outputs;
```

### Step 4: Configure Stack

```bash
pulumi stack init prod-eastus

# Required
pulumi config set appName my-new-app
pulumi config set azure-native:location eastus

# Optional
pulumi config set azure-native:subscriptionId <sub-id>
```

### Step 5: Deploy

Preview first:
```bash
pulumi preview
```

Deploy:
```bash
pulumi up
```

### Step 6: Verify

```bash
# Check outputs
pulumi stack output

# Check Azure resources
az resource list --resource-group rg-my-new-app-prod --output table
```

## Using the Deploy Script

Alternative to manual steps:

```bash
./scripts/02-state-management/deploy-workload.sh \
  --app my-new-app \
  --env prod \
  --region eastus
```

## Common Customizations

### Custom Network Rules

```typescript
// In index.ts
import { createWorkload, addNsgRule } from "@enterprise/core";

const workload = createWorkload("my-new-app", appConfig);

addNsgRule(workload.nsg, {
  name: "AllowCustomPort",
  priority: 200,
  direction: "Inbound",
  access: "Allow",
  protocol: "Tcp",
  destinationPortRange: "8080",
});
```

### Additional Resources

```typescript
const workload = createWorkload("my-new-app", appConfig);

// Add Redis cache
const redis = new azure.cache.Redis("redis", {
  resourceGroupName: workload.resourceGroupName,
  location: workload.location,
  sku: {
    name: "Basic",
    family: "C",
    capacity: 0,
  },
}, { parent: workload });
```

### Custom Outputs

```typescript
const workload = createWorkload("my-new-app", appConfig);

export const kubeconfig = workload.aks?.kubeconfig;
export const customOutput = someResource.property;
```

## Multi-Environment

Create stacks for each environment:

```bash
pulumi stack init dev-eastus
pulumi stack init staging-eastus
pulumi stack init prod-eastus
```

Deploy in order:
```bash
pulumi up --stack dev-eastus
pulumi up --stack staging-eastus
pulumi up --stack prod-eastus
```

## Cleanup

Remove a workload:

```bash
# Destroy resources
pulumi destroy --stack prod-eastus

# Remove stack
pulumi stack rm prod-eastus

# Remove directory
cd ..
rm -rf my-new-app
```

Remove from configuration:
```yaml
workloads:
  applications:
    # Remove the entry
    # - name: my-new-app
```
