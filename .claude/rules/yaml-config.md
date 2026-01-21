---
paths:
  - "config/**/*.yaml"
  - "config/**/*.yml"
  - "stacks/**/Pulumi*.yaml"
---

# YAML Configuration Conventions

## Landing Zone Config (`config/landing-zone.yaml`)
Structure:
```yaml
platform:
  organization: { name, displayName, domain }
  billing: { model, subscriptions }
  region: { mode, primary, secondary }
  connectivity: { architecture, firewall, vpn }
workloads:
  defaults: { computeType, tier }
  applications: [...]
```

## Valid Values
- **Billing models**: `PAYG`, `EA`, `MCA`
- **Region modes**: `single`, `multi`
- **Environments**: `dev`, `staging`, `prod`
- **Locations**: `eastus`, `westus`, `northeurope`, `westeurope`
- **Compute types**: `aks`, `appservice`, `container-apps`
- **Connectivity**: `hub-spoke`, `vwan`

## Pulumi Stack Files
- `Pulumi.yaml`: Include description with phase number and naming pattern
- `Pulumi.{stack}.yaml`: Stack name = `{environment}-{location}` (e.g., `dev-eastus`)

## Stack Naming Convention
```
Pulumi.dev-eastus.yaml      # Development in East US
Pulumi.prod-westeurope.yaml # Production in West Europe
```
