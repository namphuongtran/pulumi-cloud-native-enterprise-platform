import * as pulumi from "@pulumi/pulumi";
import * as resources from "@pulumi/azure-native/resources";
import * as storage from "@pulumi/azure-native/storage";
import { getPlatformTags, platformResourceName } from "@enterprise/core";

const config = new pulumi.Config();
const environment = pulumi.getStack().split("-")[2] || "dev";
const location = config.require("azure:location");

// Tags for state infrastructure
const tags = getPlatformTags(environment, location, "cloud-ops");

/**
 * Resource Group for state backend
 * Isolates state infrastructure from application resources
 */
const stateRg = new resources.ResourceGroup("stateRg", {
  resourceGroupName: platformResourceName("rg", "state", environment),
  location,
  tags,
});

/**
 * Storage Account for Pulumi state
 * - Geo-Redundant Storage (GRS) for disaster recovery
 * - Versioning enabled for state history
 * - Soft delete enabled for accidental deletion recovery
 * - Encryption enabled by default
 */
const stateStorageAccount = new storage.StorageAccount("stateStorage", {
  resourceGroupName: stateRg.name,
  accountName: platformResourceName("st", "state", environment),
  location,
  kind: storage.Kind.StorageV2,
  sku: {
    name: storage.SkuName.Standard_GRS, // Geo-redundant for DR
  },
  accessTier: storage.AccessTier.Hot,
  minimumTlsVersion: storage.MinimumTlsVersion.TLS1_2,
  publicNetworkAccess: storage.PublicNetworkAccess.Enabled, // Can restrict to VNet later
  encryption: {
    keySource: storage.KeySource.Microsoft_Storage,
    services: {
      blob: {
        enabled: true,
      },
      file: {
        enabled: true,
      },
    },
  },
  tags,
});

/**
 * Blob Services configuration
 * Enables versioning and soft delete for state protection
 */
const blobServices = new storage.BlobServiceProperties("blobServices", {
  resourceGroupName: stateRg.name,
  accountName: stateStorageAccount.name,
  isVersioningEnabled: true, // Keep all state versions
  deleteRetentionPolicy: {
    enabled: true,
    days: 30, // 30-day recovery window
  },
  containerDeleteRetentionPolicy: {
    enabled: true,
    days: 7,
  },
});

/**
 * Blob Container for state files
 * One container per environment's stacks
 */
const stateContainer = new storage.BlobContainer("stateContainer", {
  resourceGroupName: stateRg.name,
  accountName: stateStorageAccount.name,
  containerName: pulumi.interpolate`pulumi-state-${environment}`,
  publicAccess: storage.PublicAccess.None, // Private - no public access
});

/**
 * Storage Account Keys (for programmatic access)
 * Used by Pulumi CLI and CI/CD pipelines
 */
const storageKeys = storage.listStorageAccountKeysOutput({
  resourceGroupName: stateRg.name,
  accountName: stateStorageAccount.name,
});

const primaryKey = storageKeys.keys[0].value;
const connectionString = pulumi.interpolate`DefaultEndpointsProtocol=https;AccountName=${stateStorageAccount.name};AccountKey=${primaryKey};EndpointSuffix=core.windows.net`;

// Export stack outputs for subsequent stack references
export const stateResourceGroupName = stateRg.name;
export const stateStorageAccountName = stateStorageAccount.name;
export const stateStorageAccountId = stateStorageAccount.id;
export const stateContainerName = stateContainer.name;
export const stateBackendUrl = pulumi.interpolate`azurerm://${stateStorageAccount.name}/${stateContainer.name}`;
