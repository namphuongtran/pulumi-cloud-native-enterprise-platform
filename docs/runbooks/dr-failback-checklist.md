# DR Failback Checklist

> **Purpose**: Step-by-step checklist for returning to primary region after DR activation.
>
> **When to Use**: After primary region (eastus) has fully recovered and is stable.
>
> **Last Updated**: 2024-01-22 | **Version**: 1.0

---

## Pre-Failback Assessment

### Before You Begin

**DO NOT failback if:**
- [ ] Primary region is still experiencing issues
- [ ] Azure status shows ongoing problems in primary region
- [ ] Less than 2 hours since primary region recovered
- [ ] During peak business hours (if avoidable)

**Recommended**: Schedule failback during maintenance window if possible.

---

## Quick Reference

| Item | Value |
|------|-------|
| Primary Region | `eastus` |
| DR Region (current) | `westus` |
| Primary Resource Group | `rg-platform-prod-eastus` |
| DR Resource Group | `rg-platform-prod-westus` |

---

## Phase 0: Validate Primary Region (10 min)

### 0.1 Check Azure Status

- [ ] **Verify no ongoing issues**
  ```
  https://status.azure.com/
  ```
  - [ ] East US shows healthy?
  - [ ] No planned maintenance?

### 0.2 Check Primary Infrastructure

- [ ] **Verify primary resource group**
  ```bash
  az group show -n rg-platform-prod-eastus -o table
  ```
  - [ ] Resource group exists?

- [ ] **Check AKS cluster health**
  ```bash
  az aks show -n aks-platform-prod-eastus \
      -g rg-platform-prod-eastus \
      --query "{State:provisioningState,Power:powerState.code}" -o table
  ```
  - [ ] State: `Succeeded`
  - [ ] Power: `Running`

- [ ] **Check SQL Server health**
  ```bash
  az sql server show -n sql-platform-prod-eastus \
      -g rg-platform-prod-eastus \
      --query "{State:state}" -o table
  ```
  - [ ] State: `Ready`

### 0.3 Redeploy Primary (If Needed)

If primary infrastructure was destroyed or needs refresh:

- [ ] **Redeploy primary stack**
  ```bash
  cd stacks/02-platform-services
  pulumi stack select prod-eastus
  pulumi up --yes
  ```

- [ ] **Verify deployment**
  ```bash
  pulumi stack output
  ```

---

## Phase 1: Data Synchronization (15-30 min)

> **CRITICAL**: This is the most important phase. Data created during DR must be preserved.

### 1.1 Assess Data Changes

- [ ] **Document data created during DR period**
  - DR activation time: _____________
  - Current time: _____________
  - Duration in DR: _____________ hours/days

- [ ] **Identify data sync strategy**

  | Strategy | When to Use | Data Loss |
  |----------|-------------|-----------|
  | A: Full sync from DR to Primary | Significant data changes during DR | None |
  | B: Merge | Complex, both regions have changes | None (with conflict resolution) |
  | C: Accept DR period loss | DR period data is expendable | DR period data lost |

  **Selected strategy**: [ ] A / [ ] B / [ ] C

### 1.2 Execute Data Sync

**Option A: Full Sync from DR to Primary (Recommended)**

- [ ] **Export database from DR**
  ```bash
  # Create storage container for export
  az storage container create \
      --name db-exports \
      --account-name <storage_account>

  # Get storage key
  STORAGE_KEY=$(az storage account keys list \
      --account-name <storage_account> \
      --query "[0].value" -o tsv)

  # Export database
  az sql db export \
      --server sql-platform-prod-westus \
      --resource-group rg-platform-prod-westus \
      --name shared-tenant-db \
      --storage-key-type StorageAccessKey \
      --storage-key "$STORAGE_KEY" \
      --storage-uri "https://<storage_account>.blob.core.windows.net/db-exports/dr-export-$(date +%Y%m%d).bacpac" \
      --admin-user sqladmin \
      --admin-password "<password>"
  ```
  - [ ] Export completed successfully?

- [ ] **Import to primary** (after dropping/renaming old database)
  ```bash
  # Rename existing database (backup)
  az sql db rename \
      --server sql-platform-prod-eastus \
      --resource-group rg-platform-prod-eastus \
      --name shared-tenant-db \
      --new-name shared-tenant-db-backup-$(date +%Y%m%d)

  # Import new database
  az sql db import \
      --server sql-platform-prod-eastus \
      --resource-group rg-platform-prod-eastus \
      --name shared-tenant-db \
      --storage-key-type StorageAccessKey \
      --storage-key "$STORAGE_KEY" \
      --storage-uri "https://<storage_account>.blob.core.windows.net/db-exports/dr-export-$(date +%Y%m%d).bacpac" \
      --admin-user sqladmin \
      --admin-password "<password>"
  ```
  - [ ] Import completed successfully?

**Option C: Accept DR Period Loss**

- [ ] **Restore primary from original backup**
  - Primary database should still have data from before DR
  - [ ] Confirm stakeholders accept data loss
  - Stakeholder approval: _____________ Time: _________

### 1.3 Verify Data Sync

- [ ] **Check record counts match** (adjust queries for your schema)
  ```bash
  # Get count from DR
  # Get count from Primary
  # Compare
  ```

- [ ] **Spot check critical data**
  - [ ] Recent transactions present?
  - [ ] User data intact?
  - [ ] Configuration data correct?

---

## Phase 2: Prepare Primary Applications (10 min)

### 2.1 Configure Primary AKS

- [ ] **Get primary AKS credentials**
  ```bash
  az aks get-credentials \
      --name aks-platform-prod-eastus \
      --resource-group rg-platform-prod-eastus \
      --overwrite-existing
  ```

- [ ] **Verify cluster access**
  ```bash
  kubectl get nodes
  ```
  - [ ] Nodes are `Ready`?

### 2.2 Deploy Applications to Primary

- [ ] **Deploy applications** (same as DR deployment)
  ```bash
  # Option: kubectl
  kubectl apply -f k8s-manifests/ --recursive

  # Option: Helm
  helm upgrade --install <app-name> ./charts/<app> \
      --namespace <namespace>

  # Option: GitOps
  argocd app sync --all
  ```

- [ ] **Verify applications running**
  ```bash
  kubectl get pods -A | grep -v Running
  ```
  - [ ] All pods running?

### 2.3 Test Primary Before Traffic Switch

- [ ] **Test application internally**
  ```bash
  # Port forward to test locally
  kubectl port-forward svc/<service-name> 8080:80 -n <namespace>

  # Test in another terminal
  curl http://localhost:8080/health
  ```
  - [ ] Returns 200 OK?

- [ ] **Test database connectivity**
  - [ ] Application can read from primary database?
  - [ ] Application can write to primary database?

---

## Phase 3: Traffic Switch (5-10 min)

### 3.1 Prepare for Switch

- [ ] **Notify team of imminent switch**
  ```
  🔄 FAILBACK: Switching traffic to primary region in 5 minutes.
  Expect brief service interruption.
  ```

- [ ] **Get primary ingress IP**
  ```bash
  kubectl get svc -n ingress-nginx ingress-nginx-controller \
      -o jsonpath='{.status.loadBalancer.ingress[0].ip}'
  ```
  Primary IP: _________________

### 3.2 Execute Traffic Switch

**Option A: Azure DNS**
- [ ] **Update DNS to primary**
  ```bash
  az network dns record-set a update \
      --resource-group <dns-rg> \
      --zone-name yourdomain.com \
      --name api \
      --set aRecords[0].ipv4Address=<PRIMARY_IP>
  ```

**Option B: External DNS**
- [ ] Log into DNS provider
- [ ] Update records to primary IP
- [ ] Save changes

**Option C: Azure Front Door**
- [ ] Re-enable primary origin
- [ ] Set primary as highest priority
- [ ] Disable or lower priority of DR origin

### 3.3 Verify Traffic Switch

- [ ] **Check DNS propagation**
  ```bash
  nslookup api.yourdomain.com
  dig api.yourdomain.com +short
  ```
  - [ ] Resolves to primary IP?

- [ ] **Test endpoint**
  ```bash
  curl -v https://api.yourdomain.com/health
  ```
  - [ ] Returns 200 OK from primary?

- [ ] **Verify in logs**
  ```bash
  # Check primary AKS logs
  kubectl logs -f deployment/<app> -n <namespace> --tail=20
  ```
  - [ ] Receiving traffic?

---

## Phase 4: Validation (10 min)

### 4.1 Smoke Tests

- [ ] **Test critical user flows**

  | Test | Status |
  |------|--------|
  | User login | [ ] Pass / [ ] Fail |
  | Data retrieval | [ ] Pass / [ ] Fail |
  | Data creation | [ ] Pass / [ ] Fail |
  | API responses | [ ] Pass / [ ] Fail |
  | File uploads (if applicable) | [ ] Pass / [ ] Fail |

### 4.2 Monitor Primary

- [ ] **Check metrics in Azure Monitor**
  - [ ] CPU usage normal?
  - [ ] Memory usage normal?
  - [ ] Request latency acceptable?
  - [ ] Error rate low?

- [ ] **Check application logs**
  ```bash
  kubectl logs -f deployment/<app> -n <namespace> --tail=50
  ```
  - [ ] No errors?

### 4.3 Extended Monitoring Period

- [ ] **Monitor for 30 minutes minimum**
  - Start time: _________
  - End time: _________
  - [ ] No issues detected?

---

## Phase 5: DR Cleanup (Optional)

> **Recommendation**: Keep DR resources for 24-48 hours before cleanup in case of issues.

### 5.1 Decision Point

- [ ] **Decide on DR resources**

  | Option | Action | Cost Impact |
  |--------|--------|-------------|
  | Keep | Maintain DR as warm standby | ~$585/month |
  | Destroy | Remove all DR resources | $0 |
  | Scale Down | Reduce to minimum | ~$100/month |

  **Decision**: [ ] Keep / [ ] Destroy / [ ] Scale Down

  **Decision by**: _____________ **Time**: _________

### 5.2 Destroy DR (If Selected)

- [ ] **Run failback script with destroy flag**
  ```bash
  ./scripts/03-disaster-recovery/failback.sh \
      --primary-region eastus \
      --dr-region westus \
      --env prod \
      --destroy-dr \
      --yes
  ```

  **OR manually:**
  ```bash
  cd stacks/02-platform-services
  pulumi stack select prod-westus
  pulumi destroy --yes
  ```

- [ ] **Verify resources destroyed**
  ```bash
  az group show -n rg-platform-prod-westus
  # Should return error: Resource group not found
  ```

### 5.3 Keep DR (If Selected)

- [ ] **Document DR state**
  - DR resources active: Yes
  - Monthly cost estimate: $_______
  - Next review date: _______

---

## Phase 6: Documentation & Closure

### 6.1 Notify Stakeholders

- [ ] **Post completion message**
  ```
  ✅ FAILBACK COMPLETE

  Status: Returned to primary region (eastus)
  Traffic: Now routing to primary
  DR Resources: [Kept/Destroyed]

  Summary:
  - DR Duration: X hours/days
  - Data Loss: [None/Description]
  - Total Failback Time: X minutes

  Service is fully restored to normal operation.
  ```

### 6.2 Update Incident Record

- [ ] **Complete incident documentation**

  | Field | Value |
  |-------|-------|
  | Incident ID | INC-_______ |
  | DR Activation Time | |
  | Failback Start Time | |
  | Failback Complete Time | |
  | Total DR Duration | |
  | Data Sync Method | |
  | Data Loss (if any) | |
  | Failback Duration | |
  | Issues During Failback | |
  | DR Resources Status | Kept / Destroyed |

### 6.3 Post-Incident Review

Schedule a post-incident review within 1 week:

- [ ] **Schedule review meeting**
  - Date: _______
  - Attendees: _______

- [ ] **Topics to cover**
  - [ ] What went well?
  - [ ] What could be improved?
  - [ ] Update runbooks based on learnings
  - [ ] Any automation opportunities?

---

## Troubleshooting

### Common Failback Issues

| Issue | Solution |
|-------|----------|
| Primary not responding | Verify Azure status, redeploy if needed |
| Data sync fails | Try smaller batch exports, check storage quota |
| DNS not updating | Clear local cache, check TTL settings |
| Apps won't start | Check config maps, secrets, env vars |
| Database connection errors | Verify connection strings, firewall rules |

### Rollback to DR

If failback fails and you need to return to DR:

```bash
# Quickly switch back to DR
az network dns record-set a update \
    --resource-group <dns-rg> \
    --zone-name yourdomain.com \
    --name api \
    --set aRecords[0].ipv4Address=<DR_IP>
```

---

## Emergency Contacts

| Role | Name | Contact |
|------|------|---------|
| Incident Commander | | |
| Platform Lead | | |
| Database Admin | | |
| Network Admin | | |

---

**Document Version**: 1.0
**Print Date**: ____________
**Reviewed By**: ____________
