/**
 * Configuration Schema for Azure Landing Zone
 *
 * All infrastructure behavior is controlled by this configuration.
 * Defaults are applied for KISS - only override what you need.
 */

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
  environment?: string;
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
