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
// ENVIRONMENT TYPE DEFINITIONS
// ============================================================

/**
 * Base environments - persistent, long-running environments
 */
export type BaseEnvironment = "dev" | "test" | "staging" | "prod";

/**
 * Ephemeral environments - short-lived, created on-demand
 */
export type EphemeralEnvironment = "pr";

/**
 * Combined environment type
 */
export type Environment = BaseEnvironment | EphemeralEnvironment;

/**
 * Blue/Green deployment slot - applicable only for production
 */
export type DeploymentSlot = "blue" | "green";

/**
 * Deployment context passed through pipeline
 */
export interface DeploymentContext {
  org: string;
  project: string;
  environment: Environment;
  location: "eastus" | "westus" | "northeurope" | "westeurope";
  tenantId?: string;
  /** Required for "pr" environment - the PR number or unique identifier */
  ephemeralId?: string;
  /** Optional deployment slot - only valid for "prod" environment */
  deploymentSlot?: DeploymentSlot;
}

/**
 * Platform stack configuration (for existing stacks)
 */
export interface PlatformStackConfig {
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
 * Tenant application stack configuration (for existing stacks)
 */
export interface TenantAppConfig {
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

  // Ephemeral environment validations
  if (context.environment === "pr" && !context.ephemeralId) {
    errors.push("ephemeralId is required for pr environment");
  }
  if (context.environment !== "pr" && context.ephemeralId) {
    errors.push("ephemeralId should only be set for pr environment");
  }

  // Deployment slot validations
  if (context.deploymentSlot && context.environment !== "prod") {
    errors.push("deploymentSlot is only valid for prod environment");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}


/**
 * Check if the environment is production-class (needs extra protection)
 */
export function isProductionClass(env: Environment | string): boolean {
  return env === "prod" || env.startsWith("prod-");
}

/**
 * Check if the environment is ephemeral (short-lived)
 */
export function isEphemeralEnvironment(env: Environment): boolean {
  return env === "pr";
}

/**
 * Compute the effective environment name for resource naming
 * Examples:
 * - ("prod", undefined, "blue") => "prod-blue"
 * - ("pr", "123", undefined) => "pr-123"
 * - ("staging", undefined, undefined) => "staging"
 */
export function getEffectiveEnvironmentName(
  env: Environment,
  ephemeralId?: string,
  slot?: DeploymentSlot
): string {
  let name: string = env;
  if (env === "pr" && ephemeralId) {
    name = `pr-${ephemeralId}`;
  }
  if (slot) {
    name = `${name}-${slot}`;
  }
  return name;
}


/**
 * Cluster tier for shared cluster deployments
 */
export type ClusterTier = "nonprod" | "prod";

/**
 * Determine which shared cluster tier an environment should use
 * - nonprod: dev, test, staging, pr-* (all non-production workloads)
 * - prod: prod, prod-blue, prod-green (production traffic only)
 *
 * Staging is in nonprod for better production isolation - prod cluster
 * should only handle actual production traffic.
 */
export function getClusterTier(env: Environment | string): ClusterTier {
  // Only production workloads go to prod cluster for maximum isolation
  if (env === "prod" || env.startsWith("prod-")) {
    return "prod";
  }
  // Everything else (dev, test, staging, pr-*) goes to nonprod cluster
  return "nonprod";
}

/**
 * Get the Kubernetes namespace name for an environment
 * Used in shared cluster deployments
 */
export function getEnvironmentNamespace(
  env: Environment,
  ephemeralId?: string,
  slot?: DeploymentSlot
): string {
  return getEffectiveEnvironmentName(env, ephemeralId, slot);
}

/**
 * Validate tenant application configuration
 */
export function validateTenantAppConfig(
  config: TenantAppConfig
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
