# Azure Landing Zone - User Guide

A step-by-step guide to deploy an enterprise-scale Azure Landing Zone using Pulumi TypeScript.

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Project Structure](#project-structure)
4. [Prerequisites](#prerequisites)
5. [Quick Start (Script-Based)](#quick-start-script-based---recommended)
6. [Deployment Workflows](#deployment-workflows)
7. [Manual Deployment](#manual-deployment-alternative)
8. [Deployment Phases](#deployment-phases)
9. [Configuration](#configuration)
10. [Environment Types](#environment-types)
11. [Cluster Isolation Strategies](#cluster-isolation-strategies)
12. [Blue/Green Deployments](#bluegreen-deployments)
13. [PR Preview Environments](#pr-preview-environments)
14. [Common Operations](#common-operations)
15. [Troubleshooting](#troubleshooting)

---

## Overview

This project implements Microsoft's Cloud Adoption Framework (CAF) Azure Landing Zone architecture using Pulumi Infrastructure as Code.

### What You'll Deploy

```mermaid
graph TB
    subgraph "Azure Tenant"
        subgraph "Management Groups"
            ROOT[Landing Zone Root]
            PLAT[Platform]
            LZ[Landing Zones]
            SB[Sandbox]

            ROOT --> PLAT
            ROOT --> LZ
            ROOT --> SB

            PLAT --> MGMT[Management]
            PLAT --> CONN[Connectivity]

            LZ --> CORP[Corp]
            LZ --> ONLINE[Online]
        end

        subgraph "Platform Subscription"
            LOG[Log Analytics]
            KV[Key Vault]
            AKS[AKS Cluster]
            SQL[SQL Server]
            VNET[Virtual Network]
        end

        subgraph "Workload Subscriptions"
            APP1[Tenant A Resources]
            APP2[Tenant B Resources]
        end
    end

    MGMT -.-> LOG
    CONN -.-> VNET
    CORP -.-> APP1
    CORP -.-> APP2
```

---

## Architecture

### Deployment Flow

The deployment follows 4 sequential phases:

```mermaid
flowchart LR
    subgraph "Phase 0"
        P0[State Backend]
    end

    subgraph "Phase 1"
        P1A[Management Groups]
        P1B[Policies]
    end

    subgraph "Phase 2"
        P2[Platform Services]
    end

    subgraph "Phase 3"
        P3[Application Services]
    end

    P0 --> P1A --> P1B --> P2 --> P3

    style P0 fill:#e1f5fe
    style P1A fill:#fff3e0
    style P1B fill:#fff3e0
    style P2 fill:#e8f5e9
    style P3 fill:#fce4ec
```

### Phase Summary

| Phase | Stack | Purpose | Dependencies |
|-------|-------|---------|--------------|
| 0 | `00-state-backend` | Pulumi state storage | None |
| 1a | `01-bootstrap/management-groups` | Management group hierarchy | Phase 0 |
| 1b | `01-bootstrap/policies` | Azure Policy assignments | Phase 1a |
| 2 | `02-platform-services` | Shared infrastructure (AKS, SQL, VNet) | Phase 1 |
| 2.5 | `03-services-addons` | Kubernetes add-ons (Grafana, Kyverno) | Phase 2 |
| 3 | `04-application-services` | Per-tenant resources | Phase 2.5 |

### State Management Strategy

This project uses **Option A: Two-tier state management**:

```
┌─────────────────────────────────────────────────────────────────────┐
│                     STATE MANAGEMENT ARCHITECTURE                   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  LOCAL STATE (~/.pulumi-local/)     AZURE BLOB STATE               │
│  ┌─────────────────────────────┐    ┌─────────────────────────────┐│
│  │  00-state-backend           │    │  01-bootstrap               ││
│  │  └── dev-eastus.json        │    │  02-platform-services       ││
│  │                             │    │  03-services-addons         ││
│  │  (Bootstrap state - small,  │    │  04-application-services    ││
│  │   rarely changes, backup!)  │    │                             ││
│  └─────────────────────────────┘    │  (Production state - all    ││
│               │                     │   other phases)             ││
│               │ creates             └─────────────────────────────┘│
│               └──────────────────────────────────►                 │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

**Why this approach?**
- Phase 0 creates Azure Storage Account for state storage
- We can't store Phase 0's state in storage that doesn't exist yet (chicken-and-egg)
- After Phase 0 completes, all other phases use Azure Blob
- Local state is small (~few KB), rarely changes, acts as bootstrap recovery key

**Important:** Backup `~/.pulumi-local/` directory - it's needed to manage Phase 0.

---

## Project Structure

```
pulumi-cloud-native-enterprise-platform/
│
├── packages/
│   └── core/                          # Shared TypeScript library
│       └── lib/
│           ├── naming.ts              # Resource naming functions
│           ├── tagging.ts             # Tagging functions
│           ├── interfaces.ts          # Type definitions
│           └── config/                # Configuration loader
│               ├── schema.ts          # Config interfaces
│               └── loader.ts          # YAML loader
│
├── stacks/                            # Pulumi stacks (deployable units)
│   │
│   ├── 00-state-backend/              # Phase 0: State storage
│   │   ├── index.ts
│   │   ├── Pulumi.yaml
│   │   └── package.json
│   │
│   ├── 01-bootstrap/                  # Phase 1: Bootstrap
│   │   ├── management-groups/         # Management group hierarchy
│   │   │   ├── index.ts
│   │   │   ├── management-groups.ts   # MG component
│   │   │   └── Pulumi.yaml
│   │   │
│   │   └── policies/                  # Azure Policy assignments
│   │       ├── index.ts
│   │       ├── policy-definitions.ts  # Policy definitions
│   │       ├── policy-assignments.ts  # Assignment component
│   │       └── Pulumi.yaml
│   │
│   ├── 02-platform-services/          # Phase 2: Platform infrastructure
│   │   ├── index.ts                   # VNet, AKS, SQL, KeyVault
│   │   └── Pulumi.yaml
│   │
│   ├── 03-services-addons/            # Phase 2.5: Kubernetes add-ons
│   │   ├── index.ts                   # Grafana, Kyverno, monitoring
│   │   └── Pulumi.yaml
│   │
│   └── 04-application-services/       # Phase 3: Tenant resources
│       ├── index.ts                   # Per-tenant KeyVault, DB, identity
│       └── Pulumi.yaml
│
├── config/                            # Configuration files
│   └── examples/
│       ├── minimal-payg-single.yaml   # Simple PAYG setup
│       ├── enterprise-ea-multi.yaml   # Enterprise multi-region
│       ├── development-local.yaml     # Development setup
│       ├── blue-green-production.yaml # Blue/Green deployment
│       ├── pr-preview-environment.yaml # PR preview environments
│       └── shared-cluster-cost-optimized.yaml # Shared cluster pattern
│
├── scripts/                           # Automation scripts
│   ├── 00-prerequisites/              # Tools, Azure login, checks
│   ├── 01-azure-setup/                # Azure-specific setup (subscriptions, permissions)
│   ├── 02-state-management/           # Pulumi deployment orchestration
│   └── 99-utilities/                  # Common utilities
│
└── docs/                              # Documentation
```

### Stack Dependencies

```mermaid
graph TD
    STATE[00-state-backend]
    MG[01-bootstrap/management-groups]
    POL[01-bootstrap/policies]
    PLAT[02-platform-services]
    SVC[03-services-addons]
    APP[04-application-services]

    STATE --> MG
    MG --> POL
    POL --> PLAT
    PLAT --> SVC
    SVC --> APP

    style STATE fill:#e3f2fd
    style MG fill:#fff8e1
    style POL fill:#fff8e1
    style PLAT fill:#e8f5e9
    style SVC fill:#e0f7fa
    style APP fill:#fce4ec
```

---

## Prerequisites

### Required Tools

| Tool | Version | Installation |
|------|---------|--------------|
| Node.js | >= 18 | [nodejs.org](https://nodejs.org) |
| pnpm | >= 8 | `npm install -g pnpm` |
| Pulumi CLI | >= 3 | [pulumi.com/docs/install](https://www.pulumi.com/docs/install/) |
| Azure CLI | >= 2.50 | [docs.microsoft.com](https://docs.microsoft.com/cli/azure/install-azure-cli) |

### Azure Permissions

| Phase | Required Role |
|-------|--------------|
| 0 (State) | Contributor on subscription |
| 1 (Bootstrap) | Management Group Contributor at tenant root |
| 2 (Platform) | Owner on platform subscription |
| 3 (Application) | Contributor on workload subscription |

### Verify Prerequisites

```bash
# Check Node.js
node --version  # Should be >= 18

# Check pnpm
pnpm --version  # Should be >= 8

# Check Pulumi
pulumi version  # Should be >= 3

# Check Azure CLI and login
az --version
az login
az account show
```

---

## Quick Start (Script-Based - Recommended)

The recommended way to deploy the landing zone is using automation scripts. These handle state management switching automatically.

### 1. Clone and Setup

```bash
# Clone repository
git clone <repository-url>
cd pulumi-cloud-native-enterprise-platform

# Install dependencies
pnpm install

# Build all packages
pnpm -r build
```

### 2. Check Prerequisites

```bash
# Check all required tools are installed
./scripts/00-prerequisites/check-prerequisites.sh

# Install missing tools (macOS/Linux)
./scripts/00-prerequisites/install-tools.sh

# Login to Azure
./scripts/00-prerequisites/azure-login.sh
```

### 3. Configure Subscriptions

```bash
# Interactive subscription setup
# - Lists your existing subscriptions
# - Validates subscription IDs
# - Registers required resource providers
# - Generates configuration file
./scripts/01-azure-setup/create-subscriptions-payg.sh
```

> **Note:** PAYG subscriptions must be created through Azure Portal (Azure limitation). The script helps configure them after creation.

### 4. Deploy All Phases

```bash
# Deploy everything (Phase 0 through Phase 3)
./scripts/02-state-management/deploy-all.sh --include-phase0

# Or with options:
./scripts/02-state-management/deploy-all.sh --include-phase0 --env prod --region westus --yes
```

### 5. Verify Deployment

```bash
# Check current Pulumi backend
pulumi whoami -v

# List deployed stacks
pulumi stack ls
```

### Available Deployment Scripts

| Script | Description |
|--------|-------------|
| `deploy-phase0.sh` | Deploy Phase 0 with local state |
| `switch-to-azure-state.sh` | Switch Pulumi to Azure Blob state |
| `deploy-all.sh` | Deploy all phases (1-3 by default) |
| `deploy-all.sh --include-phase0` | Deploy all phases including Phase 0 |
| `destroy-all.sh` | Destroy all phases in reverse order |

### Script Options

```bash
./scripts/02-state-management/deploy-all.sh --help

Options:
  --phase PHASE      Deploy specific phase: phase0, bootstrap, platform, workloads, all
  --include-phase0   Include Phase 0 in 'all' deployment
  --env ENV          Environment name (default: dev)
  --region REGION    Azure region (default: eastus)
  --dry-run          Preview changes without deploying
  --yes, -y          Skip confirmation prompts
```

---

## Deployment Workflows

This project supports two deployment workflows: **Script-Based** (for teams) and **Manual** (for learning/debugging). Choose the approach that fits your needs.

### Scripts Folder Organization

```
scripts/
├── 00-prerequisites/              # Tools & Azure login
│   ├── check-prerequisites.sh     # Verify all tools installed
│   ├── install-tools.sh           # Install missing tools
│   └── azure-login.sh             # Azure CLI authentication
│
├── 01-azure-setup/                # Azure-specific setup
│   ├── get-enrollment-account.sh  # EA enrollment (Enterprise only)
│   ├── create-subscriptions-payg.sh # PAYG subscription config
│   └── validate-permissions.sh    # Check Azure permissions
│
├── 02-state-management/           # Pulumi deployment orchestration
│   ├── deploy-phase0.sh           # Deploy state backend (local state)
│   ├── switch-to-azure-state.sh   # Switch to Azure Blob state
│   ├── deploy-all.sh              # Orchestrate all phases
│   ├── deploy-workload.sh         # Deploy individual workload
│   └── destroy-all.sh             # Cleanup all phases
│
└── 99-utilities/
    ├── common.sh                  # Shared functions
    └── validate-config.sh         # Configuration validation
```

### Team Workflow (Using Scripts) - Recommended

When working as a team, use the automation scripts. **Team members do not need to run Pulumi commands manually.**

```bash
# Developer just runs:
./scripts/02-state-management/deploy-all.sh --include-phase0 --env dev --region eastus --yes
```

**What the script automatically handles:**

| Step | Action | Manual Equivalent |
|------|--------|-------------------|
| 1 | Creates local state directory (`~/.pulumi-local/`) | `mkdir -p ~/.pulumi-local` |
| 2 | Logs into local state for Phase 0 | `pulumi login file://~/.pulumi-local` |
| 3 | Deploys state backend (Storage Account) | `pulumi up` in `stacks/00-state-backend` |
| 4 | Switches to Azure Blob state | `pulumi logout && pulumi login azblob://...` |
| 5 | Deploys all remaining phases in correct order | Multiple `pulumi up` commands |
| 6 | Saves state info for future use | Export environment variables |

**Benefits for teams:**
- ✅ Consistent deployment across all team members
- ✅ No manual errors (forgetting to switch state backend)
- ✅ New team members can deploy without deep knowledge
- ✅ Ready for CI/CD pipelines (GitHub Actions, Azure DevOps)

**Team commands:**

```bash
# First time setup (includes Phase 0)
./scripts/02-state-management/deploy-all.sh --include-phase0

# Daily deployments (Phase 1-3 only, Phase 0 already exists)
./scripts/02-state-management/deploy-all.sh

# Deploy specific phase
./scripts/02-state-management/deploy-all.sh --phase platform

# Add new workload/tenant
./scripts/02-state-management/deploy-workload.sh --tenant acme

# Destroy everything
./scripts/02-state-management/destroy-all.sh --include-phase0
```

### Manual Workflow (Using Pulumi Commands)

For learning, debugging, or when you need full control over each step.

**Benefits for learning/debugging:**
- ✅ Understand each step deeply
- ✅ Full control over what happens
- ✅ Debug issues more easily
- ✅ Customize individual deployments

See the [Manual Deployment](#manual-deployment-alternative) section below for step-by-step commands.

### Workflow Decision Matrix

| Scenario | Use Scripts? | Run Pulumi Manually? |
|----------|-------------|---------------------|
| **Team deployment** | ✅ Yes | ❌ No |
| **CI/CD pipeline** | ✅ Yes | ❌ No |
| **Learning/Understanding** | ❌ No | ✅ Yes |
| **Debugging issues** | ❌ No | ✅ Yes |
| **First-time setup** | Either | Either |
| **Production deployment** | ✅ Yes | ❌ No |

### Understanding What Scripts Handle

The `02-state-management` scripts handle the complexity of **two-tier state management**:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    SCRIPT AUTOMATION FLOW                                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  PHASE 0 (deploy-phase0.sh)          PHASE 1-3 (deploy-all.sh)         │
│  ┌─────────────────────────┐         ┌─────────────────────────┐       │
│  │ 1. Create ~/.pulumi-local│         │ 4. Read state backend   │       │
│  │ 2. pulumi login file://  │ ──────► │    info from Phase 0    │       │
│  │ 3. Deploy storage account│         │ 5. Get storage key      │       │
│  │    (creates Azure Blob)  │         │ 6. pulumi login azblob  │       │
│  └─────────────────────────┘         │ 7. Deploy all stacks    │       │
│         LOCAL STATE                   └─────────────────────────┘       │
│                                              AZURE BLOB STATE           │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

**Key insight:** You don't need to understand state backend switching if you use the scripts. The scripts handle:
- Which state backend each phase uses (local vs Azure Blob)
- The correct deployment order
- Environment variable setup
- Error handling and validation

---

## Manual Deployment (Alternative)

If you prefer manual control over each step, follow this guide.

### 1. Create Configuration

```bash
# Copy example configuration
cp config/examples/minimal-payg-single.yaml config/landing-zone.yaml

# Edit with your values (use your subscription ID from `az account show`)
# - platform.organization.name: your-org-name
# - platform.billing.subscriptions.management: your-subscription-id
# - platform.region.primary: eastus (or your preferred region)
```

### 2. Deploy Phase 0: State Backend (Local State)

Phase 0 uses local state to bootstrap the Azure Storage Account.

```bash
# Create local state directory
mkdir -p ~/.pulumi-local

# Login to local state (for Phase 0 only)
pulumi login file://~/.pulumi-local

# Deploy state backend
cd stacks/00-state-backend
pulumi stack init dev-eastus
pulumi config set azure-native:location eastus
pulumi up

# Verify outputs
pulumi stack output storageAccountName
pulumi stack output containerName
```

### 3. Switch to Azure Blob State

After Phase 0 creates the storage account, switch to Azure Blob for all remaining phases.

```bash
# Get storage account details (still in 00-state-backend directory)
export STORAGE_ACCOUNT=$(pulumi stack output storageAccountName)
export CONTAINER_NAME=$(pulumi stack output containerName)

# Get storage account key for authentication
export AZURE_STORAGE_KEY=$(az storage account keys list \
  --account-name $STORAGE_ACCOUNT \
  --query '[0].value' -o tsv)

# Switch Pulumi to Azure Blob backend
cd ..  # Back to stacks/
pulumi logout
pulumi login azblob://${STORAGE_ACCOUNT}/${CONTAINER_NAME}
```

### 4. Deploy Remaining Phases (Azure Blob State)

All subsequent phases use Azure Blob for state storage.

```bash
# Phase 1a: Management Groups
cd 01-bootstrap/management-groups
pulumi stack init bootstrap
pulumi up

# Phase 1b: Policies
cd ../policies
pulumi stack init bootstrap-policies
pulumi up

# Phase 2: Platform Services
cd ../../02-platform-services
pulumi stack init dev-eastus
pulumi config set azure-native:location eastus
pulumi config set infrastructure:environment dev
pulumi config set --secret sql:adminPassword <your-secure-password>
pulumi up

# Phase 2.5: Services Add-ons
cd ../03-services-addons
pulumi stack init dev-eastus
pulumi config set infrastructure:environment dev
pulumi config set infrastructure:location eastus
pulumi up

# Phase 3: Application Services (per tenant)
cd ../04-application-services
pulumi stack init acme-prod-eastus
pulumi config set azure-native:location eastus
pulumi config set infrastructure:tenantId acme
pulumi config set infrastructure:environment prod
pulumi up
```

---

## Deployment Phases

### Phase 0: State Backend

**Purpose:** Create secure storage for Pulumi state files.

**What it creates:**
- Resource Group (`rg-state-{env}`)
- Storage Account (`ststate{env}`)
- Blob Container for state

```mermaid
graph LR
    subgraph "Phase 0 Resources"
        RG[Resource Group]
        SA[Storage Account]
        BC[Blob Container]

        RG --> SA --> BC
    end
```

**Deploy:**

```bash
cd stacks/00-state-backend
pulumi stack init dev-eastus
pulumi config set azure-native:location eastus
pulumi up
```

**Outputs:**
- `stateBackendUrl` - Use this for subsequent stacks

---

### Phase 1a: Management Groups

**Purpose:** Create the management group hierarchy for governance.

**What it creates:**

```mermaid
graph TD
    ROOT["{org} Landing Zone"]

    ROOT --> PLATFORM["{org}-platform"]
    ROOT --> LZ["{org}-landingzones"]
    ROOT --> SANDBOX["{org}-sandbox"]
    ROOT --> DECOM["{org}-decommissioned"]

    PLATFORM --> MGMT["{org}-management"]
    PLATFORM --> CONN["{org}-connectivity"]
    PLATFORM --> ID["{org}-identity"]

    LZ --> CORP["{org}-corp"]
    LZ --> ONLINE["{org}-online"]

    style ROOT fill:#1976d2,color:#fff
    style PLATFORM fill:#388e3c,color:#fff
    style LZ fill:#f57c00,color:#fff
```

**Deploy:**

```bash
cd stacks/01-bootstrap/management-groups
pulumi stack init bootstrap
pulumi up
```

**Configuration options:**

```yaml
# In config/landing-zone.yaml
platform:
  organization:
    name: contoso              # Prefix for all MGs
    displayName: Contoso Corp
  managementGroups:
    includeIdentity: false     # Skip identity MG
    includeSandbox: true       # Include sandbox
    includeDecommissioned: true
```

---

### Phase 1b: Policies

**Purpose:** Assign Azure Policies for governance and compliance.

**What it creates:**

```mermaid
graph TD
    subgraph "Policy Assignments by Scope"
        ROOT_POL["Root Policies<br/>- Allowed locations"]
        PLAT_POL["Platform Policies<br/>- Required tags"]
        LZ_POL["Landing Zone Policies<br/>- Security policies<br/>- AKS policies"]
        CORP_POL["Corp Policies<br/>- No public IPs<br/>- NSG required"]
        ONLINE_POL["Online Policies<br/>- Audit public IPs"]
    end

    ROOT_POL --> PLAT_POL
    ROOT_POL --> LZ_POL
    LZ_POL --> CORP_POL
    LZ_POL --> ONLINE_POL
```

**Deploy:**

```bash
cd stacks/01-bootstrap/policies
pulumi stack init bootstrap-policies
pulumi config set enforceMode true  # or false for audit-only
pulumi up
```

---

### Phase 2: Platform Services

**Purpose:** Deploy shared infrastructure for all workloads.

**What it creates:**

```mermaid
graph TB
    subgraph "Platform Services"
        RG[Resource Group]

        subgraph "Networking"
            VNET[Virtual Network]
            SUB_APP[App Subnet]
            SUB_DATA[Data Subnet]
            SUB_SYS[System Subnet]
            NSG[Network Security Group]
        end

        subgraph "Compute"
            AKS[AKS Cluster]
        end

        subgraph "Data"
            SQL[SQL Server]
            DB[Shared Database]
        end

        subgraph "Security"
            KV[Key Vault]
        end

        subgraph "Monitoring"
            LOG[Log Analytics]
        end

        RG --> VNET
        VNET --> SUB_APP & SUB_DATA & SUB_SYS
        SUB_APP --> NSG
        RG --> AKS
        RG --> SQL --> DB
        RG --> KV
        RG --> LOG
    end
```

**Deploy:**

```bash
cd stacks/02-platform-services
pulumi stack init dev-eastus
pulumi config set azure-native:location eastus
pulumi config set infrastructure:environment dev
pulumi config set --secret sql:adminPassword <secure-password>
pulumi up
```

**Key outputs:**
- `aksClusterId` - AKS cluster resource ID
- `kubeconfig` - Kubernetes configuration
- `keyVaultUri` - Key Vault URI
- `sqlServerFqdn` - SQL Server endpoint

---

### Phase 3: Application Services

**Purpose:** Deploy per-tenant resources.

**What it creates per tenant:**

```mermaid
graph TB
    subgraph "Tenant Resources"
        RG[Resource Group]
        KV[Key Vault]
        MI[Managed Identity]
        NS[K8s Namespace]
        DB[(Database)]

        RG --> KV
        RG --> MI
        MI --> KV
        MI --> NS
        RG --> DB
    end
```

**Deploy (for each tenant):**

```bash
cd stacks/04-application-services
pulumi stack init acme-prod-eastus
pulumi config set azure-native:location eastus
pulumi config set infrastructure:tenantId acme
pulumi config set infrastructure:environment prod
pulumi config set database:isolation isolated  # or "shared"
pulumi up
```

---

## Configuration

### Configuration File

Create `config/landing-zone.yaml`:

```yaml
platform:
  # Organization settings
  organization:
    name: contoso                    # Short name (max 10 chars)
    displayName: Contoso Corporation
    domain: contoso.com

  # Billing model
  billing:
    model: PAYG                      # PAYG | EA | MCA
    subscriptions:
      management: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
      connectivity: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"

  # Region configuration
  region:
    mode: single                     # single | multi
    primary: eastus
    # secondary: westus              # Required if mode: multi

  # Management groups
  managementGroups:
    root: contoso
    includeIdentity: false
    includeSandbox: true
    includeDecommissioned: true

  # Connectivity
  connectivity:
    architecture: hub-spoke          # hub-spoke | vwan
    firewall:
      enabled: true
      sku: Standard

  # Management
  management:
    logRetentionDays: 30
    enableDefender: false

# Workloads
workloads:
  defaults:
    computeType: aks
    tier: corp
    networkIsolation: true

  applications:
    - name: payment-service
      tier: corp
      database:
        enabled: true
        type: postgresql
```

### Environment-Specific Settings

| Environment | AKS Nodes | SQL SKU | Log Retention | Defender |
|-------------|-----------|---------|---------------|----------|
| dev | 1 | Basic | 7 days | Off |
| test | 2 | Basic | 14 days | Off |
| staging | 2 | S1 | 30 days | Off |
| prod | 3+ | S3+ | 365 days | On |
| pr-* | 1 | Basic | 1 day | Off |

---

## Environment Types

This platform supports multiple environment types for different stages of the software lifecycle.

### Available Environments

| Environment | Type | Criticality | Use Case |
|-------------|------|-------------|----------|
| `dev` | Persistent | Low | Development and experimentation |
| `test` | Persistent | Medium | QA and automated testing |
| `staging` | Persistent | Medium | Pre-production validation |
| `prod` | Persistent | Mission-critical | Production workloads |
| `prod-blue` | Persistent | Mission-critical | Blue/Green production slot |
| `prod-green` | Persistent | Mission-critical | Blue/Green production slot |
| `pr` | Ephemeral | Low | PR preview environments |

### Environment Hierarchy

```
                    ┌─────────────────────────────────────────┐
                    │            ENVIRONMENTS                  │
                    └─────────────────────────────────────────┘
                                      │
              ┌───────────────────────┴───────────────────────┐
              │                                               │
    ┌─────────▼─────────┐                       ┌─────────────▼─────────────┐
    │    PERSISTENT     │                       │        EPHEMERAL          │
    │   (Long-lived)    │                       │      (Short-lived)        │
    └─────────┬─────────┘                       └─────────────┬─────────────┘
              │                                               │
    ┌─────────┴─────────────────────┐                   ┌─────▼─────┐
    │                               │                   │   pr-*    │
┌───▼───┐  ┌───────┐  ┌─────────┐  ┌▼──────────────┐    │ pr-123    │
│  dev  │  │ test  │  │ staging │  │     prod      │    │ pr-456    │
│       │  │       │  │         │  │ prod-blue     │    └───────────┘
│       │  │       │  │         │  │ prod-green    │
└───────┘  └───────┘  └─────────┘  └───────────────┘
```

### Deploying Different Environments

Each environment is deployed as a separate Pulumi stack:

```bash
# Development environment
cd stacks/02-platform-services
pulumi stack init dev-eastus
pulumi config set infrastructure:environment dev
pulumi up

# Test environment
pulumi stack init test-eastus
pulumi config set infrastructure:environment test
pulumi up

# Staging environment
pulumi stack init staging-eastus
pulumi config set infrastructure:environment staging
pulumi up

# Production environment
pulumi stack init prod-eastus
pulumi config set infrastructure:environment prod
pulumi up
```

### Environment-Aware Resource Settings

Resources are automatically configured based on environment:

| Setting | dev/test/pr | staging | prod/prod-* |
|---------|-------------|---------|-------------|
| Log Analytics Retention | 7 days | 30 days | 365 days |
| Key Vault Purge Protection | Disabled | Disabled | Enabled |
| Key Vault Soft Delete | 7 days | 30 days | 90 days |
| Resource Criticality Tag | low/medium | medium | mission-critical |

---

## Cluster Isolation Strategies

Choose between dedicated or shared AKS clusters based on your cost vs isolation requirements.

### Option 1: Dedicated Clusters (Default)

Each environment gets its own AKS cluster. This provides maximum isolation.

```
┌─────────────────────────────────────────────────────────────────┐
│                    DEDICATED CLUSTERS (Current)                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │ AKS-dev     │  │ AKS-staging │  │ AKS-prod    │             │
│  │             │  │             │  │             │             │
│  │ All dev     │  │ All staging │  │ All prod    │             │
│  │ workloads   │  │ workloads   │  │ workloads   │             │
│  └─────────────┘  └─────────────┘  └─────────────┘             │
│                                                                 │
│  Pros: Maximum isolation, simple RBAC                          │
│  Cons: Higher cost, more clusters to manage                    │
└─────────────────────────────────────────────────────────────────┘
```

**Deploy dedicated clusters:**

```bash
# Each environment is a separate Pulumi stack
pulumi stack init dev-eastus
pulumi config set infrastructure:environment dev
pulumi up

pulumi stack init prod-eastus
pulumi config set infrastructure:environment prod
pulumi up
```

### Option 2: Shared Clusters (Cost Optimized)

Multiple environments share AKS clusters using Kubernetes namespaces for isolation.

```
┌─────────────────────────────────────────────────────────────────┐
│                    SHARED CLUSTERS (Cost Optimized)             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────┐    ┌─────────────────────────┐    │
│  │     AKS-NonProd         │    │       AKS-Prod          │    │
│  │                         │    │                         │    │
│  │  ┌─────┐ ┌──────┐      │    │  ┌──────┐ ┌───────────┐ │    │
│  │  │ dev │ │ test │      │    │  │ prod │ │prod-blue  │ │    │
│  │  └─────┘ └──────┘      │    │  └──────┘ └───────────┘ │    │
│  │  ┌─────────┐ ┌──────┐  │    │  ┌───────────┐         │    │
│  │  │ staging │ │pr-123│  │    │  │prod-green │         │    │
│  │  └─────────┘ └──────┘  │    │  └───────────┘         │    │
│  └─────────────────────────┘    └─────────────────────────┘    │
│                                                                 │
│  Pros: ~60-70% cost savings, better resource utilization       │
│  Cons: Softer isolation, requires network policies             │
└─────────────────────────────────────────────────────────────────┘
```

**Cluster tier mapping:**

| Cluster | Environments | Rationale |
|---------|--------------|-----------|
| **AKS-NonProd** | dev, test, staging, pr-* | All non-production workloads |
| **AKS-Prod** | prod, prod-blue, prod-green | Production traffic only |

> **Note:** Staging is in the nonprod cluster for better production isolation. The prod cluster should only handle actual production traffic.

**Configuration example (see `config/examples/shared-cluster-cost-optimized.yaml`):**

```yaml
workloads:
  applications:
    - name: payment-service
      environment: dev
      clusterIsolation: shared
      sharedCluster:
        enabled: true
        clusterTier: nonprod
```

### When to Use Each Strategy

| Scenario | Recommended Strategy |
|----------|---------------------|
| Small/Medium business, cost-sensitive | Shared clusters |
| Enterprise, strict compliance | Dedicated clusters |
| Hostile multi-tenancy (untrusted tenants) | Dedicated clusters |
| Single team, multiple environments | Shared clusters |
| Different security classifications | Dedicated clusters |

---

## Blue/Green Deployments

Blue/Green deployment enables zero-downtime production releases by maintaining two identical production environments.

### Architecture

```
                     ┌─────────────────────────────────────┐
                     │        Traffic Routing              │
                     │  (Azure Front Door recommended)     │
                     └─────────────────┬───────────────────┘
                                       │
                    ┌──────────────────┴──────────────────┐
                    │                                     │
              ┌─────▼─────┐                       ┌───────▼─────┐
              │ prod-blue │                       │ prod-green  │
              │  (active) │                       │  (standby)  │
              │           │                       │             │
              │  AKS      │                       │  AKS        │
              │  SQL      │                       │  SQL        │
              │  KeyVault │                       │  KeyVault   │
              └───────────┘                       └─────────────┘
```

### Traffic Routing Options

| Service | Layer | Features | Best For |
|---------|-------|----------|----------|
| **Azure Front Door** (Recommended) | 7 (HTTP) | WAF, CDN, SSL termination, instant failover | Web apps, APIs |
| **Traffic Manager** | 4 (DNS) | Simple DNS routing, cross-cloud | Non-HTTP, hybrid |

### Deploying Blue/Green

**Step 1: Deploy both slots**

```bash
cd stacks/02-platform-services

# Deploy blue slot
pulumi stack init prod-blue-eastus
pulumi config set infrastructure:environment prod
pulumi config set infrastructure:deploymentSlot blue
pulumi up

# Deploy green slot
pulumi stack init prod-green-eastus
pulumi config set infrastructure:environment prod
pulumi config set infrastructure:deploymentSlot green
pulumi up
```

**Step 2: Configure traffic routing (Azure Front Door)**

See `config/examples/blue-green-production.yaml` for full configuration.

```yaml
trafficRouting:
  enabled: true
  service: frontdoor              # Recommended
  frontDoor:
    sku: Premium_AzureFrontDoor
    enableWaf: true
    wafMode: Prevention
```

### Cutover Process

1. **Deploy to inactive slot** (e.g., green while blue is active)
2. **Validate** - Run smoke tests against green endpoint
3. **Switch traffic** - Update Front Door to route to green
4. **Monitor** - Watch for issues
5. **Rollback if needed** - Instantly revert to blue

```bash
# Example: Switch traffic from blue to green
az afd route update \
  --resource-group rg-platform-prod-eastus \
  --profile-name fd-platform-prod \
  --endpoint-name platform \
  --route-name default \
  --origin-group og-prod-green
```

---

## PR Preview Environments

Ephemeral environments for testing pull requests before merging.

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    PR PREVIEW WORKFLOW                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Developer           GitHub Actions          Azure              │
│                                                                 │
│  ┌─────────┐        ┌─────────────┐        ┌─────────────────┐ │
│  │ Open PR │ ────►  │ on: pull_   │ ────►  │ Deploy pr-123   │ │
│  │  #123   │        │ request     │        │ namespace       │ │
│  └─────────┘        └─────────────┘        └─────────────────┘ │
│                                                                 │
│  ┌─────────┐        ┌─────────────┐        ┌─────────────────┐ │
│  │ Merge/  │ ────►  │ on: pull_   │ ────►  │ Destroy pr-123  │ │
│  │ Close   │        │ request:    │        │ resources       │ │
│  │         │        │ closed      │        │                 │ │
│  └─────────┘        └─────────────┘        └─────────────────┘ │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Manual Deployment

```bash
cd stacks/04-application-services

# Create PR environment
pulumi stack init pr-123-eastus
pulumi config set infrastructure:environment pr
pulumi config set infrastructure:ephemeralId "123"
pulumi config set infrastructure:tenantId myapp
pulumi up

# ... test the PR ...

# Cleanup when done
pulumi destroy --yes
pulumi stack rm pr-123-eastus --yes
```

### GitHub Actions Integration

```yaml
# .github/workflows/pr-preview.yml
name: PR Preview

on:
  pull_request:
    types: [opened, synchronize, reopened]

jobs:
  deploy-preview:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Deploy PR Environment
        run: |
          cd stacks/04-application-services
          pulumi stack select pr-${{ github.event.pull_request.number }}-eastus --create
          pulumi config set infrastructure:environment pr
          pulumi config set infrastructure:ephemeralId "${{ github.event.pull_request.number }}"
          pulumi up --yes

      - name: Comment PR with URL
        uses: actions/github-script@v7
        with:
          script: |
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: '🚀 Preview environment deployed: https://pr-${{ github.event.pull_request.number }}.preview.example.com'
            })

---
# Cleanup workflow
name: PR Cleanup

on:
  pull_request:
    types: [closed]

jobs:
  cleanup-preview:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Destroy PR Environment
        run: |
          cd stacks/04-application-services
          pulumi stack select pr-${{ github.event.pull_request.number }}-eastus
          pulumi destroy --yes
          pulumi stack rm --yes
```

### Cost Optimization for PR Environments

PR environments use minimal resources by default:

| Resource | PR Setting | Production Setting |
|----------|------------|-------------------|
| AKS Nodes | 1 | 3+ |
| AKS VM Size | Standard_D2s_v3 | Standard_D4s_v3 |
| SQL SKU | Basic | S3+ |
| Log Retention | 1 day | 365 days |
| Purge Protection | Disabled | Enabled |

See `config/examples/pr-preview-environment.yaml` for full configuration.

---

## Common Operations

### Add a New Tenant

```bash
cd stacks/04-application-services

# Create new stack
pulumi stack init newtenant-prod-eastus

# Configure
pulumi config set azure-native:location eastus
pulumi config set infrastructure:tenantId newtenant
pulumi config set infrastructure:environment prod

# Deploy
pulumi up
```

### Update Platform Services

```bash
cd stacks/02-platform-services
pulumi stack select dev-eastus
pulumi up
```

### View Stack Outputs

```bash
pulumi stack output --show-secrets
```

### Destroy Resources

Using scripts (recommended):

```bash
# Destroy all phases except Phase 0
./scripts/02-state-management/destroy-all.sh

# Destroy everything including Phase 0
./scripts/02-state-management/destroy-all.sh --include-phase0

# Destroy specific phase only
./scripts/02-state-management/destroy-all.sh --phase workloads
./scripts/02-state-management/destroy-all.sh --phase platform
./scripts/02-state-management/destroy-all.sh --phase bootstrap

# Preview what will be destroyed
./scripts/02-state-management/destroy-all.sh --dry-run
```

Manual destruction (reverse order, switching state backends):

```bash
# ============================================================
# STEP 1: Destroy Phase 1-3 (using Azure Blob state)
# ============================================================
# Make sure you're logged into Azure Blob state
# pulumi login azblob://${STORAGE_ACCOUNT}/${CONTAINER_NAME}

cd stacks/04-application-services
pulumi destroy --yes

cd ../03-services-addons
pulumi destroy --yes

cd ../02-platform-services
pulumi destroy --yes

cd ../01-bootstrap/policies
pulumi destroy --yes

cd ../management-groups
pulumi destroy --yes

# ============================================================
# STEP 2: Switch to local state for Phase 0
# ============================================================
cd ../..
pulumi logout
pulumi login file://~/.pulumi-local

# ============================================================
# STEP 3: Destroy Phase 0 (state backend itself)
# ============================================================
cd 00-state-backend
pulumi destroy --yes

# After this, the Azure Storage Account is deleted
# Your local state in ~/.pulumi-local/ can be cleaned up
```

---

## Troubleshooting

### Common Issues

#### "Management Group already exists"

```bash
# Option 1: Import existing
pulumi import azure-native:management:ManagementGroup mg-name /providers/Microsoft.Management/managementGroups/mg-name

# Option 2: Change prefix in config
```

#### "Insufficient permissions"

```bash
# Check your current permissions
az role assignment list --assignee $(az account show --query user.name -o tsv)

# Verify management group access
az account management-group list
```

#### "Policy assignment failed"

```bash
# Register required providers
az provider register --namespace Microsoft.PolicyInsights
az provider register --namespace Microsoft.Management
```

#### "AKS cluster creation failed"

```bash
# Check quota
az vm list-usage --location eastus -o table

# Check AKS versions available
az aks get-versions --location eastus -o table
```

### Getting Help

1. Check Pulumi logs: `pulumi logs`
2. Enable verbose output: `pulumi up --verbose 3`
3. Check Azure Activity Log in Portal
4. Review [Pulumi Troubleshooting](https://www.pulumi.com/docs/troubleshooting/)

---

## Next Steps

1. **Customize policies** - Edit `stacks/01-bootstrap/policies/policy-definitions.ts`
2. **Add monitoring** - Configure alerts in Log Analytics
3. **Enable multi-region** - Set `region.mode: multi` in config
4. **Add workloads** - Create application stacks for your services
5. **Set up Blue/Green** - See `config/examples/blue-green-production.yaml`
6. **Enable PR previews** - See `config/examples/pr-preview-environment.yaml`
7. **Optimize costs** - Consider shared clusters for non-production environments

---

## Reference Links

- [Azure Landing Zones](https://docs.microsoft.com/azure/cloud-adoption-framework/ready/landing-zone/)
- [Pulumi Azure Native](https://www.pulumi.com/registry/packages/azure-native/)
- [Azure Naming Conventions](https://docs.microsoft.com/azure/cloud-adoption-framework/ready/azure-best-practices/resource-abbreviations)
