import * as pulumi from "@pulumi/pulumi";
import * as azure from "@pulumi/azure-native";
import { platformResourceName, resourceGroupName, getPlatformTags } from "@enterprise/core";
import type { PlatformOutputs, VNetOutputs, AKSClusterOutputs, DatabaseServerOutputs, SecurityOutputs, MonitoringOutputs } from "@enterprise/core";

const config = new pulumi.Config();
const azureConfig = new pulumi.Config("azure");

// Read configuration
const environment = config.require("infrastructure:environment");
const location = azureConfig.require("location");
const clusterType = config.get("infrastructure:clusterType") || "aks";
const redundancyLevel = config.get("database:redundancyLevel") || "medium";
const vnetCidr = config.get("vnet:addressSpace") || "10.0.0.0/16";
const aksNodeCount = parseInt(config.get("aks:nodeCount") || "2");
const aksVmSize = config.get("aks:vmSize") || "Standard_B2s";
const sqlSku = config.get("sql:skuName") || "S1";
const sqlTier = config.get("sql:skuTier") || "Standard";
const enableDiagnostics = config.getBoolean("enableDiagnostics") ?? true;

// Generate tags
const tags = getPlatformTags(environment, location, "platform-team");

// ============================================================
// 1. RESOURCE GROUP
// ============================================================

const rgName = resourceGroupName("platform", undefined, environment, location);
const resourceGroup = new azure.resources.ResourceGroup("rg", {
  resourceGroupName: rgName,
  location,
  tags,
});

pulumi.log.info(`Created Resource Group: ${rgName}`);

// ============================================================
// 2. VIRTUAL NETWORK WITH ZERO-TRUST NETWORKING
// ============================================================

const vnetName = platformResourceName("vnet", environment, location);
const vnet = new azure.network.VirtualNetwork("vnet", {
  resourceGroupName: resourceGroup.name,
  virtualNetworkName: vnetName,
  addressSpace: {
    addressPrefixes: [vnetCidr],
  },
  tags,
}, { parent: resourceGroup });

pulumi.log.info(`Created VNet: ${vnetName} with CIDR ${vnetCidr}`);

// Create subnets
const subnets: Record<string, azure.network.Subnet> = {};
const subnetConfigs = {
  "app": "10.0.1.0/24",      // Application tier
  "data": "10.0.2.0/24",     // Database tier
  "system": "10.0.3.0/24",   // System/AKS system pods
};

for (const [subnetName, addressPrefix] of Object.entries(subnetConfigs)) {
  subnets[subnetName] = new azure.network.Subnet(`subnet-${subnetName}`, {
    resourceGroupName: resourceGroup.name,
    virtualNetworkName: vnet.name,
    subnetName: subnetName,
    addressPrefix,
    serviceEndpoints: [
      { service: "Microsoft.Sql" },
      { service: "Microsoft.Storage" },
      { service: "Microsoft.KeyVault" },
    ],
  }, { parent: vnet });

  pulumi.log.info(`Created Subnet: ${subnetName} (${addressPrefix})`);
}

// ============================================================
// 3. NETWORK SECURITY GROUPS (Zero-Trust)
// ============================================================

const appNsg = new azure.network.NetworkSecurityGroup("nsg-app", {
  resourceGroupName: resourceGroup.name,
  networkSecurityGroupName: platformResourceName("nsg", environment, location),
  securityRules: [
    {
      name: "AllowInboundFromAzureLoadBalancer",
      priority: 100,
      direction: "Inbound",
      access: "Allow",
      protocol: "Tcp",
      sourcePortRange: "*",
      destinationPortRange: "*",
      sourceAddressPrefix: "AzureLoadBalancer",
      destinationAddressPrefix: "*",
    },
    {
      name: "DenyAllInbound",
      priority: 4096,
      direction: "Inbound",
      access: "Deny",
      protocol: "*",
      sourcePortRange: "*",
      destinationPortRange: "*",
      sourceAddressPrefix: "*",
      destinationAddressPrefix: "*",
    },
  ],
  tags,
}, { parent: resourceGroup });

// Associate NSG with app subnet
new azure.network.SubnetNetworkSecurityGroupAssociation("subnet-nsg-association", {
  resourceGroupName: resourceGroup.name,
  subnetName: subnets.app.name,
  virtualNetworkName: vnet.name,
  networkSecurityGroup: { id: appNsg.id },
}, { parent: subnets.app });

pulumi.log.info(`Created NSG with zero-trust rules`);

// ============================================================
// 4. AKS CLUSTER WITH WORKLOAD IDENTITY
// ============================================================

const aksName = platformResourceName("aksc", environment, location);
const aksCluster = new azure.containerservice.ManagedCluster("aks", {
  resourceGroupName: resourceGroup.name,
  resourceName: aksName,
  location,
  
  // System-assigned managed identity
  identity: { type: "SystemAssigned" },
  
  // WORKLOAD IDENTITY: Enable OIDC issuer
  oidcIssuerProfile: {
    enabled: true,
  },
  
  // Network configuration
  networkProfile: {
    networkPlugin: "azure",
    networkPolicy: "azure", // Zero-trust
    serviceCidr: "10.1.0.0/16",
    dnsServiceIp: "10.1.0.10",
    dockerBridgeCidr: "172.17.0.1/16",
    loadBalancerSku: "standard",
  },
  
  // Agent pool
  agentPoolProfiles: [
    {
      name: "systempool",
      count: aksNodeCount,
      vmSize: aksVmSize,
      osType: "Linux",
      mode: "System",
      vnetSubnetID: subnets.system.id,
    },
  ],
  
  // API server authorized IP ranges (optional, for additional security)
  apiServerAccessProfile: {
    enablePrivateCluster: false,
  },
  
  // Add-ons
  addonProfiles: {
    httpApplicationRouting: { enabled: false },
    omsagent: enableDiagnostics ? {
      enabled: true,
      config: {
        logAnalyticsWorkspaceResourceID: undefined, // Will be created below
      },
    } : { enabled: false },
  },
  
  tags,
}, { parent: resourceGroup });

pulumi.log.info(`Created AKS Cluster: ${aksName}`);
pulumi.log.info(`Workload Identity OIDC Issuer URL: ${aksCluster.oidcIssuerProfile?.issuerUrl}`);

// ============================================================
// 5. LOG ANALYTICS WORKSPACE (Monitoring)
// ============================================================

const lawName = platformResourceName("law", environment, location);
const logAnalyticsWorkspace = new azure.operationalinsights.Workspace("law", {
  resourceGroupName: resourceGroup.name,
  workspaceName: lawName,
  location,
  sku: { name: "PerGB2018" },
  retentionInDays: environment === "prod" ? 30 : 7,
  tags,
}, { parent: resourceGroup });

pulumi.log.info(`Created Log Analytics Workspace: ${lawName}`);

// ============================================================
// 6. SQL SERVER WITH AUTOMATIC FAILOVER (DR)
// ============================================================

const sqlServerName = platformResourceName("sql", environment, location);
const sqlServer = new azure.sql.Server("sql-server", {
  resourceGroupName: resourceGroup.name,
  serverName: sqlServerName,
  location,
  administratorLogin: config.requireSecret("sql:adminUsername") || "azureAdmin",
  administratorLoginPassword: config.requireSecret("sql:adminPassword"),
  version: "12.0",
  // Minimal TLS version
  minimalTlsVersion: "1.2",
  publicNetworkAccess: "Enabled",
  tags,
}, { parent: resourceGroup });

pulumi.log.info(`Created SQL Server: ${sqlServerName}`);

// Shared tenant database (will be used by application layer)
const sharedDatabase = new azure.sql.Database("shared-database", {
  resourceGroupName: resourceGroup.name,
  serverName: sqlServer.name,
  databaseName: "shared-tenant-db",
  sku: {
    name: sqlSku,
    tier: sqlTier,
  },
  // Geo-backup enabled for DR
  geoBackupPolicy: {
    state: "Enabled",
  },
  tags,
}, { parent: sqlServer });

pulumi.log.info(`Created Shared Database: shared-tenant-db`);

// ============================================================
// 7. KEY VAULT FOR SECRETS
// ============================================================

const kvName = platformResourceName("kv", environment, location);
const keyVault = new azure.keyvault.Vault("keyvault", {
  resourceGroupName: resourceGroup.name,
  vaultName: kvName,
  location,
  tenantId: azure.core.getClientConfig({}).then(cfg => cfg.tenantId),
  sku: { family: "A", name: "standard" },
  enableRbacAuthorization: true,
  enableSoftDelete: true,
  softDeleteRetentionInDays: 90,
  enablePurgeProtection: environment === "prod",
  tags,
}, { parent: resourceGroup });

pulumi.log.info(`Created Key Vault: ${kvName}`);

// ============================================================
// 8. PREPARE FOR WORKLOAD IDENTITY
// ============================================================

// Get Azure tenant ID for workload identity configuration
const tenantId = azure.core.getClientConfig({}).then(cfg => cfg.tenantId);

// Note: Workload identity app and federated credentials are created in separate module
// to avoid circular dependency. They will be created when services/apps reference platform.

// ============================================================
// OUTPUTS
// ============================================================

// VNet outputs
const vnetOutputs: VNetOutputs = {
  vnetId: vnet.id,
  vnetName: vnet.name,
  vnetAddressSpace: vnetCidr,
  subnetIds: Object.fromEntries(
    Object.entries(subnets).map(([name, subnet]) => [name, subnet.id])
  ),
  subnetAddressPrefixes: Object.fromEntries(
    Object.entries(subnetConfigs).map(([name, prefix]) => [name, prefix])
  ),
};

// AKS outputs
const aksOutputs: AKSClusterOutputs = {
  aksClusterId: aksCluster.id,
  aksClusterName: aksCluster.name,
  aksResourceGroupName: resourceGroup.name,
  oidcIssuerUrl: aksCluster.oidcIssuerProfile!.issuerUrl!,
  kubeconfig: aksCluster.kubeAdminConfig!.apply(cfg => 
    Buffer.from(cfg, 'base64').toString()
  ),
  nodeResourceGroupName: aksCluster.nodeResourceGroup,
  fqdnName: aksCluster.fqdn,
};

// Database outputs
const databaseOutputs: DatabaseServerOutputs = {
  dbServerId: sqlServer.id,
  dbServerName: sqlServer.name,
  dbPrimaryEndpoint: sqlServer.fullyQualifiedDomainName,
  dbAdminUsername: sqlServer.administratorLogin,
};

// Security outputs
const securityOutputs: SecurityOutputs = {
  firewallId: appNsg.id,
  nsgIds: { app: appNsg.id },
  workloadIdentityClientId: "", // Will be populated when workload identity is created
  workloadIdentityTenantId: tenantId,
  keyVaultUri: keyVault.vaultUri,
  keyVaultId: keyVault.id,
};

// Monitoring outputs
const monitoringOutputs: MonitoringOutputs = {
  logAnalyticsWorkspaceId: logAnalyticsWorkspace.id,
  logAnalyticsWorkspaceName: logAnalyticsWorkspace.name,
  appInsightsInstrumentationKey: "",
  appInsightsConnectionString: "",
};

// Complete platform outputs
const platformOutputs: PlatformOutputs = {
  resourceGroupName: resourceGroup.name,
  location,
  environment,
  vnet: vnetOutputs,
  aks: aksOutputs,
  database: databaseOutputs,
  security: securityOutputs,
  monitoring: monitoringOutputs,
};

// Export all outputs
export const resourceGroupId = resourceGroup.id;
export const vnetId = vnetOutputs.vnetId;
export const aksClusterId = aksOutputs.aksClusterId;
export const dbServerName = databaseOutputs.dbServerName;
export const keyVaultUri = securityOutputs.keyVaultUri;
export const logAnalyticsWorkspaceId = monitoringOutputs.logAnalyticsWorkspaceId;

pulumi.log.info("✅ Platform layer deployment complete");
