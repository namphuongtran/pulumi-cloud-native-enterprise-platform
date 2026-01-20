# Testing Guide

Strategies for testing Pulumi infrastructure code.

## Testing Levels

| Level | What | How |
|-------|------|-----|
| Unit | Component logic | Pulumi mocks |
| Integration | Stack deployment | Pulumi preview |
| E2E | Full deployment | Pulumi up + validation |

## Unit Testing

### Setup

```bash
pnpm add -D vitest @pulumi/pulumi
```

### Mocking Pulumi

```typescript
// test/setup.ts
import * as pulumi from "@pulumi/pulumi";

pulumi.runtime.setMocks({
  newResource: (args: pulumi.runtime.MockResourceArgs) => {
    return {
      id: `${args.name}-id`,
      state: {
        ...args.inputs,
        name: args.inputs.name || args.name,
      },
    };
  },
  call: (args: pulumi.runtime.MockCallArgs) => {
    return args.inputs;
  },
});
```

### Example Unit Test

```typescript
// packages/core/lib/naming.test.ts
import { describe, it, expect } from "vitest";
import { platformResourceName, validateResourceName } from "./naming";

describe("platformResourceName", () => {
  it("generates correct name format", () => {
    const name = platformResourceName("myapp", "rg", {
      org: "contoso",
      environment: "prod",
      location: "eastus",
    });

    expect(name).toBe("contoso-myapp-prod-eastus-rg");
  });

  it("truncates long names", () => {
    const name = platformResourceName("verylongapplicationname", "st", {
      org: "contoso",
      environment: "production",
      location: "eastus",
    });

    expect(name.length).toBeLessThanOrEqual(24);
  });
});

describe("validateResourceName", () => {
  it("rejects invalid characters", () => {
    const result = validateResourceName("my_resource!", "rg");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("invalid characters");
  });
});
```

### Testing Components

```typescript
// packages/core/lib/compute/aks.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import * as pulumi from "@pulumi/pulumi";

// Setup mocks before imports
beforeAll(() => {
  pulumi.runtime.setMocks({
    newResource: (args) => ({
      id: `${args.name}-id`,
      state: args.inputs,
    }),
    call: (args) => args.inputs,
  });
});

describe("AksCluster", () => {
  it("creates cluster with workload identity", async () => {
    const { AksCluster } = await import("./aks");

    const cluster = new AksCluster("test-cluster", {
      resourceGroupName: "test-rg",
      location: "eastus",
      kubernetesVersion: "1.28",
      enableWorkloadIdentity: true,
    });

    // Test outputs
    const outputs = cluster.outputs;
    expect(outputs).toBeDefined();
  });
});
```

## Integration Testing

### Using Pulumi Preview

```bash
# Preview without deploying
pulumi preview --stack test-eastus --json > preview.json

# Check for expected resources
jq '.steps[] | select(.op == "create") | .urn' preview.json
```

### Automated Preview Test

```typescript
// test/integration/platform.test.ts
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

describe("Platform Stack", () => {
  it("previews without errors", async () => {
    const { stdout, stderr } = await execAsync(
      "pulumi preview --stack test-eastus --json",
      { cwd: "stacks/01-platform/connectivity" }
    );

    const preview = JSON.parse(stdout);
    expect(preview.changeSummary.create).toBeGreaterThan(0);
  }, 60000);
});
```

## End-to-End Testing

### Deploy and Validate

```bash
#!/bin/bash
# test/e2e/test-deployment.sh

set -euo pipefail

STACK="e2e-test-$(date +%s)"

# Deploy
pulumi stack init "$STACK"
pulumi up --yes --stack "$STACK"

# Validate
RESOURCE_GROUP=$(pulumi stack output resourceGroupName --stack "$STACK")
az group show --name "$RESOURCE_GROUP" --query "properties.provisioningState" -o tsv | grep -q "Succeeded"

# Cleanup
pulumi destroy --yes --stack "$STACK"
pulumi stack rm "$STACK" --yes
```

### Resource Validation

```typescript
// test/e2e/validate.ts
import { DefaultAzureCredential } from "@azure/identity";
import { ResourceManagementClient } from "@azure/arm-resources";

async function validateDeployment(resourceGroupName: string) {
  const credential = new DefaultAzureCredential();
  const client = new ResourceManagementClient(credential, subscriptionId);

  const resources = [];
  for await (const resource of client.resources.listByResourceGroup(resourceGroupName)) {
    resources.push(resource);
  }

  // Assertions
  const vnet = resources.find(r => r.type === "Microsoft.Network/virtualNetworks");
  expect(vnet).toBeDefined();

  const aks = resources.find(r => r.type === "Microsoft.ContainerService/managedClusters");
  expect(aks).toBeDefined();
}
```

## Configuration Testing

### Schema Validation

```typescript
// test/config.test.ts
import { describe, it, expect } from "vitest";
import Ajv from "ajv";
import * as yaml from "yaml";
import * as fs from "fs";

describe("Configuration", () => {
  it("examples match schema", () => {
    const ajv = new Ajv();
    const schema = JSON.parse(fs.readFileSync("config/schema.json", "utf-8"));
    const validate = ajv.compile(schema);

    const examples = fs.readdirSync("config/examples");
    for (const example of examples) {
      const config = yaml.parse(
        fs.readFileSync(`config/examples/${example}`, "utf-8")
      );
      const valid = validate(config);
      expect(valid, `${example}: ${JSON.stringify(validate.errors)}`).toBe(true);
    }
  });
});
```

## Running Tests

```bash
# All tests
pnpm -r test

# Specific package
cd packages/core && pnpm test

# Watch mode
pnpm test --watch

# Coverage
pnpm test --coverage
```

## CI Integration

```yaml
# .github/workflows/test.yml
name: Test
on: [push, pull_request]

jobs:
  unit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - run: pnpm install
      - run: pnpm -r test

  preview:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pulumi/actions@v4
        with:
          command: preview
          stack-name: test
        env:
          PULUMI_ACCESS_TOKEN: ${{ secrets.PULUMI_ACCESS_TOKEN }}
```

## Best Practices

1. **Test naming logic thoroughly** - Naming bugs cause resource recreation
2. **Mock external calls** - Don't hit Azure in unit tests
3. **Use preview for integration** - Catches config errors without deploying
4. **Clean up E2E resources** - Always destroy test stacks
5. **Test configuration validation** - Invalid config should fail fast
