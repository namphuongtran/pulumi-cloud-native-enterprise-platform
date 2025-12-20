# Resource Naming Conventions

All Azure resources follow **strict naming patterns** that enforce Azure constraints and enable multi-tenant scaling.

## Critical Constraints

### KeyVault (24 characters maximum)
- **Scope:** Global (must be unique across Azure)
- **Pattern:** `{type}-{tenant?}-{env}-{location}`
- **Example:** `kv-acme-prod-eastus` (23 chars) ✅

❌ **Will fail:** `kv-acme-production-eastus` (27 chars - TOO LONG)

### Storage Account (24 characters maximum, NO HYPHENS)
- **Scope:** Global (must be unique)
- **Pattern:** `{type}{tenant?}{env}{location}` (hyphens removed)
- **Example:** `stacmeprodea` (12 chars, no hyphens) ✅

❌ **Will fail:** `st-acme-prod-eastus` (hyphens not allowed)

### Other Resources
- **SQL Server:** 1-63 chars, lowercase only
- **AKS Cluster:** 1-63 chars, lowercase & hyphens
- **VNet/Subnets:** 2-80 chars, hyphens allowed
- **Resource Group:** 1-90 chars, hyphens allowed

## Naming Layers

### Layer 1: Platform (No Tenant)

**Pattern:** `{type}-platform-{environment}-{location}`

```
Platform Layer Resources:
├─ Key Vault:    kv-platform-prod-eastus
├─ Storage:      stplatformprodea
├─ AKS:          aksc-prod-eastus
├─ VNet:         vnet-platform-prod-eastus
├─ SQL Server:   sql-platform-prod-eastus
└─ Resource Grp: rg-platform-prod-eastus
```

### Layer 2: Services (No Tenant)

**Pattern:** `{type}-svc-{environment}-{location}`

```
Services Layer Resources:
├─ Grafana NS:   grafana-svc-prod-eastus
├─ Kyverno NS:   kyverno-svc-prod-eastus
├─ OpenSearch NS: opensearch-svc-prod-eastus
└─ Uptime Kuma:  uptimekuma-svc-prod-eastus
```

### Layer 3: Application (With Tenant)

**Pattern:** `{type}-{tenantId}-{environment}-{location}`

```
Application Layer Resources (Tenant: ACME):
├─ Key Vault:       kv-acme-prod-eastus        (19 chars) ✅
├─ Storage:         stacmeprodea               (12 chars) ✅
├─ Database:        db-acme-prod-eastus
├─ Managed ID:      acme-mi
└─ Resource Grp:    rg-app-acme-prod-eastus
```

## Safe Truncation Logic

If a name exceeds max length, it's **truncated intelligently**:

**Example:** `{type}-{longtenantid}-{environment}-{location}` → 32 chars (exceeds 24-char limit)

**Solution:** Remove from middle, preserve prefix and suffix
```
Original: kv-verylongtenantname-prod-eastus
Truncated: kv-verylong...d-eastus             (24 chars)
           └─────┬────┘  └────┬────┘
           Keep start    Keep end
```

## Implementation

All naming is **centralized** in [packages/core/lib/naming.ts](../packages/core/lib/naming.ts):

```typescript
// Platform layer
platformResourceName("kv", "prod", "eastus")
// → "kv-platform-prod-eastus"

// Application layer
applicationResourceName("kv", "acme", "prod", "eastus")
// → "kv-acme-prod-eastus"

// Validation
validateResourceName("kv-acme-prod-eastus", "kv")
// → { valid: true }

validateResourceName("kv-acme-production-eastus", "kv")
// → { valid: false, error: "Name too long (max 24 chars)" }
```

## Type Abbreviations

| Type | Code | Max Length | Example |
|------|------|-----------|---------|
| Key Vault | `kv` | 24 | `kv-acme-prod-eastus` |
| Storage Account | `st` | 24 | `stacmeprodea` |
| SQL Server | `sql` | 63 | `sql-platform-prod-eastus` |
| SQL Database | `db` | 128 | `db-acme-prod-eastus` |
| AKS Cluster | `aksc` | 63 | `aksc-prod-eastus` |
| VNet | `vnet` | 64 | `vnet-platform-prod-eastus` |
| Subnet | `snet` | 80 | `snet-app` |
| NSG | `nsg` | 80 | `nsg-app-prod-eastus` |
| App Service | `app` | 60 | `app-acme-prod-eastus` |
| Container Registry | `acr` | 50 | `acrplatform` |
| Resource Group | `rg` | 90 | `rg-platform-prod-eastus` |

## Best Practices

✅ **DO:**
- Use consistent abbreviations across all stacks
- Enforce naming in code (use `platformResourceName()`, not string literals)
- Validate names before creating resources
- Keep environment short (dev, stg, prd not development, staging, production)
- Use lowercase for resources that require it (SQL Server, AKS)

❌ **DON'T:**
- Hardcode resource names
- Use environment-specific naming (different patterns per env)
- Use special characters except hyphens
- Forget Storage Account doesn't allow hyphens
- Create resources manually outside of Pulumi

## Examples

### Correct ✅
```typescript
const kvName = applicationResourceName("kv", "acme", "prod", "eastus");
// → "kv-acme-prod-eastus"

const dbName = applicationResourceName("db", "acme", "prod", "eastus");
// → "db-acme-prod-eastus"

const stName = applicationResourceName("st", "acme", "prod", "eastus");
// → "stacmeprodea" (no hyphens, 12 chars)
```

### Incorrect ❌
```typescript
const kvName = "KeyVault-ACME-Production-East-US";
// ❌ Too long, inconsistent format, uppercase not recommended

const stName = "storage-acme-prod-eastus";
// ❌ Has hyphens (not allowed in Storage Account names)

const dbName = `${appName}-${env}-${location}`;
// ❌ Hardcoded, no validation
```

---

**Reference:** [Azure Naming Rules](https://docs.microsoft.com/en-us/azure/azure-resource-manager/management/resource-name-rules)
