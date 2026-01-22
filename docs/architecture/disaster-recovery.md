# Disaster Recovery

This document describes the disaster recovery (DR) strategy and procedures for the cloud-native platform.

## DR Strategy: Cold Standby

This platform uses a **Cold Standby** DR strategy optimized for cost efficiency.

| Metric | Target | Notes |
|--------|--------|-------|
| **RTO** | 30-60 minutes | Time to restore service |
| **RPO** | 1-24 hours | Potential data loss window |
| **Extra Cost** | $0/month | No standby infrastructure |

### How It Works

```
┌─────────────────────────────────────────────────────────────────┐
│                     NORMAL OPERATION                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   ┌──────────────────┐                                          │
│   │  Primary (eastus)│     Single region deployment              │
│   │  ──────────────  │                                          │
│   │  ✓ AKS Cluster   │                                          │
│   │  ✓ SQL Server    │──geo-backup──► Azure Blob (GRS)          │
│   │  ✓ Key Vault     │               (automatic, ~1hr intervals) │
│   │  ✓ VNet + NSG    │                                          │
│   └──────────────────┘                                          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                     DISASTER SCENARIO                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   ┌──────────────────┐          ┌──────────────────┐            │
│   │  Primary (eastus)│          │ Secondary (westus)│            │
│   │       ❌ DOWN    │          │                   │            │
│   └──────────────────┘          │  ./provision-dr   │            │
│                                 │  ───────────────  │            │
│         Azure Blob (GRS) ──────►│  ✓ AKS Cluster   │            │
│         (geo-backup)            │  ✓ SQL (restored)│            │
│                                 │  ✓ Key Vault     │            │
│                                 │  ✓ VNet + NSG    │            │
│                                 └──────────────────┘            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## DR Scripts

All DR scripts are located in `scripts/03-disaster-recovery/`:

| Script | Purpose | When to Use |
|--------|---------|-------------|
| `provision-dr-region.sh` | Provision full DR infrastructure | Primary region outage |
| `restore-sql-database.sh` | Restore SQL from geo-backup | After infrastructure provisioned |
| `validate-dr.sh` | Validate DR deployment | After provisioning |
| `failback.sh` | Return to primary region | After primary recovered |

## DR Activation Runbook

### Prerequisites

Before activating DR, ensure you have:

- [ ] Azure CLI installed and logged in (`az login`)
- [ ] Pulumi CLI installed and configured
- [ ] Access to Pulumi state backend
- [ ] Sufficient Azure quota in DR region
- [ ] Network access to run deployment scripts

### Step-by-Step Procedure

#### 1. Detect and Confirm Outage

```bash
# Check Azure status
open https://status.azure.com/

# Check primary region resources
az group show -n rg-platform-prod-eastus

# Check AKS health
az aks show -n aks-platform-prod-eastus -g rg-platform-prod-eastus \
    --query "provisioningState"
```

**Decision point**: Is this a regional outage requiring DR activation?

#### 2. Notify Stakeholders

Before proceeding, notify:
- Engineering team lead
- Operations team
- Business stakeholders

Document the incident start time and symptoms.

#### 3. Activate DR Infrastructure

```bash
# Navigate to project root
cd /path/to/pulumi-cloud-native-enterprise-platform

# Run DR provisioning script
./scripts/03-disaster-recovery/provision-dr-region.sh \
    --region westus \
    --env prod

# For dry-run (preview only):
./scripts/03-disaster-recovery/provision-dr-region.sh \
    --region westus \
    --env prod \
    --dry-run
```

**Expected duration**: 15-25 minutes for infrastructure

#### 4. Restore Database

If not using `--skip-sql-restore`:

```bash
# Restore SQL database from geo-backup
./scripts/03-disaster-recovery/restore-sql-database.sh \
    --region westus \
    --env prod

# Or restore to specific point in time:
./scripts/03-disaster-recovery/restore-sql-database.sh \
    --region westus \
    --env prod \
    --restore-point "2024-01-15T10:00:00Z"
```

**Expected duration**: 10-30 minutes depending on database size

#### 5. Validate Deployment

```bash
# Run validation checks
./scripts/03-disaster-recovery/validate-dr.sh \
    --region westus \
    --env prod \
    --verbose
```

Verify:
- [ ] AKS cluster is running
- [ ] SQL database is online
- [ ] Key Vault is accessible
- [ ] Network connectivity works

#### 6. Update Traffic Routing

Update DNS or traffic management to point to DR region:

**Option A: DNS Update**
```bash
# Update DNS A/CNAME records to point to new endpoints
# Example using Azure DNS:
az network dns record-set a update \
    -g dns-resource-group \
    -z yourdomain.com \
    -n api \
    --set aRecords[0].ipv4Address=<DR_INGRESS_IP>
```

**Option B: Azure Traffic Manager (if configured)**
```bash
# Disable primary endpoint
az network traffic-manager endpoint update \
    --name primary-endpoint \
    --profile-name tm-profile \
    --resource-group rg-traffic \
    --type azureEndpoints \
    --endpoint-status Disabled
```

#### 7. Deploy Applications (if needed)

```bash
# Get AKS credentials
az aks get-credentials \
    -n aks-platform-prod-westus \
    -g rg-platform-prod-westus

# Deploy applications via GitOps or kubectl
kubectl apply -f k8s-manifests/
```

#### 8. Verify Application Health

```bash
# Check pods are running
kubectl get pods -A

# Check application endpoints
curl https://api.yourdomain.com/health

# Monitor logs
kubectl logs -f deployment/your-app -n your-namespace
```

#### 9. Notify Stakeholders

Send notification:
- DR activation complete
- New endpoints (if changed)
- Known limitations
- Expected normal operations timeline

## Failback Procedure

After the primary region is recovered:

### 1. Validate Primary Region

```bash
# Redeploy primary infrastructure (if destroyed)
cd stacks/02-platform-services
pulumi stack select prod-eastus
pulumi up

# Verify health
./scripts/03-disaster-recovery/validate-dr.sh \
    --region eastus \
    --env prod
```

### 2. Sync Data

Choose appropriate data sync strategy:

**Option A: Accept data loss**
- Use primary region backup (lose DR changes)

**Option B: Migrate DR data to primary**
```bash
# Export from DR
az sql db export \
    --server sql-platform-prod-westus \
    --resource-group rg-platform-prod-westus \
    --name shared-tenant-db \
    --storage-key-type StorageAccessKey \
    --storage-key "<key>" \
    --storage-uri "https://storage.blob.core.windows.net/backups/export.bacpac" \
    --admin-user sqladmin \
    --admin-password "<password>"

# Import to primary
az sql db import \
    --server sql-platform-prod-eastus \
    --resource-group rg-platform-prod-eastus \
    --name shared-tenant-db \
    --storage-key-type StorageAccessKey \
    --storage-key "<key>" \
    --storage-uri "https://storage.blob.core.windows.net/backups/export.bacpac" \
    --admin-user sqladmin \
    --admin-password "<password>"
```

### 3. Execute Failback

```bash
./scripts/03-disaster-recovery/failback.sh \
    --primary-region eastus \
    --dr-region westus \
    --env prod

# To also destroy DR resources:
./scripts/03-disaster-recovery/failback.sh \
    --primary-region eastus \
    --dr-region westus \
    --env prod \
    --destroy-dr
```

## DR Testing

### Monthly DR Drill

Conduct monthly DR drills to validate:

1. Scripts execute successfully
2. Provisioning time meets RTO target
3. Team knows the procedures
4. Documentation is accurate

```bash
# Test DR provisioning (use staging/dev if available)
./scripts/03-disaster-recovery/provision-dr-region.sh \
    --region westus \
    --env staging \
    --dry-run

# Full drill (schedule maintenance window)
./scripts/03-disaster-recovery/provision-dr-region.sh \
    --region westus \
    --env staging
```

### DR Drill Checklist

- [ ] All team members can access DR scripts
- [ ] Azure credentials work for DR region
- [ ] Pulumi state is accessible
- [ ] Infrastructure provisions within RTO
- [ ] SQL restore completes successfully
- [ ] Applications start correctly
- [ ] Traffic routing can be updated
- [ ] Communication plan is followed

## Cost Considerations

| Scenario | Monthly Cost |
|----------|--------------|
| Normal operation | $0 extra (DR not running) |
| During DR activation | ~$585/month (full stack) |
| DR drill (2 hours) | ~$1.60 |

## Limitations

1. **Data Loss (RPO)**
   - Geo-redundant backups occur approximately hourly
   - Point-in-time restore available within backup window
   - Accept up to 1-24 hours of potential data loss

2. **Recovery Time (RTO)**
   - AKS provisioning: 15-20 minutes
   - SQL geo-restore: 10-30 minutes
   - Application deployment: 5-10 minutes
   - Total: 30-60 minutes

3. **Not Included**
   - Automatic failover (manual activation required)
   - Real-time data replication
   - Cross-region traffic management

## Upgrading to Active-Passive

If you need better RTO/RPO, consider upgrading to Active-Passive:

| Component | Addition | Benefit |
|-----------|----------|---------|
| SQL Failover Group | +~$200/mo | RPO ~5 sec, automatic failover |
| Azure Front Door | +~$35/mo | Instant traffic routing |
| Pilot Light AKS | +~$50/mo | Faster scale-up |

See [Multi-Region Design](./multi-region-design.md) for details.

## Runbooks

Detailed step-by-step checklists for DR operations:

| Runbook | Purpose | When to Use |
|---------|---------|-------------|
| [DR Activation Checklist](../runbooks/dr-activation-checklist.md) | Complete DR activation procedure | Primary region outage |
| [DR Failback Checklist](../runbooks/dr-failback-checklist.md) | Return to primary region | After primary recovers |
| [DR Quick Reference](../runbooks/dr-quick-reference.md) | One-page emergency reference | Print and keep accessible |

## Related Documents

- [Multi-Region Design](./multi-region-design.md)
- [Platform Landing Zone](./platform-landing-zone.md)
- [Connectivity Patterns](./connectivity-patterns.md)

## Revision History

| Date | Author | Changes |
|------|--------|---------|
| 2024-01-22 | Platform Team | Initial DR runbook |
