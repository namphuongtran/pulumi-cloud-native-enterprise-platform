/**
 * Configuration Schema for Azure Landing Zone
 *
 * All infrastructure behavior is controlled by this configuration.
 * Defaults are applied for KISS - only override what you need.
 */

import {
  Environment,
  BaseEnvironment,
  EphemeralEnvironment,
  DeploymentSlot,
} from "../interfaces";

// ============================================================================
// Billing Configuration
// ============================================================================

export type BillingModel = "PAYG" | "EA" | "MCA";

export interface PaygBillingConfig {
  model: "PAYG";
  subscriptions: {
    management: string;
    connectivity: string;
    identity?: string;
  };
}

export interface EaBillingConfig {
  model: "EA";
  enrollmentAccountId: string;
}

export interface McaBillingConfig {
  model: "MCA";
  billingAccountName: string;
  billingProfileName: string;
  invoiceSectionName: string;
}

export type BillingConfig = PaygBillingConfig | EaBillingConfig | McaBillingConfig;

// ============================================================================
// Region Configuration
// ============================================================================

export type RegionMode = "single" | "multi";

export interface RegionConfig {
  mode: RegionMode;
  primary: string;
  secondary?: string; // Required if mode = "multi"
}

// ============================================================================
// Cluster Isolation Configuration
// ============================================================================

/**
 * Cluster isolation mode for cost vs isolation trade-off
 * - dedicated: Each environment gets its own AKS cluster (max isolation, higher cost)
 * - shared: Multiple environments share AKS clusters via namespaces (cost optimized)
 */
export type ClusterIsolationMode = "dedicated" | "shared";

/**
 * Shared cluster configuration for namespace-based multi-tenancy
 * Follows Azure's recommended "dedicated namespace multitenancy" pattern
 */
export interface SharedClusterConfig {
  /** Use shared clusters for cost optimization */
  enabled: boolean;
  /**
   * Which cluster to deploy to based on environment tier
   * - nonprod: dev, test, staging, pr-* (all non-production workloads)
   * - prod: prod, prod-blue, prod-green (production traffic only)
   */
  clusterTier?: "nonprod" | "prod";
}

// ============================================================================
// Traffic Routing Configuration (Blue/Green)
// ============================================================================

/**
 * Global traffic routing service for blue/green deployments
 * - frontdoor: Azure Front Door (Layer 7, WAF, CDN, faster failover) - RECOMMENDED
 * - trafficmanager: Traffic Manager (DNS-based, simpler, cross-cloud compatible)
 */
export type TrafficRoutingService = "frontdoor" | "trafficmanager";

/**
 * Traffic routing configuration for blue/green deployments
 */
export interface TrafficRoutingConfig {
  /** Enable traffic routing for blue/green deployments */
  enabled: boolean;
  /** Routing service to use (default: frontdoor) */
  service?: TrafficRoutingService;
  /** Front Door specific configuration */
  frontDoor?: {
    sku: "Standard_AzureFrontDoor" | "Premium_AzureFrontDoor";
    /** Enable Web Application Firewall */
    enableWaf?: boolean;
    /** WAF policy mode */
    wafMode?: "Detection" | "Prevention";
  };
  /** Traffic Manager specific configuration */
  trafficManager?: {
    /** Routing method */
    routingMethod: "Priority" | "Weighted" | "Geographic" | "Performance";
    /** Health probe path */
    healthProbePath?: string;
  };
}

// ============================================================================
// Connectivity Configuration
// ============================================================================

export type ConnectivityArchitecture = "vwan" | "hub-spoke";

export interface FirewallConfig {
  enabled: boolean;
  sku: "Standard" | "Premium";
  threatIntelMode?: "Off" | "Alert" | "Deny";
  dnsProxy?: boolean;
}

export interface VpnConfig {
  enabled: boolean;
  sku?: string;
  type?: "RouteBased" | "PolicyBased";
}

export interface ExpressRouteConfig {
  enabled: boolean;
  sku?: string;
  tier?: string;
}

export interface VwanConfig {
  sku: "Basic" | "Standard";
  allowBranchToBranch?: boolean;
  hubAddressPrefix?: string;
}

export interface HubSpokeConfig {
  addressSpace: string;
  subnets: {
    firewall: string;
    gateway: string;
    bastion?: string;
    management?: string;
  };
}

export interface ConnectivityConfig {
  architecture: ConnectivityArchitecture;
  vwan?: VwanConfig;
  hub?: HubSpokeConfig;
  firewall: FirewallConfig;
  vpn?: VpnConfig;
  expressRoute?: ExpressRouteConfig;
  bastion?: {
    enabled: boolean;
    sku?: "Basic" | "Standard";
  };
}

// ============================================================================
// Management Configuration
// ============================================================================

export interface ManagementConfig {
  logRetentionDays: number;
  enableDefender: boolean;
  defenderTier?: "Free" | "Standard";
  actionGroupEmail?: string;
}

// ============================================================================
// Identity Configuration
// ============================================================================

export interface IdentityConfig {
  enabled: boolean;
  domainServices?: {
    enabled: boolean;
    domainName: string;
    sku?: "Standard" | "Enterprise" | "Premium";
  };
}

// ============================================================================
// Platform Configuration
// ============================================================================

export interface OrganizationConfig {
  name: string;
  displayName?: string;
  domain?: string;
}

export interface ManagementGroupsConfig {
  root: string;
  includeIdentity?: boolean;
  includeSandbox?: boolean;
  includeDecommissioned?: boolean;
}

export interface PlatformConfig {
  organization: OrganizationConfig;
  billing: BillingConfig;
  region: RegionConfig;
  managementGroups?: ManagementGroupsConfig;
  connectivity: ConnectivityConfig;
  management: ManagementConfig;
  identity: IdentityConfig;
}

// ============================================================================
// Workload Configuration
// ============================================================================

export type ComputeType = "aks" | "appservice" | "container-apps";
export type WorkloadTier = "corp" | "online" | "sandbox";
export type DatabaseType = "postgresql" | "mysql" | "sqlserver" | "cosmosdb";
export type DatabaseIsolation = "isolated" | "shared";

export interface NetworkConfig {
  addressSpace?: string;
  subnets?: {
    app?: string;
    data?: string;
    privateEndpoints?: string;
  };
  nsgRules?: Array<{
    name: string;
    priority: number;
    direction: "Inbound" | "Outbound";
    access: "Allow" | "Deny";
    protocol: string;
    destinationPortRange: string;
  }>;
}

export interface AksConfig {
  kubernetesVersion?: string;
  systemPoolSize?: number;
  systemPoolVmSize?: string;
  userPools?: Array<{
    name: string;
    size: number;
    vmSize: string;
    mode: "User" | "System";
    nodeLabels?: Record<string, string>;
  }>;
  enableWorkloadIdentity?: boolean;
  enablePrivateCluster?: boolean;
  networkPlugin?: "azure" | "kubenet";
  networkPolicy?: "azure" | "calico" | "none";
  serviceCidr?: string;
  dnsServiceIp?: string;
}

export interface AppServiceConfig {
  sku?: string;
  kind?: "linux" | "windows";
  runtimeStack?: string;
  alwaysOn?: boolean;
  httpsOnly?: boolean;
  minTlsVersion?: string;
  slots?: Array<{ name: string }>;
}

export interface ContainerAppsConfig {
  environmentSku?: "Consumption" | "Workload";
  zoneRedundant?: boolean;
  internalOnly?: boolean;
}

export interface DatabaseConfig {
  enabled: boolean;
  type?: DatabaseType;
  sku?: string;
  storageSizeGb?: number;
  highAvailability?: boolean;
  backupRetentionDays?: number;
  geoRedundantBackup?: boolean;
  isolation?: DatabaseIsolation;
}

export interface KeyVaultConfig {
  enabled: boolean;
  sku?: "standard" | "premium";
  enablePurgeProtection?: boolean;
  softDeleteRetentionDays?: number;
}

export interface ApplicationConfig {
  name: string;
  tier?: WorkloadTier;
  computeType?: ComputeType;
  environment?: Environment;
  /** Required for "pr" environment - the PR number or unique identifier */
  ephemeralId?: string;
  /** Blue/Green deployment slot - only valid for "prod" environment */
  deploymentSlot?: DeploymentSlot;
  /** Cluster isolation mode (default: dedicated) */
  clusterIsolation?: ClusterIsolationMode;
  /** Shared cluster configuration for namespace-based multi-tenancy */
  sharedCluster?: SharedClusterConfig;
  /** Traffic routing for blue/green deployments */
  trafficRouting?: TrafficRoutingConfig;
  network?: NetworkConfig;
  aks?: AksConfig;
  appService?: AppServiceConfig;
  containerApps?: ContainerAppsConfig;
  database?: DatabaseConfig;
  keyVault?: KeyVaultConfig;
  monitoring?: {
    enabled?: boolean;
  };
}

export interface WorkloadDefaults {
  computeType: ComputeType;
  tier?: WorkloadTier;
  networkIsolation?: boolean;
}

export interface WorkloadsConfig {
  defaults: WorkloadDefaults;
  applications: ApplicationConfig[];
}

// ============================================================================
// Root Configuration
// ============================================================================

export interface LandingZoneConfig {
  platform: PlatformConfig;
  workloads: WorkloadsConfig;
}

// ============================================================================
// Defaults
// ============================================================================

export const DEFAULT_BILLING: PaygBillingConfig = {
  model: "PAYG",
  subscriptions: {
    management: "",
    connectivity: "",
  },
};

export const DEFAULT_REGION: RegionConfig = {
  mode: "single",
  primary: "eastus",
};

export const DEFAULT_CONNECTIVITY: ConnectivityConfig = {
  architecture: "vwan",
  vwan: {
    sku: "Standard",
    allowBranchToBranch: true,
  },
  firewall: {
    enabled: true,
    sku: "Standard",
    threatIntelMode: "Alert",
    dnsProxy: true,
  },
};

export const DEFAULT_MANAGEMENT: ManagementConfig = {
  logRetentionDays: 30,
  enableDefender: true,
  defenderTier: "Standard",
};

export const DEFAULT_IDENTITY: IdentityConfig = {
  enabled: false,
};

export const DEFAULT_WORKLOAD_DEFAULTS: WorkloadDefaults = {
  computeType: "aks",
  tier: "corp",
  networkIsolation: true,
};

export const DEFAULT_AKS: AksConfig = {
  kubernetesVersion: "1.28",
  systemPoolSize: 3,
  systemPoolVmSize: "Standard_D4s_v3",
  enableWorkloadIdentity: true,
  enablePrivateCluster: true,
  networkPlugin: "azure",
  networkPolicy: "calico",
};

export const DEFAULT_DATABASE: DatabaseConfig = {
  enabled: true,
  type: "postgresql",
  sku: "GP_Gen5_2",
  storageSizeGb: 128,
  highAvailability: false,
  backupRetentionDays: 7,
  geoRedundantBackup: false,
  isolation: "isolated",
};

export const DEFAULT_KEY_VAULT: KeyVaultConfig = {
  enabled: true,
  sku: "standard",
  enablePurgeProtection: true,
  softDeleteRetentionDays: 90,
};

export const DEFAULT_TRAFFIC_ROUTING: TrafficRoutingConfig = {
  enabled: false,
  service: "frontdoor", // Front Door recommended for Layer 7 + WAF + CDN
  frontDoor: {
    sku: "Standard_AzureFrontDoor",
    enableWaf: true,
    wafMode: "Prevention",
  },
};

export const DEFAULT_SHARED_CLUSTER: SharedClusterConfig = {
  enabled: false, // Dedicated clusters by default for max isolation
};

// ============================================================================
// Environment Cost Profiles
// ============================================================================

/**
 * Cost profile for environment-specific resource sizing
 * Enables cost optimization per environment tier
 */
export interface EnvironmentCostProfile {
  aksNodeCount: number;
  aksVmSize: string;
  sqlSku: string;
  logRetentionDays: number;
  enableGeoRedundancy: boolean;
  enableHighAvailability: boolean;
  keyVaultSku: "standard" | "premium";
}

/**
 * Default cost profiles per environment
 * Override these in your configuration as needed
 */
export const ENVIRONMENT_COST_PROFILES: Record<Environment, EnvironmentCostProfile> = {
  dev: {
    aksNodeCount: 1,
    aksVmSize: "Standard_D2s_v3",
    sqlSku: "Basic",
    logRetentionDays: 7,
    enableGeoRedundancy: false,
    enableHighAvailability: false,
    keyVaultSku: "standard",
  },
  test: {
    aksNodeCount: 2,
    aksVmSize: "Standard_D2s_v3",
    sqlSku: "S1",
    logRetentionDays: 14,
    enableGeoRedundancy: false,
    enableHighAvailability: false,
    keyVaultSku: "standard",
  },
  staging: {
    aksNodeCount: 2,
    aksVmSize: "Standard_D4s_v3",
    sqlSku: "S2",
    logRetentionDays: 30,
    enableGeoRedundancy: false,
    enableHighAvailability: false,
    keyVaultSku: "standard",
  },
  prod: {
    aksNodeCount: 3,
    aksVmSize: "Standard_D4s_v3",
    sqlSku: "S3",
    logRetentionDays: 365,
    enableGeoRedundancy: true,
    enableHighAvailability: true,
    keyVaultSku: "premium",
  },
  pr: {
    aksNodeCount: 1,
    aksVmSize: "Standard_D2s_v3",
    sqlSku: "Basic",
    logRetentionDays: 1,
    enableGeoRedundancy: false,
    enableHighAvailability: false,
    keyVaultSku: "standard",
  },
};

/**
 * Get cost profile for an environment, with fallback to dev for unknown environments
 */
export function getEnvironmentCostProfile(environment: Environment): EnvironmentCostProfile {
  return ENVIRONMENT_COST_PROFILES[environment] ?? ENVIRONMENT_COST_PROFILES.dev;
}
