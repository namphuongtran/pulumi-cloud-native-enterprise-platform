/**
 * Azure Resource Naming Constraints
 * Reference: https://docs.microsoft.com/en-us/azure/azure-resource-manager/management/resource-name-rules
 */

export interface ResourceLimit {
  minLength: number;
  maxLength: number;
  validPattern: RegExp;
  allowHyphens: boolean;
  allowNumbers: boolean;
  description: string;
}

export const RESOURCE_LIMITS: Record<string, ResourceLimit> = {
  // KeyVault - CRITICAL: 24 chars max
  "kv": {
    minLength: 3,
    maxLength: 24,
    validPattern: /^[a-zA-Z][a-zA-Z0-9-]*[a-zA-Z0-9]$/,
    allowHyphens: true,
    allowNumbers: true,
    description: "Key Vault (3-24 chars, alphanumerics & hyphens, start/end with letter/number)"
  },

  // Storage Account - CRITICAL: 24 chars max, lowercase only, NO hyphens
  "st": {
    minLength: 3,
    maxLength: 24,
    validPattern: /^[a-z0-9]+$/,
    allowHyphens: false,
    allowNumbers: true,
    description: "Storage Account (3-24 chars, lowercase & numbers only, NO hyphens)"
  },

  // Resource Group
  "rg": {
    minLength: 1,
    maxLength: 90,
    validPattern: /^[a-zA-Z0-9._()-]+$/,
    allowHyphens: true,
    allowNumbers: true,
    description: "Resource Group (1-90 chars)"
  },

  // Virtual Network
  "vnet": {
    minLength: 2,
    maxLength: 64,
    validPattern: /^[a-zA-Z0-9_.-]+$/,
    allowHyphens: true,
    allowNumbers: true,
    description: "Virtual Network (2-64 chars)"
  },

  // Subnet
  "snet": {
    minLength: 1,
    maxLength: 80,
    validPattern: /^[a-zA-Z0-9_.-]+$/,
    allowHyphens: true,
    allowNumbers: true,
    description: "Subnet (1-80 chars)"
  },

  // SQL Server - lowercase only
  "sql": {
    minLength: 1,
    maxLength: 63,
    validPattern: /^[a-z0-9-]+$/,
    allowHyphens: true,
    allowNumbers: true,
    description: "SQL Server (1-63 chars, lowercase & hyphens only)"
  },

  // SQL Database
  "db": {
    minLength: 1,
    maxLength: 128,
    validPattern: /^[a-zA-Z0-9_-]+$/,
    allowHyphens: true,
    allowNumbers: true,
    description: "SQL Database (1-128 chars)"
  },

  // AKS Cluster
  "aksc": {
    minLength: 1,
    maxLength: 63,
    validPattern: /^[a-z0-9-]+$/,
    allowHyphens: true,
    allowNumbers: true,
    description: "AKS Cluster (1-63 chars, lowercase & hyphens)"
  },

  // App Service
  "app": {
    minLength: 2,
    maxLength: 60,
    validPattern: /^[a-z0-9-]+$/,
    allowHyphens: true,
    allowNumbers: true,
    description: "App Service (2-60 chars, lowercase & hyphens)"
  },

  // Container Registry
  "acr": {
    minLength: 5,
    maxLength: 50,
    validPattern: /^[a-z0-9]+$/,
    allowHyphens: false,
    allowNumbers: true,
    description: "Container Registry (5-50 chars, lowercase & numbers only, NO hyphens)"
  },

  // Network Security Group
  "nsg": {
    minLength: 1,
    maxLength: 80,
    validPattern: /^[a-zA-Z0-9_.-]+$/,
    allowHyphens: true,
    allowNumbers: true,
    description: "Network Security Group (1-80 chars)"
  },

  // Public IP
  "pip": {
    minLength: 1,
    maxLength: 80,
    validPattern: /^[a-zA-Z0-9_.-]+$/,
    allowHyphens: true,
    allowNumbers: true,
    description: "Public IP (1-80 chars)"
  },

  // Load Balancer
  "lb": {
    minLength: 1,
    maxLength: 80,
    validPattern: /^[a-zA-Z0-9_.-]+$/,
    allowHyphens: true,
    allowNumbers: true,
    description: "Load Balancer (1-80 chars)"
  },

  // Cosmos DB Account
  "cosmos": {
    minLength: 3,
    maxLength: 44,
    validPattern: /^[a-z0-9-]+$/,
    allowHyphens: true,
    allowNumbers: true,
    description: "Cosmos DB (3-44 chars, lowercase & hyphens)"
  }
};

/**
 * Safe truncation with hash collision prevention
 * Removes from middle to preserve prefix and suffix
 */
function truncateSafely(name: string, maxLength: number): string {
  if (name.length <= maxLength) {
    return name;
  }

  const reservedForMarker = 5; // "...XX"
  const safeMax = maxLength - reservedForMarker;

  if (safeMax < 5) {
    // If maxLength is too small, just truncate from end
    return name.slice(0, maxLength);
  }

  const halfKeep = Math.floor(safeMax / 2);
  const prefix = name.slice(0, halfKeep);
  const suffix = name.slice(name.length - halfKeep);

  return `${prefix}...${suffix}`.slice(0, maxLength);
}

/**
 * Validate resource name against Azure constraints
 */
export function validateResourceName(
  name: string,
  resourceType: string
): { valid: boolean; error?: string } {
  const limit = RESOURCE_LIMITS[resourceType];

  if (!limit) {
    return { valid: false, error: `Unknown resource type: ${resourceType}` };
  }

  if (name.length < limit.minLength) {
    return {
      valid: false,
      error: `Name too short (min ${limit.minLength} chars): ${name}`
    };
  }

  if (name.length > limit.maxLength) {
    return {
      valid: false,
      error: `Name too long (max ${limit.maxLength} chars): ${name}`
    };
  }

  if (!limit.validPattern.test(name)) {
    return {
      valid: false,
      error: `Name violates pattern rules: ${name}. ${limit.description}`
    };
  }

  return { valid: true };
}

/**
 * LAYER 1: PLATFORM (NO TENANT)
 * Pattern: {resourceType}-platform-{environment}-{location}
 * Example: kv-platform-prod-eastus, aksc-prod-eastus
 */
export function platformResourceName(
  resourceType: string,
  environment: string,
  location: string
): string {
  const base = `${resourceType}-platform-${environment}-${location}`;
  const limit = RESOURCE_LIMITS[resourceType];

  if (!limit) {
    console.warn(`Unknown resource type: ${resourceType}, using base name`);
    return base;
  }

  let normalized = base.toLowerCase();

  // Handle storage accounts (no hyphens allowed)
  if (resourceType === "st") {
    normalized = normalized.replace(/-/g, "");
  }

  // Ensure it doesn't exceed max length
  if (normalized.length > limit.maxLength) {
    normalized = truncateSafely(normalized, limit.maxLength);
  }

  const validation = validateResourceName(normalized, resourceType);
  if (!validation.valid) {
    throw new Error(
      `Invalid platform resource name: ${normalized}. ${validation.error}`
    );
  }

  return normalized;
}

/**
 * LAYER 2: SERVICES (NO TENANT - SHARED K8S CLUSTER)
 * Pattern: {resourceType}-svc-{environment}-{location}
 * Example: grafana-svc-prod-eastus
 */
export function serviceResourceName(
  resourceType: string,
  environment: string,
  location: string
): string {
  const base = `${resourceType}-svc-${environment}-${location}`;
  const limit = RESOURCE_LIMITS[resourceType];

  if (!limit) {
    console.warn(`Unknown resource type: ${resourceType}, using base name`);
    return base;
  }

  let normalized = base.toLowerCase();

  if (resourceType === "st") {
    normalized = normalized.replace(/-/g, "");
  }

  if (normalized.length > limit.maxLength) {
    normalized = truncateSafely(normalized, limit.maxLength);
  }

  const validation = validateResourceName(normalized, resourceType);
  if (!validation.valid) {
    throw new Error(
      `Invalid service resource name: ${normalized}. ${validation.error}`
    );
  }

  return normalized;
}

/**
 * LAYER 3: APPLICATION (WITH TENANT)
 * Pattern: {resourceType}-{tenantId}-{environment}-{location}
 * Example: kv-acme-prod-eastus (23 chars - fits in 24-char limit!)
 */
export function applicationResourceName(
  resourceType: string,
  tenantId: string,
  environment: string,
  location: string
): string {
  const base = `${resourceType}-${tenantId}-${environment}-${location}`;
  const limit = RESOURCE_LIMITS[resourceType];

  if (!limit) {
    console.warn(`Unknown resource type: ${resourceType}, using base name`);
    return base;
  }

  let normalized = base.toLowerCase();

  if (resourceType === "st") {
    normalized = normalized.replace(/-/g, "");
  }

  if (normalized.length > limit.maxLength) {
    normalized = truncateSafely(normalized, limit.maxLength);
  }

  const validation = validateResourceName(normalized, resourceType);
  if (!validation.valid) {
    throw new Error(
      `Invalid application resource name: ${normalized}. ${validation.error}`
    );
  }

  return normalized;
}

/**
 * Generate Azure Resource Group name
 */
export function resourceGroupName(
  layer: "platform" | "services" | "application",
  tenantId: string | undefined,
  environment: string,
  location: string
): string {
  let base: string;

  if (layer === "platform") {
    base = `rg-platform-${environment}-${location}`;
  } else if (layer === "services") {
    base = `rg-services-${environment}-${location}`;
  } else {
    // application
    if (!tenantId) {
      throw new Error("tenantId required for application layer resource group");
    }
    base = `rg-app-${tenantId}-${environment}-${location}`;
  }

  return base.toLowerCase().slice(0, 90);
}

/**
 * Generate Kubernetes namespace name
 */
export function kubernetesNamespace(
  tenantId?: string
): string {
  if (tenantId) {
    return tenantId.toLowerCase().slice(0, 63);
  }
  return "default";
}
