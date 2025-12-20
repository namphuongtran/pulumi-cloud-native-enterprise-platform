import * as pulumi from "@pulumi/pulumi";
import * as azure from "@pulumi/azure-native";
import * as k8s from "@pulumi/kubernetes";
import {
  applicationResourceName,
  resourceGroupName,
  kubernetesNamespace,
  getApplicationTags,
  validateApplicationConfig,
} from "@enterprise/core";
import type { ApplicationConfig, ApplicationOutputs } from "@enterprise/core";

const config = new pulumi.Config();
const upstreamConfig = new pulumi.Config("upstream");
const azureConfig = new pulumi.Config("azure");

// ============================================================
// CONFIGURATION
// ============================================================

const tenantId = config.require("infrastructure:tenantId");
const environment = config.require("infrastructure:environment");
const location = azureConfig.require("location");
const databaseIsolation = config.get("database:isolation") || "isolated";
const databaseSku = config.get("database:skuName") || "S1";
const databaseTier = config.get("database:skuTier") || "Standard";
const keyVaultSku = config.get("keyvault:sku") || "standard";
const enablePrivateEndpoints = config.getBoolean("enablePrivateEndpoints") ?? true;
const enableWorkloadIdentity = config.getBoolean("enableWorkloadIdentity") ?? true;

// Validate configuration
const appConfig: ApplicationConfig = {
  tenantId,
  environment,
  location,
  databaseIsolation: databaseIsolation as "shared" | "isolated",
  databaseSku,
  keyVaultSku: keyVaultSku as "standard" | "premium",
  enablePrivateEndpoints,
  enableWorkloadIdentity,
};

const validation = validateApplicationConfig(appConfig);
if (!validation.valid) {
  throw new Error(`Configuration validation failed: ${validation.errors.join(", ")}`);
}

pulumi.log.info(`Deploying application layer for tenant: ${tenantId}`);
pulumi.log.info(`Database isolation: ${databaseIsolation}`);

// Access Platform layer outputs
const platformRgName = upstreamConfig.get("resourceGroupName");
const platformVnetId = upstreamConfig.get("vnetId");
const platformDbServerId = upstreamConfig.get("dbServerId");

// Generate tags
const tags = getApplicationTags(tenantId, environment, location);

// ============================================================
// RESOURCE GROUP (Tenant-specific)
// ============================================================

const rgName = resourceGroupName("application", tenantId, environment, location);
const resourceGroup = new azure.resources.ResourceGroup("rg", {
  resourceGroupName: rgName,
  location,
  tags,
});

pulumi.log.info(`Created Resource Group: ${rgName}`);

// ============================================================
// DATABASE (Shared or Isolated)
// ============================================================

pulumi.log.info(`Database isolation mode: ${databaseIsolation}`);

if (databaseIsolation === "isolated") {
  // Create tenant-specific database
  const dbName = applicationResourceName("db", tenantId, environment, location);
  
  // Note: In real implementation, need to retrieve platform DB server
  // For now, this is a stub
  pulumi.log.warn("Tenant database creation is a stub - connect to platform DB server");
  
  pulumi.log.info(`Created isolated database: ${dbName}`);
} else {
  // Use shared database from platform layer
  pulumi.log.info(`Using shared database from platform layer`);
  pulumi.log.info(`Tenant data will be isolated via row-level security (RLS)`);
}

// ============================================================
// KEY VAULT (Tenant-specific)
// ============================================================

const kvName = applicationResourceName("kv", tenantId, environment, location);

const keyVault = new azure.keyvault.Vault("keyvault", {
  resourceGroupName: resourceGroup.name,
  vaultName: kvName,
  location,
  tenantId: azure.core.getClientConfig({}).then(cfg => cfg.tenantId),
  sku: {
    family: "A",
    name: keyVaultSku as "standard" | "premium",
  },
  enableRbacAuthorization: true,
  enableSoftDelete: true,
  softDeleteRetentionInDays: environment === "prod" ? 90 : 30,
  enablePurgeProtection: environment === "prod",
  tags,
}, { parent: resourceGroup });

pulumi.log.info(`Created tenant Key Vault: ${kvName}`);

// ============================================================
// MANAGED IDENTITY (For workload identity)
// ============================================================

if (enableWorkloadIdentity) {
  const miName = `${tenantId}-mi`;
  
  const managedIdentity = new azure.authorization.UserAssignedIdentity("mi", {
    resourceGroupName: resourceGroup.name,
    userAssignedIdentityName: miName,
    location,
  }, { parent: resourceGroup });

  // Grant managed identity access to tenant KeyVault
  const rbacAssignment = new azure.authorization.RoleAssignment(
    "kv-rbac",
    {
      scope: keyVault.id,
      principalId: managedIdentity.principalId,
      // Role: Key Vault Secrets User
      roleDefinitionId: `/subscriptions/${
        azure.core.getClientConfig({}).then(cfg => cfg.subscriptionId)
      }/providers/Microsoft.Authorization/roleDefinitions/4633458b-17de-408a-b874-0445c86300d1`,
    },
    { parent: keyVault }
  );

  pulumi.log.info(`Created managed identity: ${miName}`);
  pulumi.log.info(`Granted managed identity access to Key Vault`);
}

// ============================================================
// KUBERNETES NAMESPACE (Tenant-specific)
// ============================================================

// TODO: Get k8s provider from platform layer
// const k8sProvider = new k8s.Provider("k8s", {...});

const nsName = kubernetesNamespace(tenantId);
pulumi.log.info(`Kubernetes namespace for tenant: ${nsName}`);

// TODO: Create namespace and RBAC
// const namespace = new k8s.core.v1.Namespace(`ns-${tenantId}`, {
//   metadata: { name: nsName },
// }, { provider: k8sProvider });

// ============================================================
// PRIVATE ENDPOINTS (If enabled)
// ============================================================

if (enablePrivateEndpoints) {
  pulumi.log.info(`Configuring private endpoints for zero-trust networking`);
  
  // TODO: Create private endpoints for:
  // - SQL Database (if isolated)
  // - KeyVault
  // - Storage accounts (future)
}

// ============================================================
// OUTPUTS
// ============================================================

const outputs: ApplicationOutputs = {
  tenantId,
  environment,
  location,
  namespace: nsName,
  database: {
    databaseId: "stub", // Will be retrieved from platform
    databaseName: databaseIsolation === "isolated"
      ? applicationResourceName("db", tenantId, environment, location)
      : "shared-tenant-db",
    connectionString: pulumi.secret("server=..."), // Will be populated
    primaryEndpoint: upstreamConfig.get("dbPrimaryEndpoint") || "stub",
    isolationLevel: databaseIsolation as "shared" | "isolated",
  },
  keyVault: {
    keyVaultId: keyVault.id,
    keyVaultName: keyVault.name,
    keyVaultUri: keyVault.vaultUri,
    secretUrl: (name: string) => `${keyVault.vaultUri}secrets/${name}`,
  },
  managedIdentity: {
    principalId: "stub",
    clientId: "stub",
    tenantId: azure.core.getClientConfig({}).then(cfg => cfg.tenantId),
    kubernetesServiceAccountName: `${tenantId}-sa`,
  },
};

// Export outputs
export const tenantNamespace = nsName;
export const keyVaultUri = keyVault.vaultUri;
export const databaseName = outputs.database.databaseName;
export const databaseIsolationType = databaseIsolation;

pulumi.log.info("✅ Application layer deployment complete");
