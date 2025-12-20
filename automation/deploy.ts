/**
 * Orchestrated Multi-Stack Deployment
 * 
 * Deploys the entire platform in order:
 * 1. Platform layer (networking, AKS, databases)
 * 2. Services layer (Kubernetes add-ons)
 * 3. Application layer (tenant-specific resources)
 * 
 * Usage:
 *   DEPLOYMENT_ENV=prod DEPLOYMENT_LOCATION=eastus TENANT_ID=acme ts-node deploy.ts
 */

import { LocalWorkspace, Stack } from "@pulumi/pulumi/automation";
import * as path from "path";

interface DeploymentContext {
  org: string;
  project: string;
  environment: "dev" | "staging" | "prod";
  location: "eastus" | "westus" | "northeurope" | "westeurope";
  tenantId?: string;
}

/**
 * Deploy a single stack and return its outputs
 */
async function deployStack(
  stackName: string,
  projectPath: string,
  config: Record<string, string>,
  dependencyOutputs?: Record<string, string>
): Promise<Record<string, any>> {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`📦 Deploying stack: ${stackName}`);
  console.log(`${"=".repeat(60)}\n`);

  try {
    const stack = await LocalWorkspace.selectStack({
      workDir: projectPath,
      stackName,
    });

    // Set stack configuration
    for (const [key, value] of Object.entries(config)) {
      await stack.setConfig(key, { value: String(value) });
    }

    // Pass upstream outputs as configuration
    if (dependencyOutputs) {
      for (const [key, value] of Object.entries(dependencyOutputs)) {
        await stack.setConfig(`upstream:${key}`, { value });
      }
    }

    // Run preview
    console.log("🔍 Running preview...");
    const preview = await stack.preview();
    console.log(`Preview complete: ${preview.changeSummary?.create || 0} to create`);

    // Deploy
    console.log("🚀 Deploying...");
    const upResult = await stack.up();

    console.log(`✅ Stack ${stackName} deployed successfully`);
    console.log("\nOutputs:");
    for (const [key, value] of Object.entries(upResult.outputs)) {
      console.log(`  ${key}: ${JSON.stringify(value.value).slice(0, 100)}...`);
    }

    return upResult.outputs;
  } catch (error) {
    console.error(`❌ Failed to deploy ${stackName}:`, error);
    throw error;
  }
}

/**
 * Main deployment orchestration
 */
async function deployEntirePlatform(context: DeploymentContext) {
  const { org, project, environment, location, tenantId } = context;
  const stackSuffix = `${environment}-${location}`;

  console.log(`\n${"#".repeat(60)}`);
  console.log(`# ENTERPRISE PLATFORM DEPLOYMENT`);
  console.log(`#${" ".repeat(58)}#`);
  console.log(`# Environment: ${environment.padEnd(45)}#`);
  console.log(`# Location: ${location.padEnd(49)}#`);
  console.log(`# Org: ${org.padEnd(54)}#`);
  if (tenantId) {
    console.log(`# Tenant: ${tenantId.padEnd(52)}#`);
  }
  console.log(`${"#".repeat(60)}\n`);

  try {
    // ==================== LAYER 1: PLATFORM ====================
    console.log("\n🔷 LAYER 1: Platform Services");
    const platformStackName = `platform-${stackSuffix}`;
    const platformConfig = {
      "azure:location": location,
      "infrastructure:environment": environment,
      "infrastructure:location": location,
      "infrastructure:clusterType": "aks",
      "database:redundancyLevel": environment === "prod" ? "high" : "medium",
      "database:isolation": "shared",
      "sql:adminUsername": "azureAdmin",
      "sql:adminPassword": process.env.SQL_ADMIN_PASSWORD || "ChangeMe@123!",
    };

    const platformOutputs = await deployStack(
      platformStackName,
      path.join(__dirname, "../stacks/platform-services"),
      platformConfig
    );

    const platformOutputsMap = {
      resourceGroupName: String(platformOutputs.resourceGroupName?.value || ""),
      vnetId: String(platformOutputs.vnetId?.value || ""),
      aksClusterId: String(platformOutputs.aksClusterId?.value || ""),
      dbServerName: String(platformOutputs.dbServerName?.value || ""),
      keyVaultUri: String(platformOutputs.keyVaultUri?.value || ""),
    };

    console.log("\n📊 Platform Layer Outputs:");
    console.log(JSON.stringify(platformOutputsMap, null, 2));

    // ==================== LAYER 2: SERVICES ====================
    console.log("\n🔷 LAYER 2: Services Add-ons");
    const servicesStackName = `services-${stackSuffix}`;
    const servicesConfig = {
      "infrastructure:environment": environment,
      "infrastructure:location": location,
      "services:enableGrafana": "true",
      "services:enableKyverno": environment === "prod" ? "true" : "false",
      "services:enableOpenSearch": environment === "prod" ? "true" : "false",
      "services:enableUptimeKuma": environment === "prod" ? "true" : "false",
    };

    const servicesOutputs = await deployStack(
      servicesStackName,
      path.join(__dirname, "../stacks/services-addons"),
      servicesConfig,
      platformOutputsMap
    );

    console.log("\n📊 Services Layer Outputs:");
    console.log(JSON.stringify(servicesOutputs, null, 2));

    // ==================== LAYER 3: APPLICATION (Multi-tenant) ====================
    console.log("\n🔷 LAYER 3: Application Services");

    if (!tenantId) {
      console.log("⚠️  No tenantId provided - skipping application layer");
      console.log("To deploy application layer, run:");
      console.log("  DEPLOYMENT_ENV=prod DEPLOYMENT_LOCATION=eastus TENANT_ID=acme ts-node deploy.ts");
    } else {
      const appStackName = `app-${tenantId}-${stackSuffix}`;
      const appConfig = {
        "infrastructure:tenantId": tenantId,
        "infrastructure:environment": environment,
        "infrastructure:location": location,
        "database:isolation": "isolated",
        "database:skuName": environment === "prod" ? "S3" : "S1",
        "database:skuTier": "Standard",
        "keyvault:sku": environment === "prod" ? "premium" : "standard",
        "enablePrivateEndpoints": "true",
        "enableWorkloadIdentity": "true",
      };

      const appOutputs = await deployStack(
        appStackName,
        path.join(__dirname, "../stacks/application-services"),
        appConfig,
        platformOutputsMap
      );

      console.log(`\n📊 Application Layer Outputs (Tenant: ${tenantId}):`);
      console.log(JSON.stringify(appOutputs, null, 2));
    }

    // ==================== SUMMARY ====================
    console.log(`\n${"=".repeat(60)}`);
    console.log("✅ DEPLOYMENT SUCCESSFUL");
    console.log(`${"=".repeat(60)}\n`);
    console.log("Deployed Stacks:");
    console.log(`  1. Platform:     ${platformStackName}`);
    console.log(`  2. Services:     ${servicesStackName}`);
    if (tenantId) {
      console.log(`  3. Application:  app-${tenantId}-${stackSuffix}`);
    }
    console.log("");
  } catch (error) {
    console.error("\n❌ DEPLOYMENT FAILED");
    console.error(error);
    process.exit(1);
  }
}

// ============================================================
// MAIN
// ============================================================

const context: DeploymentContext = {
  org: process.env.PULUMI_ORG || "myorg",
  project: process.env.PULUMI_PROJECT || "cloud-native-platform",
  environment: (process.env.DEPLOYMENT_ENV || "dev") as any,
  location: (process.env.DEPLOYMENT_LOCATION || "eastus") as any,
  tenantId: process.env.TENANT_ID,
};

console.log("Deployment Context:", context);

deployEntirePlatform(context)
  .then(() => {
    console.log("\n🎉 All stacks deployed successfully!");
    process.exit(0);
  })
  .catch((err) => {
    console.error("\n💥 Deployment failed:", err.message);
    process.exit(1);
  });
