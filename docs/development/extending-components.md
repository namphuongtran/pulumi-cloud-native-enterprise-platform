# Extending Components

Guide for adding new resource types and components.

## Component Architecture

```
packages/core/lib/
├── compute/
│   ├── index.ts          # Factory function
│   ├── aks.ts            # AKS component
│   ├── appservice.ts     # App Service component
│   └── container-apps.ts # Container Apps component
```

### Factory Pattern

```typescript
// compute/index.ts
export function createCompute(config: ComputeConfig): ComputeComponent {
  switch (config.computeType) {
    case "aks":
      return new AksCluster(config);
    case "appservice":
      return new AppServicePlan(config);
    case "container-apps":
      return new ContainerAppsEnvironment(config);
    default:
      return new AksCluster(config);
  }
}
```

## Adding New Compute Type

Example: Adding Azure Functions support.

### Step 1: Define Interface

```typescript
// interfaces.ts
export interface FunctionsConfig {
  runtime: "node" | "python" | "dotnet";
  version: string;
  sku: string;
  storageAccountId: pulumi.Input<string>;
}

export interface FunctionsOutputs {
  functionAppId: pulumi.Output<string>;
  functionAppName: pulumi.Output<string>;
  defaultHostname: pulumi.Output<string>;
}
```

### Step 2: Create Component

```typescript
// compute/functions.ts
import * as pulumi from "@pulumi/pulumi";
import * as azure from "@pulumi/azure-native";
import { FunctionsConfig, FunctionsOutputs } from "../interfaces";
import { platformResourceName, getTags } from "../";

export class FunctionsApp extends pulumi.ComponentResource {
  public readonly outputs: FunctionsOutputs;

  constructor(
    name: string,
    args: FunctionsConfig,
    opts?: pulumi.ComponentResourceOptions
  ) {
    super("enterprise:compute:FunctionsApp", name, args, opts);

    const resourceName = platformResourceName(name, "func");

    // Create App Service Plan
    const plan = new azure.web.AppServicePlan(`${name}-plan`, {
      resourceGroupName: args.resourceGroupName,
      location: args.location,
      kind: "FunctionApp",
      sku: {
        name: args.sku,
        tier: args.sku.startsWith("Y") ? "Dynamic" : "Premium",
      },
    }, { parent: this });

    // Create Function App
    const functionApp = new azure.web.WebApp(resourceName, {
      resourceGroupName: args.resourceGroupName,
      location: args.location,
      serverFarmId: plan.id,
      kind: "functionapp",
      siteConfig: {
        appSettings: [
          { name: "FUNCTIONS_WORKER_RUNTIME", value: args.runtime },
          { name: "FUNCTIONS_EXTENSION_VERSION", value: `~${args.version}` },
          { name: "AzureWebJobsStorage", value: args.storageConnectionString },
        ],
      },
      tags: getTags(args.context),
    }, { parent: this });

    this.outputs = {
      functionAppId: functionApp.id,
      functionAppName: functionApp.name,
      defaultHostname: functionApp.defaultHostName,
    };

    this.registerOutputs(this.outputs);
  }
}
```

### Step 3: Update Factory

```typescript
// compute/index.ts
import { FunctionsApp } from "./functions";

export function createCompute(config: ComputeConfig): ComputeComponent {
  switch (config.computeType) {
    case "aks":
      return new AksCluster(config);
    case "appservice":
      return new AppServicePlan(config);
    case "container-apps":
      return new ContainerAppsEnvironment(config);
    case "functions":                    // Add new case
      return new FunctionsApp(config);
    default:
      return new AksCluster(config);
  }
}
```

### Step 4: Update Schema

```typescript
// config/schema.ts
export type ComputeType = "aks" | "appservice" | "container-apps" | "functions";

export interface ApplicationConfig {
  // ...existing fields
  functions?: FunctionsConfig;
}
```

### Step 5: Add Configuration Defaults

```typescript
// config/defaults.ts
export const defaultFunctionsConfig: Partial<FunctionsConfig> = {
  runtime: "node",
  version: "4",
  sku: "Y1",  // Consumption
};
```

### Step 6: Update Documentation

Add to `docs/architecture/application-landing-zone.md`:

```markdown
### Azure Functions

Best for: Event-driven, serverless compute.

\`\`\`yaml
computeType: functions
functions:
  runtime: node
  version: "4"
  sku: Y1  # Consumption
\`\`\`
```

## Adding New Resource Type

Example: Adding Azure Service Bus.

### Step 1: Create Component

```typescript
// packages/core/lib/messaging/servicebus.ts
import * as pulumi from "@pulumi/pulumi";
import * as azure from "@pulumi/azure-native";

export interface ServiceBusConfig {
  resourceGroupName: pulumi.Input<string>;
  location: pulumi.Input<string>;
  sku: "Basic" | "Standard" | "Premium";
  queues?: string[];
  topics?: string[];
}

export class ServiceBusNamespace extends pulumi.ComponentResource {
  public readonly namespaceId: pulumi.Output<string>;
  public readonly connectionString: pulumi.Output<string>;

  constructor(
    name: string,
    args: ServiceBusConfig,
    opts?: pulumi.ComponentResourceOptions
  ) {
    super("enterprise:messaging:ServiceBusNamespace", name, args, opts);

    const namespace = new azure.servicebus.Namespace(`${name}-sb`, {
      resourceGroupName: args.resourceGroupName,
      location: args.location,
      sku: { name: args.sku },
    }, { parent: this });

    // Create queues
    for (const queueName of args.queues || []) {
      new azure.servicebus.Queue(`${name}-${queueName}`, {
        resourceGroupName: args.resourceGroupName,
        namespaceName: namespace.name,
        queueName: queueName,
      }, { parent: this });
    }

    this.namespaceId = namespace.id;
    this.connectionString = pulumi.all([
      args.resourceGroupName,
      namespace.name
    ]).apply(([rg, ns]) =>
      azure.servicebus.listNamespaceKeys({
        resourceGroupName: rg,
        namespaceName: ns,
        authorizationRuleName: "RootManageSharedAccessKey",
      }).then(keys => keys.primaryConnectionString)
    );

    this.registerOutputs({
      namespaceId: this.namespaceId,
      connectionString: this.connectionString,
    });
  }
}
```

### Step 2: Export from Index

```typescript
// packages/core/lib/index.ts
export * from "./messaging/servicebus";
```

### Step 3: Use in Workload

```typescript
// stacks/02-workloads/my-app/index.ts
import { ServiceBusNamespace } from "@enterprise/core";

const servicebus = new ServiceBusNamespace("messaging", {
  resourceGroupName: workload.resourceGroupName,
  location: workload.location,
  sku: "Standard",
  queues: ["orders", "notifications"],
}, { parent: workload });
```

## Testing Components

### Unit Test Example

```typescript
// packages/core/lib/compute/aks.test.ts
import * as pulumi from "@pulumi/pulumi";
import { AksCluster } from "./aks";

pulumi.runtime.setMocks({
  newResource: (args) => ({ id: `${args.name}-id`, state: args.inputs }),
  call: (args) => args.inputs,
});

describe("AksCluster", () => {
  it("creates cluster with correct name", async () => {
    const cluster = new AksCluster("test", {
      kubernetesVersion: "1.28",
      // ...
    });

    const name = await cluster.outputs.aksClusterName.promise();
    expect(name).toContain("test");
  });
});
```
