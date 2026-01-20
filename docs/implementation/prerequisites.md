# Prerequisites

Required tools, permissions, and accounts before deployment.

## Required Tools

| Tool | Version | Purpose |
|------|---------|---------|
| Azure CLI | 2.50+ | Azure authentication and management |
| Pulumi CLI | 3.0+ | Infrastructure as Code |
| Node.js | 18+ | Runtime for Pulumi TypeScript |
| pnpm | 8+ | Package manager |
| jq | 1.6+ | JSON processing in scripts |

### Check All Prerequisites

```bash
./scripts/00-prerequisites/check-prerequisites.sh
```

### Install Missing Tools

```bash
./scripts/00-prerequisites/install-tools.sh
```

## Azure Permissions

### For Bootstrap (Management Groups)

Required role at **Tenant Root** level:
- `Management Group Contributor` or
- `Owner` at tenant root

### For Platform Deployment

Required roles at **Subscription** level:
- `Owner` or `Contributor` + `User Access Administrator`

### For Workload Deployment

Required roles at **Subscription** level:
- `Contributor` (for resources)
- `User Access Administrator` (for RBAC, optional)

### Validate Permissions

```bash
./scripts/01-azure-setup/validate-permissions.sh
```

## Azure Accounts

### Pay-As-You-Go (Default)

Requirements:
1. Azure account with active subscription(s)
2. Subscription IDs for: Management, Connectivity, (optional) Identity
3. Permissions as listed above

```bash
# Get your subscription IDs
az account list --output table
```

### Enterprise Agreement

Requirements:
1. EA enrollment with Owner/Contributor access
2. Enrollment Account ID for subscription creation
3. Permissions as listed above

```bash
# Get enrollment account ID
./scripts/01-azure-setup/get-enrollment-account.sh
```

### Microsoft Customer Agreement

Requirements:
1. MCA billing account access
2. Billing profile and invoice section names
3. Permissions as listed above

## Pulumi Setup

### Backend Configuration

Choose a state backend:

**Pulumi Cloud (Recommended)**
```bash
pulumi login
```

**Azure Blob Storage**
```bash
pulumi login azblob://<container-name>?storage_account=<account-name>
```

**Local (Development only)**
```bash
pulumi login --local
```

### Create Pulumi Account

If using Pulumi Cloud:
1. Go to https://app.pulumi.com
2. Sign up / Sign in
3. Create organization (optional)

## Network Requirements

If deploying from restricted network:

| Endpoint | Purpose |
|----------|---------|
| `management.azure.com` | Azure Resource Manager |
| `login.microsoftonline.com` | Azure AD authentication |
| `api.pulumi.com` | Pulumi Cloud (if used) |
| `registry.npmjs.org` | npm packages |

## Configuration File

Create initial configuration:

```bash
# Copy example
cp config/examples/minimal-payg-single.yaml config/landing-zone.yaml

# Edit with your values
# Required: subscription IDs (for PAYG)
```

## Checklist

Before proceeding:

- [ ] All tools installed (`check-prerequisites.sh` passes)
- [ ] Azure CLI logged in (`az account show` works)
- [ ] Pulumi CLI logged in (`pulumi whoami` works)
- [ ] Required permissions validated
- [ ] Subscription IDs collected (for PAYG)
- [ ] Configuration file created

## Next Steps

Once prerequisites are complete:
- [Bootstrap Guide](./bootstrap-guide.md)
