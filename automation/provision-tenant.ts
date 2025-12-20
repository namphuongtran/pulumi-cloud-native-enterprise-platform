/**
 * Tenant Onboarding Script
 * 
 * Provisions a new tenant with all necessary resources
 * 
 * Usage:
 *   TENANT_ID=bigcorp TENANT_NAME="Big Corporation" ts-node provision-tenant.ts
 */

import { LocalWorkspace, Stack } from "@pulumi/pulumi/automation";
import * as path from "path";

interface TenantConfig {
  tenantId: string;
  tenantName: string;
  environment: "prod" | "staging" | "dev";
  location: "eastus" | "westus";
  databaseIsolation: "isolated" | "shared";
  costCenter?: string;
  owner?: string;
}

/**
 * Provision a new tenant
 */
async function provisionTenant(config: TenantConfig) {
  const { tenantId, tenantName, environment, location } = config;
  const stackName = `app-${tenantId}-${environment}-${location}`;

  console.log(`\n${"#".repeat(60)}`);
  console.log(`# TENANT ONBOARDING`);
  console.log(`#${" ".repeat(58)}#`);
  console.log(`# Tenant ID: ${tenantId.padEnd(45)}#`);
  console.log(`# Tenant Name: ${tenantName.padEnd(41)}#`);
  console.log(`# Stack: ${stackName.padEnd(51)}#`);
  console.log(`${"#".repeat(60)}\n`);

  try {
    console.log(`🔍 Creating Pulumi stack: ${stackName}`);

    const stack = await LocalWorkspace.createStack({
      workDir: path.join(__dirname, "../stacks/application-services"),
      stackName,
    });

    console.log("✅ Stack created");

    // Set tenant configuration
    console.log("\n⚙️  Setting tenant configuration...");
    await stack.setConfig("infrastructure:tenantId", { value: tenantId });
    await stack.setConfig("infrastructure:environment", { value: environment });
    await stack.setConfig("infrastructure:location", { value: location });
    await stack.setConfig("database:isolation", { value: config.databaseIsolation });
    await stack.setConfig("database:skuName", { value: environment === "prod" ? "S3" : "S1" });
    await stack.setConfig("database:skuTier", { value: "Standard" });
    await stack.setConfig("keyvault:sku", { value: environment === "prod" ? "premium" : "standard" });
    await stack.setConfig("enablePrivateEndpoints", { value: "true" });
    await stack.setConfig("enableWorkloadIdentity", { value: "true" });

    if (config.costCenter) {
      await stack.setConfig("tenant:costCenter", { value: config.costCenter });
    }
    if (config.owner) {
      await stack.setConfig("tenant:owner", { value: config.owner });
    }

    console.log("✅ Configuration set");

    // Preview
    console.log("\n🔍 Running preview...");
    const preview = await stack.preview();
    console.log(`Preview complete: ${preview.changeSummary?.create || 0} resources to create`);

    // Deploy
    console.log("\n🚀 Deploying tenant stack...");
    const upResult = await stack.up();

    console.log("\n✅ Tenant provisioned successfully!");
    console.log("\nTenant Outputs:");
    for (const [key, value] of Object.entries(upResult.outputs)) {
      console.log(`  ${key}: ${JSON.stringify(value.value).slice(0, 100)}`);
    }

    console.log(`\n🎉 Tenant ${tenantId} is ready!`);
    console.log(`Stack name: ${stackName}`);
    console.log(`Update stack: pulumi stack select ${stackName}`);
  } catch (error: any) {
    console.error(`\n❌ Failed to provision tenant: ${error.message}`);
    process.exit(1);
  }
}

// ============================================================
// MAIN
// ============================================================

const tenantConfig: TenantConfig = {
  tenantId: process.env.TENANT_ID || "default-tenant",
  tenantName: process.env.TENANT_NAME || "Default Tenant",
  environment: (process.env.DEPLOYMENT_ENV || "prod") as any,
  location: (process.env.DEPLOYMENT_LOCATION || "eastus") as any,
  databaseIsolation: "isolated",
  costCenter: process.env.TENANT_COST_CENTER,
  owner: process.env.TENANT_OWNER,
};

console.log("Tenant Configuration:", tenantConfig);

provisionTenant(tenantConfig)
  .then(() => {
    console.log("\n✨ Tenant onboarding complete");
    process.exit(0);
  })
  .catch((err) => {
    console.error("\n💥 Tenant onboarding failed:", err);
    process.exit(1);
  });
