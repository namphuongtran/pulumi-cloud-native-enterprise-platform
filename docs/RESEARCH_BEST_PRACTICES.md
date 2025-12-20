# Pulumi Cloud-Native Enterprise Platform: Research & Best Practices

## Executive Summary

This document consolidates research on Node.js monorepo patterns, Pulumi multi-stack architectures, stack naming conventions for DR, tenant parametrization, and multi-cloud infrastructure selection.

---

## 1. Node.js Monorepo Best Practices

### Directory Structure

**Modern Convention: `packages/` Directory**

Modern Node.js monorepos **predominantly use `packages/` directory** as the standard convention. This is supported by:
- **pnpm**: Official recommendation with `pnpm-workspace.yaml`
- **Yarn Workspaces**: Support glob patterns like `packages/*`
- **npm Workspaces**: Recommended structure with `workspaces` array in `package.json`

Popular projects using `packages/`:
- Next.js
- Vite
- Vue
- Nuxt
- Astro
- Prisma
- Material UI
- Element Plus

**Shared Libraries Convention: `shared/` or `packages/`?**

Both patterns exist, but **`packages/shared/` is preferred** because:
- All packages live in the same namespace (`packages/`)
- Treats shared libraries as first-class packages
- Enables consistent versioning and publishing
- Simplifies workspace resolution

### Workspace Configuration

#### **pnpm Workspaces** (Recommended for Pulumi)
```yaml
# pnpm-workspace.yaml
packages:
  - 'packages/*'
  - 'stacks/*'
```

```json
// packages/shared-lib/package.json
{
  "name": "@myorg/shared-lib",
  "version": "1.0.0"
}

// packages/api/package.json
{
  "name": "@myorg/api",
  "dependencies": {
    "@myorg/shared-lib": "workspace:*"
  }
}
```

**Benefits for Pulumi:**
- Symlinks workspace packages automatically
- Single lockfile for entire monorepo
- Clean dependency resolution
- Converts `workspace:*` to semver before publishing

#### **npm Workspaces**
```json
// root package.json
{
  "private": true,
  "workspaces": [
    "packages/*",
    "stacks/*"
  ]
}
```

#### **Yarn Workspaces**
```json
// root package.json
{
  "private": true,
  "workspaces": [
    "packages/*",
    "stacks/*"
  ]
}
```

### Recommended Monorepo Structure for Pulumi

```
monorepo-root/
├── packages/
│   ├── core-components/       # Reusable Pulumi components
│   │   ├── src/
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── network-component/
│   ├── database-component/
│   └── shared-utils/          # Shared utility functions
├── stacks/                    # Each stack is a Pulumi project
│   ├── core/
│   │   ├── index.ts
│   │   ├── Pulumi.yaml
│   │   ├── Pulumi.dev.yaml
│   │   └── package.json
│   ├── platform/
│   ├── services/
│   └── app/
├── pnpm-workspace.yaml
├── package.json              # Root workspace definition
└── tsconfig.json             # Shared TypeScript config
```

---

## 2. Pulumi Multi-Stack Entry Points

### Architecture Patterns

#### **Pattern 1: Monolithic (Single Entry Point)**

**Best for:** Small to medium projects, tightly coupled stacks

```
infrastructure/
├── index.ts                  # Single entry point
├── components/
│   ├── network.ts
│   ├── database.ts
│   └── kubernetes.ts
├── Pulumi.yaml
├── Pulumi.dev.yaml
├── Pulumi.staging.yaml
└── Pulumi.prod.yaml
```

**index.ts:**
```typescript
import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import { createNetwork } from "./components/network";
import { createDatabase } from "./components/database";
import { createKubernetes } from "./components/kubernetes";

const config = new pulumi.Config();
const environment = pulumi.getStack();
const region = config.require("region");

// Deploy all components based on stack configuration
const network = createNetwork(environment, region);
const database = createDatabase(environment, network);
const kubernetes = createKubernetes(environment, network);

export const endpoints = {
  kubeConfig: kubernetes.kubeconfig,
  dbEndpoint: database.endpoint,
};
```

#### **Pattern 2: Micro-Stacks (Multiple Projects)**

**Best for:** Large enterprises, independent deployment cadences

```
enterprise-platform/
├── stacks/
│   ├── core/                 # Base infrastructure
│   │   ├── index.ts
│   │   ├── Pulumi.yaml
│   │   └── Pulumi.prod.yaml
│   ├── platform/             # Platform layer
│   │   ├── index.ts
│   │   └── Pulumi.yaml
│   ├── services/             # Microservices
│   │   ├── index.ts
│   │   └── Pulumi.yaml
│   └── app/                  # Application
│       ├── index.ts
│       └── Pulumi.yaml
├── packages/
│   └── shared-components/
└── pnpm-workspace.yaml
```

**core/index.ts:**
```typescript
import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

const config = new pulumi.Config();

// Core infrastructure outputs
export const vpcId = new aws.ec2.Vpc("main-vpc").id;
export const vpcCidr = config.require("vpc_cidr");
```

**platform/index.ts:**
```typescript
import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

// Reference core stack
const coreStackRef = new pulumi.StackReference(`org/project/core/${pulumi.getStack()}`);
const vpcId = coreStackRef.getOutput("vpcId");
const vpcCidr = coreStackRef.getOutput("vpcCidr");

// Platform deployment
export const clusterName = new aws.eks.Cluster("platform", {
  vpcId: vpcId as pulumi.Input<string>,
  // ...
}).name;
```

#### **Pattern 3: Hybrid Approach (Recommended for Enterprise)**

```
enterprise-platform/
├── stacks/
│   ├── core/                 # Independent: network, IAM, secrets
│   ├── data/                 # Independent: databases, caching
│   ├── platform/             # Semi-independent: depends on core
│   ├── services/             # Monolithic: multiple services
│   └── app/                  # Application deployments
├── packages/
│   ├── components/           # Reusable Pulumi components
│   ├── policies/             # CrossGuard policies
│   └── utils/                # Shared utilities
└── pnpm-workspace.yaml
```

**Benefits:**
- Independent deployment of critical infrastructure
- Shared components reduce code duplication
- Clear dependency management
- Per-stack configuration and RBAC

### Stack References (Cross-Stack Dependencies)

**TypeScript Example:**

```typescript
import * as pulumi from "@pulumi/pulumi";

// Reference another stack's outputs
const coreStack = new pulumi.StackReference(
  `organization/project/${pulumi.getStack()}`  // e.g., "myorg/myproject/prod"
);

// Get outputs from core stack
const vpcId = coreStack.getOutput("vpcId");
const subnetIds = coreStack.getOutput("subnetIds");
const securityGroupId = coreStack.getOutput("securityGroupId");

// Use in current stack
import * as aws from "@pulumi/aws";

const cluster = new aws.eks.Cluster("app-cluster", {
  vpcId: vpcId as pulumi.Input<string>,
  subnetIds: subnetIds as pulumi.Input<string[]>,
  vpcConfig: {
    securityGroupIds: [securityGroupId as pulumi.Input<string>],
  },
});

export const kubeconfig = cluster.kubeconfig;
```

### CLI-Based vs. Automation API Deployments

#### **CLI-Based Deployments**

```bash
# Deploy a specific stack
cd stacks/core
pulumi stack select prod
pulumi up

# Deploy all stacks
cd ../..
for stack in stacks/*/; do
  cd "$stack"
  pulumi up
done
```

**Characteristics:**
- Interactive or non-interactive (`--non-interactive`)
- Sequential or parallel deployment
- Manual ordering required

#### **Automation API Deployments** (Recommended)

```typescript
// automation/deploy.ts
import * as automation from "@pulumi/automation";
import * as path from "path";

async function deployStack(stackName: string) {
  const stack = await automation.upsertStack({
    stackName,
    projectName: "my-platform",
    workDir: path.join(__dirname, "../stacks", stackName.split("-")[0]),
  });

  console.log(`Starting deployment of ${stackName}...`);
  
  const upResult = await stack.up({ onOutput: console.log });
  console.log(`Update summary: \n${upResult.summary.stdout}`);
  
  return upResult.outputs;
}

async function deployAll() {
  // Deploy stacks in dependency order
  const coreOutput = await deployStack("core-prod");
  const platformOutput = await deployStack("platform-prod");
  const appOutput = await deployStack("app-prod");

  console.log("All stacks deployed successfully!");
}

deployAll().catch(err => {
  console.error(err);
  process.exit(1);
});
```

**Benefits of Automation API:**
- **Programmatic control** over deployment order and dependencies
- **Error handling** with retry logic
- **Dynamic stack management** (create/delete stacks on-the-fly)
- **Pipeline integration** without external orchestration
- **State management** within your application
- **Multi-tenant deployments** with stack per tenant

---

## 3. Stack Naming Conventions for DR (Disaster Recovery)

### Multi-Region Naming Patterns

#### **Pattern 1: Region-Suffix Convention** (Recommended)

```
prod-eastus    # Primary region (US East)
prod-westus    # DR region (US West)
prod-northeu   # Tertiary region (North Europe)
```

**Configuration:**
```yaml
# Pulumi.prod-eastus.yaml
aws:region: us-east-1
environment: prod
region-code: eastus
is_primary: true
dr_target: prod-westus
```

```yaml
# Pulumi.prod-westus.yaml
aws:region: us-west-1
environment: prod
region-code: westus
is_primary: false
dr_source: prod-eastus
```

**Code Example:**
```typescript
const config = new pulumi.Config();
const stack = pulumi.getStack();
const isPrimary = config.getBoolean("is_primary") ?? true;
const region = config.require("aws:region");

// Conditional resources based on region
if (isPrimary) {
  // Deploy primary resources (RDS primary instance)
  const primaryDb = new aws.rds.Instance("primary", {
    engine: "mysql",
    multiAz: false,
    // ...
  });
  
  pulumi.export("primaryDbEndpoint", primaryDb.endpoint);
} else {
  // Deploy read replica
  const readReplica = new aws.rds.ClusterInstance("read-replica", {
    clusterId: coreStack.getOutput("dbClusterId"),
    // ...
  });
}
```

#### **Pattern 2: Environment-Based Convention**

```
prod          # Primary
prod-dr       # DR failover
staging
dev
```

**Less Recommended** because:
- Less explicit about regions
- Harder to manage multiple DCs per environment
- Doesn't scale for multi-region active-active

### Stack References Across Regions

```typescript
// deploy in prod-westus, reference prod-eastus
const primaryStackRef = new pulumi.StackReference(
  `org/project/prod-eastus`
);

const primaryDbEndpoint = primaryStackRef.getOutput("dbEndpoint");
const primaryKubeConfig = primaryStackRef.getOutput("kubeconfig");

// Set up cross-region replication
const replicaDb = new aws.rds.ClusterInstance("replica", {
  // Reference primary endpoint
  replicationSourceIdentifier: primaryDbEndpoint,
  // ...
});
```

### Configuration Inheritance Across Regions

**Base Configuration (Pulumi.yaml):**
```yaml
name: my-platform
runtime: nodejs
description: Cloud-native platform with multi-region DR
```

**Region-Specific (Pulumi.prod-eastus.yaml):**
```yaml
config:
  aws:region: us-east-1
  environment: prod
  region-code: eastus
  is_primary: true
  dr_target: prod-westus
  # Common configs
  enable_monitoring: true
  enable_backup: true
  backup_retention_days: 30
```

**Region-Specific (Pulumi.prod-westus.yaml):**
```yaml
config:
  aws:region: us-west-1
  environment: prod
  region-code: westus
  is_primary: false
  dr_source: prod-eastus
  # Inherit common configs
  enable_monitoring: true
  enable_backup: true
  backup_retention_days: 30
```

**TypeScript Base Stack:**
```typescript
import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

const config = new pulumi.Config();
const stack = pulumi.getStack();

interface StackConfig {
  region: string;
  environment: string;
  regionCode: string;
  isPrimary: boolean;
  enableMonitoring: boolean;
  enableBackup: boolean;
  backupRetentionDays: number;
}

function getStackConfig(): StackConfig {
  return {
    region: config.require("aws:region"),
    environment: config.require("environment"),
    regionCode: config.require("region-code"),
    isPrimary: config.getBoolean("is_primary") ?? true,
    enableMonitoring: config.getBoolean("enable_monitoring") ?? true,
    enableBackup: config.getBoolean("enable_backup") ?? true,
    backupRetentionDays: config.getNumber("backup_retention_days") ?? 30,
  };
}

const cfg = getStackConfig();

// Use config throughout stack
export const configuration = cfg;
```

---

## 4. Tenant Parametrization in Pulumi

### Approach 1: CLI Configuration (Simplest)

**Pass tenant ID via `pulumi config set`:**

```bash
# Set tenant-specific configuration
pulumi config set tenantId acme-corp
pulumi config set tenantName "ACME Corporation"
pulumi config set tenantRegion us-west-2

# Deploy for tenant
pulumi up
```

**Code:**
```typescript
import * as pulumi from "@pulumi/pulumi";

const config = new pulumi.Config();
const tenantId = config.require("tenantId");
const tenantName = config.require("tenantName");
const tenantRegion = config.require("tenantRegion");

const resourceName = `${tenantId}-resource`;

export const tenantInfo = {
  id: tenantId,
  name: tenantName,
  region: tenantRegion,
};
```

**Pulumi.acme-corp.yaml:**
```yaml
config:
  aws:region: us-west-2
  tenantId: acme-corp
  tenantName: ACME Corporation
  tenantRegion: us-west-2
```

### Approach 2: Environment Variables

**Best for:** CI/CD pipelines, Docker containers

```bash
export PULUMI_CONFIG_TENANTID=acme-corp
export PULUMI_CONFIG_TENANTNAME="ACME Corporation"
pulumi up
```

**Code:**
```typescript
import * as pulumi from "@pulumi/pulumi";

const config = new pulumi.Config();
const tenantId = config.require("tenantId");

// Also support env var fallback
const tenantIdEnv = process.env.PULUMI_CONFIG_TENANTID || tenantId;
```

### Approach 3: Pipeline Secrets (Recommended for Enterprise)

**GitHub Actions Example:**

```yaml
name: Deploy Tenant
on:
  workflow_dispatch:
    inputs:
      tenant_id:
        description: "Tenant ID"
        required: true
        type: string

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Set up Pulumi
        uses: pulumi/actions@v4
        with:
          command: up
          stack-name: ${{ inputs.tenant_id }}-prod
        env:
          PULUMI_CONFIG_TENANTID: ${{ inputs.tenant_id }}
          PULUMI_CONFIG_TENANTNAME: ${{ secrets[format('TENANT_{0}_NAME', inputs.tenant_id)] }}
          PULUMI_CONFIG_TENANTREGION: ${{ secrets[format('TENANT_{0}_REGION', inputs.tenant_id)] }}
```

### Approach 4: Dynamic Stack Creation (Multi-Tenant SaaS)

**Automation API for per-tenant deployments:**

```typescript
// automation/tenant-deploy.ts
import * as automation from "@pulumi/automation";
import * as path from "path";

interface TenantConfig {
  id: string;
  name: string;
  region: string;
  tierLevel: "starter" | "professional" | "enterprise";
}

async function deployTenant(tenant: TenantConfig) {
  const stackName = `${tenant.id}-prod`;
  
  const stack = await automation.upsertStack({
    stackName,
    projectName: "saas-platform",
    workDir: path.join(__dirname, "../stacks/tenant"),
  });

  // Set tenant-specific configuration
  await stack.setConfig("tenantId", { value: tenant.id });
  await stack.setConfig("tenantName", { value: tenant.name });
  await stack.setConfig("tenantRegion", { value: tenant.region });
  await stack.setConfig("tierLevel", { value: tenant.tierLevel });

  console.log(`Deploying tenant: ${tenant.name}`);
  const result = await stack.up({ onOutput: console.log });
  
  return {
    tenantId: tenant.id,
    outputs: result.outputs,
  };
}

// Deploy multiple tenants
async function deployAllTenants() {
  const tenants: TenantConfig[] = [
    { id: "acme-corp", name: "ACME Corp", region: "us-west-2", tierLevel: "enterprise" },
    { id: "globex-inc", name: "Globex Inc", region: "eu-west-1", tierLevel: "professional" },
    { id: "startup-xyz", name: "Startup XYZ", region: "us-east-1", tierLevel: "starter" },
  ];

  for (const tenant of tenants) {
    try {
      await deployTenant(tenant);
    } catch (error) {
      console.error(`Failed to deploy tenant ${tenant.id}:`, error);
    }
  }
}

deployAllTenants();
```

### Approach 5: Pulumi.dev.yaml with Dynamic Parameters

**For local/dev tenant testing:**

```yaml
# Pulumi.dev.yaml
config:
  aws:region: us-east-1
  tenantId: test-tenant
  tenantName: Test Organization
  tenantRegion: us-east-1
  db:
    engine: postgres
    instanceType: db.t3.micro
  kubernetes:
    nodeCount: 1
    nodeInstanceType: t3.small
  features:
    enableMonitoring: false
    enableAutoScaling: false
```

### Tenant-Aware Resource Naming

```typescript
const config = new pulumi.Config();
const tenantId = config.require("tenantId");
const env = pulumi.getStack();

// Tenant-isolated resources
const bucket = new aws.s3.Bucket(`${tenantId}-data`, {
  bucket: `${tenantId}-data-${env}`.toLowerCase(),
});

const db = new aws.rds.Instance(`${tenantId}-db`, {
  identifier: `${tenantId}-db-${env}`.toLowerCase(),
  // ...
});

const k8sNamespace = new kubernetes.core.v1.Namespace(`${tenantId}-ns`, {
  metadata: {
    name: `${tenantId}-${env}`,
  },
});

export const tenantResources = {
  bucketName: bucket.bucket,
  dbEndpoint: db.endpoint,
  k8sNamespace: k8sNamespace.metadata.name,
};
```

---

## 5. AKS/EKS Parameterization

### Approach 1: Config-Driven Provider Selection (Recommended)

**Pulumi.aws.yaml:**
```yaml
config:
  aws:region: us-east-1
  cloudProvider: aws
  kubernetesProvider: eks
  eks:
    version: "1.28"
    nodeInstanceType: t3.medium
    nodeCount: 3
```

**Pulumi.azure.yaml:**
```yaml
config:
  azure:location: eastus
  cloudProvider: azure
  kubernetesProvider: aks
  aks:
    kubernetesVersion: "1.28"
    vmSize: Standard_D2s_v3
    nodeCount: 3
```

**Code:**
```typescript
import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as azure from "@pulumi/azure";
import * as kubernetes from "@pulumi/kubernetes";

const config = new pulumi.Config();
const cloudProvider = config.require("cloudProvider"); // "aws" or "azure"

interface ClusterConfig {
  kubernetesVersion: string;
  nodeCount: number;
  nodeInstanceType: string;
}

// AWS EKS cluster
function createEksCluster(cfg: ClusterConfig) {
  const eksRole = new aws.iam.Role("eks-role", {
    assumeRolePolicy: aws.iam.getPolicyDocumentOutput({
      statements: [{
        actions: ["sts:AssumeRole"],
        principals: [{
          type: "Service",
          identifiers: ["eks.amazonaws.com"],
        }],
      }],
    }).json,
  });

  const cluster = new aws.eks.Cluster("platform", {
    roleArn: eksRole.arn,
    vpcConfig: {
      subnetIds: subnetIds, // From core stack
    },
    version: cfg.kubernetesVersion,
    enabledClusterLogTypes: ["api", "audit", "authenticator"],
  });

  return cluster;
}

// Azure AKS cluster
function createAksCluster(cfg: ClusterConfig) {
  const aks = new azure.containerservice.KubernetesCluster("platform", {
    resourceGroupName: resourceGroup.name,
    location: resourceGroup.location,
    kubernetesVersion: cfg.kubernetesVersion,
    defaultNodePool: {
      name: "default",
      nodeCount: cfg.nodeCount,
      vmSize: config.require("aks:vmSize"),
    },
  });

  return aks;
}

// Deploy based on cloud provider
let cluster: any;
let kubeconfig: pulumi.Output<string>;

if (cloudProvider === "aws") {
  const eksConfig: ClusterConfig = {
    kubernetesVersion: config.require("eks:version"),
    nodeCount: config.getNumber("eks:nodeCount") ?? 3,
    nodeInstanceType: config.require("eks:nodeInstanceType"),
  };
  cluster = createEksCluster(eksConfig);
  kubeconfig = cluster.kubeconfig;
} else if (cloudProvider === "azure") {
  const aksConfig: ClusterConfig = {
    kubernetesVersion: config.require("aks:kubernetesVersion"),
    nodeCount: config.getNumber("aks:nodeCount") ?? 3,
    nodeInstanceType: config.require("aks:vmSize"),
  };
  cluster = createAksCluster(aksConfig);
  kubeconfig = cluster.kubeConfigRaw;
} else {
  throw new Error(`Unsupported cloud provider: ${cloudProvider}`);
}

// Kubernetes provider (works with both EKS and AKS)
const k8sProvider = new kubernetes.Provider("k8s", {
  kubeconfig: kubeconfig,
});

export const clusterName = cluster.name;
export const kubeconfig = kubeconfig;
```

### Approach 2: Separate Stacks per Cloud Provider

```
stacks/
├── eks-platform/         # AWS EKS
│   ├── index.ts
│   └── Pulumi.yaml
├── aks-platform/         # Azure AKS
│   ├── index.ts
│   └── Pulumi.yaml
└── shared-components/
```

**AWS Stack (eks-platform/index.ts):**
```typescript
import * as aws from "@pulumi/aws";
import * as kubernetes from "@pulumi/kubernetes";
import * as kx from "@pulumi/kubernetesx";

const cluster = new aws.eks.Cluster("app", {
  // AWS-specific configuration
  vpcConfig: {
    subnetIds: subnetIds,
  },
});
```

**Azure Stack (aks-platform/index.ts):**
```typescript
import * as azure from "@pulumi/azure";
import * as kubernetes from "@pulumi/kubernetes";

const aks = new azure.containerservice.KubernetesCluster("app", {
  // Azure-specific configuration
  resourceGroupName: resourceGroup.name,
});
```

**Deployment:**
```bash
# Deploy AWS
cd stacks/eks-platform
pulumi up

# Or Azure
cd stacks/aks-platform
pulumi up
```

### Approach 3: Dynamic Imports Based on Configuration

**Factory Pattern:**

```typescript
// kubernetes/factory.ts
import * as pulumi from "@pulumi/pulumi";

type KubernetesProvider = "eks" | "aks";

interface KubernetesCluster {
  clusterName: pulumi.Output<string>;
  kubeconfig: pulumi.Output<string>;
  nodeCount: number;
}

async function createCluster(provider: KubernetesProvider): Promise<KubernetesCluster> {
  if (provider === "eks") {
    const eks = await import("./providers/eks");
    return eks.createEksCluster();
  } else if (provider === "aks") {
    const aks = await import("./providers/aks");
    return aks.createAksCluster();
  }
  throw new Error(`Unknown provider: ${provider}`);
}

export { createCluster };
```

**Usage in index.ts:**
```typescript
const config = new pulumi.Config();
const provider = config.require("kubernetesProvider") as "eks" | "aks";

const { createCluster } = await import("./kubernetes/factory");
const cluster = await createCluster(provider);
```

### Best Practices Summary

| Approach | Best For | Complexity |
|----------|----------|-----------|
| Config-driven selection | Single codebase, easy switching | Low |
| Separate stacks | Clear separation, independent teams | Medium |
| Dynamic imports | Conditional deployments, monorepo | Medium-High |

---

## 6. Complete Example: Enterprise Platform Structure

### Directory Structure

```
pulumi-cloud-native-enterprise-platform/
├── packages/
│   ├── components/
│   │   ├── src/
│   │   │   ├── network.ts
│   │   │   ├── database.ts
│   │   │   ├── kubernetes-cluster.ts
│   │   │   └── security.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── policies/
│   │   ├── src/
│   │   │   ├── cost-optimization.ts
│   │   │   └── security-compliance.ts
│   │   └── package.json
│   └── utils/
│       ├── src/
│       │   ├── config.ts
│       │   ├── naming.ts
│       │   └── helpers.ts
│       └── package.json
├── stacks/
│   ├── core/
│   │   ├── index.ts
│   │   ├── Pulumi.yaml
│   │   ├── Pulumi.dev.yaml
│   │   ├── Pulumi.prod-eastus.yaml
│   │   ├── Pulumi.prod-westus.yaml
│   │   └── package.json
│   ├── platform/
│   │   ├── index.ts
│   │   ├── Pulumi.yaml
│   │   └── package.json
│   ├── services/
│   │   ├── index.ts
│   │   ├── Pulumi.yaml
│   │   └── package.json
│   └── app/
│       ├── index.ts
│       ├── Pulumi.yaml
│       └── package.json
├── automation/
│   ├── deploy.ts           # Automation API orchestration
│   ├── tenant-deploy.ts    # Multi-tenant deployments
│   └── package.json
├── pnpm-workspace.yaml
├── package.json
└── README.md
```

### Root package.json

```json
{
  "name": "@myorg/platform",
  "version": "1.0.0",
  "private": true,
  "workspaces": [
    "packages/*",
    "stacks/*",
    "automation"
  ],
  "scripts": {
    "build": "pnpm -r build",
    "deploy:dev": "cd stacks/core && pulumi up -s dev",
    "deploy:prod": "node automation/deploy.ts",
    "deploy:tenant": "node automation/tenant-deploy.ts"
  },
  "devDependencies": {
    "@pulumi/pulumi": "^3.x.x",
    "@pulumi/aws": "^6.x.x",
    "@pulumi/azure-native": "^2.x.x",
    "typescript": "^5.x.x"
  }
}
```

### pnpm-workspace.yaml

```yaml
packages:
  - 'packages/*'
  - 'stacks/*'
  - 'automation'

prefer-workspace-packages: true
```

### Deployment Orchestration (automation/deploy.ts)

```typescript
import * as automation from "@pulumi/automation";
import * as path from "path";

interface StackConfig {
  name: string;
  workDir: string;
  dependsOn?: string[];
  configFile?: string;
}

const stacks: StackConfig[] = [
  {
    name: "core-prod-eastus",
    workDir: path.join(__dirname, "../stacks/core"),
    configFile: "Pulumi.prod-eastus.yaml",
  },
  {
    name: "core-prod-westus",
    workDir: path.join(__dirname, "../stacks/core"),
    configFile: "Pulumi.prod-westus.yaml",
  },
  {
    name: "platform-prod",
    workDir: path.join(__dirname, "../stacks/platform"),
    dependsOn: ["core-prod-eastus"],
  },
  {
    name: "services-prod",
    workDir: path.join(__dirname, "../stacks/services"),
    dependsOn: ["platform-prod"],
  },
];

async function deployStack(config: StackConfig) {
  console.log(`\n🚀 Deploying stack: ${config.name}`);
  
  const stack = await automation.upsertStack({
    stackName: config.name,
    projectName: "enterprise-platform",
    workDir: config.workDir,
  });

  try {
    const result = await stack.up({
      onOutput: console.log,
    });
    
    console.log(`✅ ${config.name} deployed successfully`);
    return result.outputs;
  } catch (error) {
    console.error(`❌ ${config.name} deployment failed:`, error);
    throw error;
  }
}

async function deployAll() {
  const outputs: Record<string, Record<string, any>> = {};

  // Deploy in dependency order
  for (const config of stacks) {
    if (config.dependsOn) {
      for (const dep of config.dependsOn) {
        if (!outputs[dep]) {
          throw new Error(`Dependency ${dep} not deployed`);
        }
      }
    }

    outputs[config.name] = await deployStack(config);
  }

  console.log("\n✨ All stacks deployed successfully!");
  console.log("Outputs:", JSON.stringify(outputs, null, 2));
}

deployAll().catch(err => {
  console.error("\n💥 Deployment failed:", err);
  process.exit(1);
});
```

---

## 7. Key Takeaways

### Monorepo Structure
- ✅ Use `packages/` directory with workspace managers (pnpm/yarn/npm)
- ✅ Place shared components in `packages/components` or `packages/shared`
- ✅ Each Pulumi project is a separate workspace with its own `package.json`

### Stack Entry Points
- ✅ **Monolithic:** Single `index.ts` for tightly coupled resources
- ✅ **Micro-Stacks:** Separate projects with stack references for independence
- ✅ **Hybrid:** Combine monolithic and micro for optimal separation

### DR Stack Naming
- ✅ Use region-suffix convention: `prod-eastus`, `prod-westus`
- ✅ Use stack references to link primary/replica resources
- ✅ Inheritance: base configuration + region-specific overrides

### Tenant Parametrization
- ✅ **CLI config:** `pulumi config set tenantId <value>`
- ✅ **Environment variables:** `PULUMI_CONFIG_*`
- ✅ **Automation API:** Programmatic per-tenant deployments
- ✅ **Dynamic stacks:** Create stack per tenant in SaaS

### Cloud Provider Selection
- ✅ **Config-driven:** Single codebase, feature-flagged deployment
- ✅ **Separate stacks:** Clear isolation, independent lifecycles
- ✅ **Dynamic imports:** Conditional deployment logic

### Automation API
- ✅ Use for complex orchestration and multi-stack deployments
- ✅ Enables programmatic control over deployment order
- ✅ Essential for multi-tenant, multi-region deployments
- ✅ Supports error handling, retries, and state management

---

## 8. References

### Official Documentation
- Pulumi: https://www.pulumi.com/docs/
- pnpm Workspaces: https://pnpm.io/workspaces
- npm Workspaces: https://docs.npmjs.com/cli/v8/using-npm/workspaces
- Yarn Workspaces: https://classic.yarnpkg.com/en/docs/workspaces/

### GitHub Examples
- Pulumi Examples: https://github.com/pulumi/examples
- Stack References: aws-ts-stackreference, aws-py-stackreference examples

### Stack Reference Resources
- `aws-ts-stackreference-architecture`: Multi-project architecture patterns
- `nx-monorepo`: Monorepo structure with Pulumi

