/**
 * Shared Interfaces and Data Transfer Objects (DTOs)
 * Used for type-safe inter-stack communication via Pulumi outputs
 */

// ============================================================
// PLATFORM LAYER OUTPUTS
// ============================================================

/**
 * Virtual Network outputs from Platform layer
 * Consumed by: Services layer, Application layer
 */
export interface VNetOutputs {
  vnetId: string;
  vnetName: string;
  vnetAddressSpace: string;
  subnetIds: Record<string, string>;  // { "app": "subnet-123", "data": "subnet-456" }
  subnetAddressPrefixes: Record<string, string>;
}

/**
 * AKS Cluster outputs from Platform layer
 * Consumed by: Services layer (Helm), Application layer (pod deployment)
 */
export interface AKSClusterOutputs {
  aksClusterId: string;
  aksClusterName: string;
  aksResourceGroupName: string;
  oidcIssuerUrl: string;
  kubeconfig: string;  // Base64 encoded
  nodeResourceGroupName: string;
  fqdnName: string;
}

/**
 * Database Server outputs from Platform layer
 * Consumed by: Application layer (tenant databases)
 */
export interface DatabaseServerOutputs {
  dbServerId: string;
  dbServerName: string;
  dbPrimaryEndpoint: string;      // eastus endpoint
  dbSecondaryEndpoint?: string;   // westus endpoint (DR)
  dbAdminUsername: string;
  failoverGroupName?: string;
  failoverGroupReadOnlyEndpoint?: string;
}

/**
 * Network Security outputs from Platform layer
 * Consumed by: Application layer (pod security policies)
 */
export interface SecurityOutputs {
  firewallId: string;
  nsgIds: Record<string, string>;
  workloadIdentityClientId: string;
  workloadIdentityTenantId: string;
  keyVaultUri: string;
  keyVaultId: string;
}

/**
 * Monitoring and Logging outputs from Platform layer
 * Consumed by: Services layer, Application layer
 */
export interface MonitoringOutputs {
  logAnalyticsWorkspaceId: string;
  logAnalyticsWorkspaceName: string;
  appInsightsInstrumentationKey: string;
  appInsightsConnectionString: string;
}

/**
 * Complete Platform layer outputs
 */
export interface PlatformOutputs {
  resourceGroupName: string;
  location: string;
  environment: string;
  vnet: VNetOutputs;
  aks: AKSClusterOutputs;
  database: DatabaseServerOutputs;
  security: SecurityOutputs;
  monitoring: MonitoringOutputs;
}

// ============================================================
// SERVICES LAYER OUTPUTS
// ============================================================

/**
 * Kubernetes add-ons outputs
 * Consumed by: Application layer (pod reference, metrics scraping)
 */
export interface KubernetesAddonsOutputs {
  grafanaUrl: string;
  grafanaAdminPassword: string;
  prometheusSvcUrl: string;
  kyvernoVersion: string;
  openSearchEndpoint: string;
  openSearchUsername: string;
  uptimeKumaUrl: string;
}

/**
 * Complete Services layer outputs
 */
export interface ServicesOutputs {
  addons: KubernetesAddonsOutputs;
  clusterMonitoringUrl: string;
}

// ============================================================
// APPLICATION LAYER OUTPUTS (PER TENANT)
// ============================================================

/**
 * Tenant-specific database outputs
 */
export interface TenantDatabaseOutputs {
  databaseId: string;
  databaseName: string;
  connectionString: string;
  primaryEndpoint: string;
  secondaryEndpoint?: string;     // DR endpoint
  isolationLevel: "shared" | "isolated";
}

/**
 * Tenant-specific KeyVault outputs
 */
export interface TenantKeyVaultOutputs {
  keyVaultId: string;
  keyVaultName: string;
  keyVaultUri: string;
  secretUrl: (secretName: string) => string;
}

/**
 * Tenant-specific managed identity outputs
 */
export interface TenantManagedIdentityOutputs {
  principalId: string;
  clientId: string;
  tenantId: string;
  kubernetesServiceAccountName: string;
}

/**
 * Complete Application layer outputs
 */
export interface ApplicationOutputs {
  tenantId: string;
  environment: string;
  location: string;
  namespace: string;
  database: TenantDatabaseOutputs;
  keyVault: TenantKeyVaultOutputs;
  managedIdentity: TenantManagedIdentityOutputs;
}

// ============================================================
// CONFIGURATION INTERFACES
// ============================================================

/**
 * Deployment context passed through pipeline
 */
export interface DeploymentContext {
  org: string;
  project: string;
  environment: "dev" | "staging" | "prod";
  location: "eastus" | "westus" | "northeurope" | "westeurope";
  tenantId?: string;
}

/**
 * Platform layer configuration
 */
export interface PlatformConfig {
  environment: string;
  location: string;
  clusterType: "aks" | "eks";
  redundancyLevel: "high" | "medium" | "low";
  vnetCidr: string;
  subnets: Record<string, string>;  // { "app": "10.0.1.0/24", "data": "10.0.2.0/24" }
  enableMonitoring: boolean;
  enableDiagnostics: boolean;
}

/**
 * Services layer configuration
 */
export interface ServicesConfig {
  environment: string;
  location: string;
  enableGrafana: boolean;
  enableKyverno: boolean;
  enableOpenSearch: boolean;
  enableUptimeKuma: boolean;
  helmValues?: Record<string, any>;
}

/**
 * Application layer configuration
 */
export interface ApplicationConfig {
  tenantId: string;
  environment: string;
  location: string;
  databaseIsolation: "shared" | "isolated";
  databaseSku: string;
  keyVaultSku: "standard" | "premium";
  enablePrivateEndpoints: boolean;
  enableWorkloadIdentity: boolean;
}

// ============================================================
// ERROR HANDLING
// ============================================================

export class ConfigurationError extends Error {
  constructor(message: string) {
    super(`Configuration Error: ${message}`);
    this.name = "ConfigurationError";
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(`Validation Error: ${message}`);
    this.name = "ValidationError";
  }
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/**
 * Validate deployment context
 */
export function validateDeploymentContext(
  context: DeploymentContext
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!context.org) errors.push("org is required");
  if (!context.project) errors.push("project is required");
  if (!context.environment) errors.push("environment is required");
  if (!context.location) errors.push("location is required");

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate application configuration
 */
export function validateApplicationConfig(
  config: ApplicationConfig
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!config.tenantId) errors.push("tenantId is required");
  if (!config.environment) errors.push("environment is required");
  if (!config.location) errors.push("location is required");
  if (!["shared", "isolated"].includes(config.databaseIsolation)) {
    errors.push("databaseIsolation must be 'shared' or 'isolated'");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
