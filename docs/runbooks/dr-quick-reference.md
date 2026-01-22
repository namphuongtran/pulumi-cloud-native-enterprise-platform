# DR Quick Reference Card

> **Print this page and keep it accessible for emergencies.**

---

## Emergency DR Activation (30-60 min)

```bash
# 1. Navigate to project
cd /path/to/pulumi-cloud-native-enterprise-platform

# 2. Login to Azure (if needed)
az login

# 3. Run DR provisioning
./scripts/03-disaster-recovery/provision-dr-region.sh \
    --region westus \
    --env prod \
    --yes

# 4. Validate deployment
./scripts/03-disaster-recovery/validate-dr.sh \
    --region westus \
    --env prod

# 5. Get AKS credentials
az aks get-credentials \
    -n aks-platform-prod-westus \
    -g rg-platform-prod-westus

# 6. Deploy apps
kubectl apply -f k8s-manifests/ --recursive

# 7. Update DNS to DR IP
# (Use your DNS provider or Azure DNS)
```

---

## Key Information

| Item | Primary (eastus) | DR (westus) |
|------|------------------|-------------|
| Resource Group | `rg-platform-prod-eastus` | `rg-platform-prod-westus` |
| AKS Cluster | `aks-platform-prod-eastus` | `aks-platform-prod-westus` |
| SQL Server | `sql-platform-prod-eastus` | `sql-platform-prod-westus` |
| SQL FQDN | `sql-platform-prod-eastus.database.windows.net` | `sql-platform-prod-westus.database.windows.net` |

---

## Quick Commands

| Task | Command |
|------|---------|
| Check Azure status | `https://status.azure.com/` |
| Check AKS health | `az aks show -n aks-platform-prod-eastus -g rg-platform-prod-eastus --query provisioningState` |
| Check SQL health | `az sql server show -n sql-platform-prod-eastus -g rg-platform-prod-eastus --query state` |
| Get pods | `kubectl get pods -A` |
| Get pod logs | `kubectl logs -f deployment/<name> -n <namespace>` |

---

## Escalation

| Role | Contact |
|------|---------|
| On-Call | _____________ |
| Platform Lead | _____________ |
| Database Admin | _____________ |
| Azure Support | https://portal.azure.com/#blade/Microsoft_Azure_Support |

---

## Checklist Summary

### Activate DR
- [ ] Confirm outage (Azure status + resource checks)
- [ ] Notify stakeholders
- [ ] Run `provision-dr-region.sh`
- [ ] Run `restore-sql-database.sh`
- [ ] Run `validate-dr.sh`
- [ ] Deploy applications
- [ ] Update DNS
- [ ] Verify traffic flowing

### Failback
- [ ] Verify primary healthy
- [ ] Sync data from DR to primary
- [ ] Deploy apps to primary
- [ ] Update DNS to primary
- [ ] Verify traffic flowing
- [ ] (Optional) Destroy DR resources

---

## Document Locations

- Full DR Activation Checklist: `docs/runbooks/dr-activation-checklist.md`
- Full Failback Checklist: `docs/runbooks/dr-failback-checklist.md`
- DR Architecture: `docs/architecture/disaster-recovery.md`
- DR Scripts: `scripts/03-disaster-recovery/`

---

**RTO Target**: 30-60 minutes | **RPO Target**: 1-24 hours

**Last Updated**: 2024-01-22
