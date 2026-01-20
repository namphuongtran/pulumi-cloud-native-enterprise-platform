import * as pulumi from "@pulumi/pulumi";
import * as azure from "@pulumi/azure-native";
import { platformResourceName, resourceGroupName, getPlatformTags } from "@enterprise/core";

const config = new pulumi.Config();
const azureConfig = new pulumi.Config("azure-native");

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

// Get Azure client config for tenant ID
const clientConfig = azure.authorization.getClientConfigOutput();

// ============================================================
// 1. RESOURCE GROUP
// ============================================================

const rgName = resourceGroupName("platform", undefined, environment, location);
const resourceGroup = new azure.resources.ResourceGroup("rg", {
  resourceGroupName: rgName,
  location,
  tags,
});

// ============================================================
// 2. VIRTUAL NETWORK WITH ZERO-TRUST NETWORKING
// ============================================================

const vnetNameStr = platformResourceName("vnet", environment, location);
const vnet = new azure.network.VirtualNetwork("vnet", {
  resourceGroupName: resourceGroup.name,
  virtualNetworkName: vnetNameStr,
  location,
  addressSpace: {
    addressPrefixes: [vnetCidr],
  },
  tags,
}, { parent: resourceGroup });

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
}

// ============================================================
// 3. NETWORK SECURITY GROUPS (Zero-Trust)
// ============================================================

const appNsg = new azure.network.NetworkSecurityGroup("nsg-app", {
  resourceGroupName: resourceGroup.name,
  networkSecurityGroupName: platformResourceName("nsg", environment, location),
  location,
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

// Update app subnet with NSG association
const appSubnetWithNsg = new azure.network.Subnet("subnet-app-with-nsg", {
  resourceGroupName: resourceGroup.name,
  virtualNetworkName: vnet.name,
  subnetName: "app",
  addressPrefix: subnetConfigs.app,
  networkSecurityGroup: { id: appNsg.id },
  serviceEndpoints: [
    { service: "Microsoft.Sql" },
    { service: "Microsoft.Storage" },
    { service: "Microsoft.KeyVault" },
  ],
}, { parent: vnet, dependsOn: [subnets.app, appNsg] });

// ============================================================
// 4. LOG ANALYTICS WORKSPACE (Monitoring) - Create first for AKS
// ============================================================

const lawName = platformResourceName("log", environment, location);
const logAnalyticsWorkspace = new azure.operationalinsights.Workspace("law", {
  resourceGroupName: resourceGroup.name,
  workspaceName: lawName,
  location,
  sku: { name: "PerGB2018" },
  retentionInDays: environment === "prod" ? 30 : 7,
  tags,
}, { parent: resourceGroup });

// ============================================================
// 5. AKS CLUSTER WITH WORKLOAD IDENTITY
// ============================================================

const aksName = platformResourceName("aks", environment, location);
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

  // Enable workload identity
  securityProfile: {
    workloadIdentity: {
      enabled: true,
    },
  },

  // Network configuration
  networkProfile: {
    networkPlugin: "azure",
    networkPolicy: "azure",
    serviceCidr: "10.1.0.0/16",
    dnsServiceIP: "10.1.0.10",
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

  // API server access
  apiServerAccessProfile: {
    enablePrivateCluster: false,
  },

  // Add-ons
  addonProfiles: enableDiagnostics ? {
    omsagent: {
      enabled: true,
      config: {
        logAnalyticsWorkspaceResourceID: logAnalyticsWorkspace.id,
      },
    },
  } : undefined,

  tags,
}, { parent: resourceGroup });

// Get AKS credentials
const aksCredentials = azure.containerservice.listManagedClusterAdminCredentialsOutput({
  resourceGroupName: resourceGroup.name,
  resourceName: aksCluster.name,
});

// ============================================================
// 6. SQL SERVER WITH GEO-REDUNDANT BACKUP
// ============================================================

const sqlServerName = platformResourceName("sql", environment, location);
const sqlServer = new azure.sql.Server("sql-server", {
  resourceGroupName: resourceGroup.name,
  serverName: sqlServerName,
  location,
  administratorLogin: "sqladmin",
  administratorLoginPassword: config.requireSecret("sql:adminPassword"),
  version: "12.0",
  minimalTlsVersion: "1.2",
  publicNetworkAccess: "Enabled",
  tags,
}, { parent: resourceGroup });

// Shared tenant database
const sharedDatabase = new azure.sql.Database("shared-database", {
  resourceGroupName: resourceGroup.name,
  serverName: sqlServer.name,
  databaseName: "shared-tenant-db",
  location,
  sku: {
    name: sqlSku,
    tier: sqlTier,
  },
  // Geo-redundant backup for DR
  requestedBackupStorageRedundancy: redundancyLevel === "high" ? "Geo" : "Local",
  tags,
}, { parent: sqlServer });

// ============================================================
// 7. KEY VAULT FOR SECRETS
// ============================================================

const kvName = platformResourceName("kv", environment, location);
const keyVault = new azure.keyvault.Vault("keyvault", {
  resourceGroupName: resourceGroup.name,
  vaultName: kvName,
  location,
  properties: {
    tenantId: clientConfig.tenantId,
    sku: { family: "A", name: "standard" },
    enableRbacAuthorization: true,
    enableSoftDelete: true,
    softDeleteRetentionInDays: 90,
    enablePurgeProtection: environment === "prod",
  },
  tags,
}, { parent: resourceGroup });

// ============================================================
// OUTPUTS
// ============================================================

// Resource Group
export const resourceGroupId = resourceGroup.id;
export const resourceGroupNameOutput = resourceGroup.name;

// Virtual Network
export const vnetId = vnet.id;
export const vnetName = vnet.name;
export const vnetAddressSpace = vnetCidr;
export const subnetIds = pulumi.all(
  Object.entries(subnets).map(([name, subnet]) =>
    subnet.id.apply(id => ({ name, id }))
  )
).apply(entries =>
  Object.fromEntries(entries.map(e => [e.name, e.id]))
);

// AKS Cluster
export const aksClusterId = aksCluster.id;
export const aksClusterName = aksCluster.name;
export const aksResourceGroupName = resourceGroup.name;
export const oidcIssuerUrl = aksCluster.oidcIssuerProfile.apply(profile =>
  profile?.issuerURL || ""
);
export const kubeconfig = aksCredentials.kubeconfigs.apply(configs =>
  configs && configs.length > 0
    ? Buffer.from(configs[0].value, "base64").toString("utf-8")
    : ""
);
export const nodeResourceGroup = aksCluster.nodeResourceGroup;
export const aksFqdn = aksCluster.fqdn;

// SQL Server
export const sqlServerId = sqlServer.id;
export const sqlServerName_output = sqlServer.name;
export const sqlServerFqdn = sqlServer.fullyQualifiedDomainName;
export const sqlAdminUsername = sqlServer.administratorLogin;

// Key Vault
export const keyVaultId = keyVault.id;
export const keyVaultName = keyVault.name;
export const keyVaultUri = keyVault.properties.apply(props => props.vaultUri || "");

// Monitoring
export const logAnalyticsWorkspaceId = logAnalyticsWorkspace.id;
export const logAnalyticsWorkspaceName_output = logAnalyticsWorkspace.name;

// Security
export const nsgId = appNsg.id;
export const tenantId = clientConfig.tenantId;

// Environment info
export const environmentOutput = environment;
export const locationOutput = location;
