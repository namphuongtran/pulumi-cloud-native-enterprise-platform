# DR Activation Checklist

> **Purpose**: Step-by-step checklist for activating disaster recovery when the primary region (eastus) is unavailable.
>
> **Target RTO**: 30-60 minutes | **Target RPO**: 1-24 hours
>
> **Last Updated**: 2024-01-22 | **Version**: 1.0

---

## Quick Reference

| Item | Value |
|------|-------|
| Primary Region | `eastus` |
| DR Region | `westus` |
| DR Script Location | `scripts/03-disaster-recovery/` |
| Primary Resource Group | `rg-platform-prod-eastus` |
| DR Resource Group | `rg-platform-prod-westus` |

---

## Phase 0: Detection & Decision (5-10 min)

### 0.1 Confirm Outage

- [ ] **Check Azure Status Page**
  ```
  https://status.azure.com/
  ```
  - [ ] Is there a reported outage in `East US`?
  - [ ] Which services are affected?

- [ ] **Check Primary Region Resources**
  ```bash
  # Test Azure CLI access
  az account show

  # Check primary resource group
  az group show -n rg-platform-prod-eastus -o table

  # Check AKS cluster
  az aks show -n aks-platform-prod-eastus \
      -g rg-platform-prod-eastus \
      --query "{State:provisioningState,Power:powerState.code}" -o table

  # Check SQL Server
  az sql server show -n sql-platform-prod-eastus \
      -g rg-platform-prod-eastus \
      --query "{State:state,FQDN:fullyQualifiedDomainName}" -o table
  ```

- [ ] **Check Application Health**
  ```bash
  # Test application endpoint (adjust URL as needed)
  curl -s -o /dev/null -w "%{http_code}" https://api.yourdomain.com/health
  ```

### 0.2 Decision Point

| Symptom | Action |
|---------|--------|
| Single service degraded | Wait & monitor, do NOT activate DR |
| Multiple services down, Azure confirms outage | **Proceed to Phase 1** |
| Cannot access any primary resources | **Proceed to Phase 1** |
| Intermittent issues | Wait 15 min, reassess |

**DECISION**: [ ] Activate DR / [ ] Continue monitoring

**Decision made by**: _________________ **Time**: _________

---

## Phase 1: Notification (5 min)

### 1.1 Notify Stakeholders

- [ ] **Notify incident commander / on-call lead**
  - Name: _________________
  - Contact: _________________
  - Time notified: _________

- [ ] **Create incident channel** (Slack/Teams)
  - Channel name: `#incident-dr-YYYY-MM-DD`
  - [ ] Add: Engineering lead
  - [ ] Add: Operations team
  - [ ] Add: Business stakeholders

- [ ] **Post initial status**
  ```
  🚨 DR ACTIVATION IN PROGRESS

  Issue: Primary region (eastus) unavailable
  Status: Activating DR in westus
  Impact: Service degraded/unavailable
  ETA: 30-60 minutes

  Updates will be posted here.
  ```

### 1.2 Document Incident Start

| Field | Value |
|-------|-------|
| Incident ID | INC-_______ |
| Start Time (UTC) | _________ |
| Detected By | _________ |
| Initial Symptoms | _________ |

---

## Phase 2: Environment Preparation (5 min)

### 2.1 Prepare Workstation

- [ ] **Open terminal / command prompt**

- [ ] **Navigate to project directory**
  ```bash
  cd /path/to/pulumi-cloud-native-enterprise-platform
  ```

- [ ] **Verify Azure CLI login**
  ```bash
  az account show --query "{Name:name,ID:id}" -o table
  ```
  - [ ] Correct subscription? If not:
    ```bash
    az login
    az account set --subscription "YOUR_SUBSCRIPTION_ID"
    ```

- [ ] **Verify Pulumi CLI**
  ```bash
  pulumi version
  pulumi whoami
  ```
  - [ ] Logged in? If not:
    ```bash
    pulumi login
    ```

- [ ] **Pull latest code** (if needed)
  ```bash
  git pull origin main
  ```

### 2.2 Verify DR Scripts

- [ ] **Check scripts exist**
  ```bash
  ls -la scripts/03-disaster-recovery/
  ```
  Expected files:
  - [ ] `provision-dr-region.sh`
  - [ ] `restore-sql-database.sh`
  - [ ] `validate-dr.sh`
  - [ ] `failback.sh`

---

## Phase 3: Provision DR Infrastructure (15-25 min)

### 3.1 Preview Deployment (Optional but Recommended)

- [ ] **Run dry-run first**
  ```bash
  ./scripts/03-disaster-recovery/provision-dr-region.sh \
      --region westus \
      --env prod \
      --dry-run
  ```
  - [ ] Review output for any errors
  - [ ] Confirm resources to be created

### 3.2 Execute DR Provisioning

- [ ] **Start provisioning** ⏱️ Start time: _________
  ```bash
  ./scripts/03-disaster-recovery/provision-dr-region.sh \
      --region westus \
      --env prod \
      --skip-sql-restore \
      --yes
  ```

- [ ] **Monitor progress**
  - Infrastructure provisioning typically takes 15-25 minutes
  - Watch for any errors in output

- [ ] **Record completion** ⏱️ End time: _________
  - [ ] Resource Group created
  - [ ] VNet created
  - [ ] AKS cluster created
  - [ ] SQL Server created
  - [ ] Key Vault created
  - [ ] Log Analytics created

### 3.3 Capture Outputs

- [ ] **Record deployment outputs**
  ```bash
  cd stacks/02-platform-services
  pulumi stack select prod-westus
  pulumi stack output
  ```

  | Output | Value |
  |--------|-------|
  | resourceGroupNameOutput | |
  | aksClusterName | |
  | sqlServerName_output | |
  | sqlServerFqdn | |
  | keyVaultName | |
  | vnetName | |

---

## Phase 4: Restore Database (10-30 min)

### 4.1 Execute SQL Restore

- [ ] **Start SQL restore** ⏱️ Start time: _________
  ```bash
  ./scripts/03-disaster-recovery/restore-sql-database.sh \
      --region westus \
      --env prod \
      --yes
  ```

  **OR manually via Azure Portal:**
  1. [ ] Go to: `portal.azure.com`
  2. [ ] Navigate to: SQL Server > `sql-platform-prod-westus`
  3. [ ] Click: "Import database" or "Create database"
  4. [ ] Select: "Backup" > Choose geo-redundant backup from eastus
  5. [ ] Database name: `shared-tenant-db`
  6. [ ] Click: "OK" to start restore

- [ ] **Monitor restore progress**
  ```bash
  # Check database status
  az sql db show \
      --server sql-platform-prod-westus \
      --resource-group rg-platform-prod-westus \
      --name shared-tenant-db \
      --query "{Name:name,Status:status}" -o table
  ```
  - Status should change: `Creating` → `Online`

- [ ] **Record completion** ⏱️ End time: _________
  - [ ] Database status: `Online`

### 4.2 Verify Database

- [ ] **Test database connectivity**
  ```bash
  # Get connection string
  SQL_FQDN=$(az sql server show \
      -n sql-platform-prod-westus \
      -g rg-platform-prod-westus \
      --query fullyQualifiedDomainName -o tsv)

  echo "SQL Server FQDN: $SQL_FQDN"
  ```

- [ ] **Note data loss window**
  - Backup timestamp: _________
  - Data loss period: _________ to _________

---

## Phase 5: Validate DR Deployment (5 min)

### 5.1 Run Validation Script

- [ ] **Execute validation**
  ```bash
  ./scripts/03-disaster-recovery/validate-dr.sh \
      --region westus \
      --env prod \
      --verbose
  ```

- [ ] **Review results**
  | Check | Status |
  |-------|--------|
  | Resource Group | [ ] Pass / [ ] Fail |
  | AKS Cluster | [ ] Pass / [ ] Fail |
  | SQL Server | [ ] Pass / [ ] Fail |
  | SQL Database | [ ] Pass / [ ] Fail |
  | Key Vault | [ ] Pass / [ ] Fail |
  | Virtual Network | [ ] Pass / [ ] Fail |
  | Log Analytics | [ ] Pass / [ ] Fail |

### 5.2 Get AKS Credentials

- [ ] **Configure kubectl**
  ```bash
  az aks get-credentials \
      --name aks-platform-prod-westus \
      --resource-group rg-platform-prod-westus \
      --overwrite-existing
  ```

- [ ] **Verify cluster access**
  ```bash
  kubectl get nodes
  kubectl get namespaces
  ```
  - [ ] Nodes are `Ready`?

---

## Phase 6: Deploy Applications (5-15 min)

### 6.1 Deploy Application Workloads

Choose your deployment method:

**Option A: GitOps (ArgoCD/Flux)**
- [ ] Sync applications to new cluster
  ```bash
  # If using ArgoCD
  argocd app sync --all
  ```

**Option B: Helm**
- [ ] Deploy via Helm
  ```bash
  helm upgrade --install <app-name> ./charts/<app> \
      --namespace <namespace> \
      --set sql.server=sql-platform-prod-westus.database.windows.net
  ```

**Option C: kubectl**
- [ ] Apply manifests
  ```bash
  kubectl apply -f k8s-manifests/ --recursive
  ```

### 6.2 Update Application Configuration

- [ ] **Update database connection strings**
  - Old: `sql-platform-prod-eastus.database.windows.net`
  - New: `sql-platform-prod-westus.database.windows.net`

- [ ] **Update any hardcoded region references**

- [ ] **Restart deployments to pick up changes**
  ```bash
  kubectl rollout restart deployment -n <namespace>
  ```

### 6.3 Verify Applications

- [ ] **Check pod status**
  ```bash
  kubectl get pods -A | grep -v Running
  ```
  - [ ] All pods running?

- [ ] **Check application logs**
  ```bash
  kubectl logs -f deployment/<app-name> -n <namespace> --tail=50
  ```
  - [ ] No critical errors?

---

## Phase 7: Update Traffic Routing (5-10 min)

### 7.1 Get New Endpoints

- [ ] **Get AKS ingress IP**
  ```bash
  kubectl get svc -n ingress-nginx ingress-nginx-controller \
      -o jsonpath='{.status.loadBalancer.ingress[0].ip}'
  ```
  New IP: _________________

### 7.2 Update DNS / Traffic Manager

**Option A: Azure DNS**
- [ ] **Update DNS records**
  ```bash
  # Update A record
  az network dns record-set a update \
      --resource-group <dns-rg> \
      --zone-name yourdomain.com \
      --name api \
      --set aRecords[0].ipv4Address=<NEW_IP>
  ```

**Option B: External DNS Provider**
- [ ] Log into DNS provider (Cloudflare, Route53, etc.)
- [ ] Update A/CNAME records to point to new IP
- [ ] Set TTL to minimum (if not already)

**Option C: Azure Front Door (if configured)**
- [ ] Update origin to DR endpoints
- [ ] Or adjust priority/weight

### 7.3 Verify DNS Propagation

- [ ] **Check DNS resolution**
  ```bash
  # Check from multiple locations
  nslookup api.yourdomain.com
  dig api.yourdomain.com
  ```
  - [ ] Resolves to new IP?

- [ ] **Test endpoint**
  ```bash
  curl -v https://api.yourdomain.com/health
  ```
  - [ ] Returns 200 OK?

---

## Phase 8: Verification & Monitoring (10 min)

### 8.1 Smoke Tests

- [ ] **Test critical user flows**
  | Test | Status |
  |------|--------|
  | User login | [ ] Pass / [ ] Fail |
  | Data retrieval | [ ] Pass / [ ] Fail |
  | Data creation | [ ] Pass / [ ] Fail |
  | API responses | [ ] Pass / [ ] Fail |

### 8.2 Enable Monitoring

- [ ] **Verify Log Analytics is receiving data**
  ```bash
  az monitor log-analytics workspace show \
      -n log-platform-prod-westus \
      -g rg-platform-prod-westus \
      --query customerId -o tsv
  ```

- [ ] **Check Azure Monitor**
  - Go to: Azure Portal > Monitor > Metrics
  - Select DR resource group
  - Verify metrics are flowing

### 8.3 Set Up Alerts (if not auto-configured)

- [ ] **Create or verify alerts for DR region**

---

## Phase 9: Communication & Documentation (5 min)

### 9.1 Notify Stakeholders

- [ ] **Post recovery status**
  ```
  ✅ DR ACTIVATION COMPLETE

  Status: Service restored in DR region (westus)
  Time to Recovery: XX minutes
  Data Loss Window: [timestamp] to [timestamp]

  Known Issues:
  - [List any known issues]

  Next Steps:
  - Continue monitoring
  - Plan failback when primary recovers
  ```

- [ ] **Notify external parties** (if applicable)
  - [ ] Customers
  - [ ] Partners
  - [ ] Status page update

### 9.2 Document Incident

- [ ] **Complete incident record**

  | Field | Value |
  |-------|-------|
  | Incident ID | INC-_______ |
  | Start Time (UTC) | |
  | DR Activated (UTC) | |
  | Service Restored (UTC) | |
  | Total Downtime | |
  | Data Loss Window | |
  | Primary Region | eastus |
  | DR Region | westus |
  | Activated By | |
  | Commands Run | [attach log] |
  | Issues Encountered | |

---

## Post-DR Tasks

### Ongoing Monitoring

- [ ] **Monitor DR region for next 24-48 hours**
- [ ] **Check for data consistency issues**
- [ ] **Review application logs for errors**

### Prepare for Failback

- [ ] **Monitor primary region recovery**
  ```bash
  # Check Azure status
  az group show -n rg-platform-prod-eastus
  ```

- [ ] **When primary is healthy, plan failback**
  - See: `docs/runbooks/dr-failback-checklist.md`

---

## Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| Pulumi state locked | `pulumi cancel` then retry |
| AKS provisioning slow | Wait, check Azure status for capacity issues |
| SQL restore fails | Try manual restore via Azure Portal |
| DNS not propagating | Check TTL, try flushing local DNS cache |
| Pods not starting | Check logs: `kubectl describe pod <pod>` |

### Emergency Contacts

| Role | Name | Contact |
|------|------|---------|
| Incident Commander | | |
| Platform Lead | | |
| Database Admin | | |
| Network Admin | | |
| Azure Support | | [Azure Support Portal] |

---

## Appendix: Command Reference

### Quick Commands

```bash
# Full DR activation (one command)
./scripts/03-disaster-recovery/provision-dr-region.sh \
    --region westus --env prod --yes

# Validate DR
./scripts/03-disaster-recovery/validate-dr.sh \
    --region westus --env prod

# Get AKS credentials
az aks get-credentials -n aks-platform-prod-westus \
    -g rg-platform-prod-westus

# Check all pods
kubectl get pods -A

# Failback (when ready)
./scripts/03-disaster-recovery/failback.sh \
    --primary-region eastus --dr-region westus --env prod
```

---

**Document Version**: 1.0
**Print Date**: ____________
**Reviewed By**: ____________
