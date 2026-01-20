/**
 * Tag Governance System
 * Enforces multi-tenant, multi-environment tagging across all Azure resources
 */

export interface TaggingContext {
  tenantId?: string;           // Only in Application layer
  environment: string;          // prod, staging, dev
  location: string;             // eastus, westus
  costCenter?: string;          // Cost tracking
  department?: string;          // Ownership
  owner?: string;               // Email or team name
  criticality?: string;         // mission-critical, medium, low
  dataClassification?: string;  // pii, confidential, internal, public
}

/**
 * Generate standardized tags for resources
 * Enforces governance across all layers
 */
export function getTags(context: TaggingContext): Record<string, string> {
  const tags: Record<string, string> = {
    // REQUIRED: Governance & Multi-tenancy
    "environment": context.environment,
    "location": context.location,
    "tenantId": context.tenantId || "shared",

    // REQUIRED: Cost Management
    "costCenter": context.costCenter || "engineering",
    "department": context.department || (context.tenantId ? "tenant-services" : "infrastructure"),

    // REQUIRED: Operational
    "managedBy": "pulumi",
    "createdDate": new Date().toISOString().split('T')[0],

    // OPTIONAL: Ownership
    ...(context.owner && { "owner": context.owner }),

    // OPTIONAL: Security & Compliance
    ...(context.criticality && { "criticality": context.criticality }),
    ...(context.dataClassification && { "dataClassification": context.dataClassification }),
  };

  return tags;
}

/**
 * PLATFORM LAYER: Shared infrastructure tags
 * Used by: Core networking, security, compute, monitoring
 */
export function getPlatformTags(
  environment: string,
  location: string,
  owner?: string
): Record<string, string> {
  return getTags({
    tenantId: undefined,  // NO TENANT
    environment,
    location,
    department: "infrastructure",
    criticality: "mission-critical",
    dataClassification: "internal",
    owner,
  });
}

/**
 * SERVICES LAYER: Shared Kubernetes add-ons tags
 * Used by: Grafana, Kyverno, OpenSearch, Uptime Kuma
 */
export function getServicesTags(
  environment: string,
  location: string,
  owner?: string
): Record<string, string> {
  return getTags({
    tenantId: undefined,  // NO TENANT
    environment,
    location,
    department: "platform-services",
    criticality: "high",
    dataClassification: "internal",
    owner,
  });
}

/**
 * APPLICATION LAYER: Tenant-specific tags
 * Used by: Databases, KeyVaults, App resources per tenant
 */
export function getApplicationTags(
  tenantId: string,
  environment: string,
  location: string,
  costCenter?: string,
  owner?: string
): Record<string, string> {
  return getTags({
    tenantId,  // HAS TENANT
    environment,
    location,
    costCenter: costCenter || tenantId,
    department: "tenant-services",
    criticality: environment === "prod" ? "mission-critical" : "medium",
    dataClassification: "confidential",
    owner,
  });
}

/**
 * Validate tag names and values
 * Azure tags: keys are case-insensitive, values are case-sensitive
 */
export function validateTags(
  tags: Record<string, string>
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Max 50 tags per resource
  if (Object.keys(tags).length > 50) {
    errors.push("Maximum 50 tags allowed per resource");
  }

  for (const [key, value] of Object.entries(tags)) {
    // Key validation (case-insensitive, 1-512 chars)
    if (key.length === 0 || key.length > 512) {
      errors.push(`Tag key length invalid: "${key}"`);
    }

    // Value validation (1-256 chars)
    if (value.length === 0 || value.length > 256) {
      errors.push(`Tag value length invalid for key "${key}": ${value}`);
    }

    // Avoid reserved prefixes
    if (key.toLowerCase().startsWith("microsoft.")) {
      errors.push(`Tag key cannot start with "microsoft.": ${key}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Merge tags safely (deep merge with validation)
 */
export function mergeTags(
  baseTags: Record<string, string>,
  overrideTags?: Record<string, string>
): Record<string, string> {
  const merged = { ...baseTags, ...overrideTags };

  const validation = validateTags(merged);
  if (!validation.valid) {
    throw new Error(`Invalid merged tags: ${validation.errors.join(", ")}`);
  }

  return merged;
}

/**
 * Apply multi-environment tag enforcement
 * Ensures consistency across environments
 */
export function enforceEnvironmentTags(
  environment: string,
  tags: Record<string, string>
): Record<string, string> {
  const enforced = { ...tags };

  // ENFORCE: environment tag cannot be overridden
  enforced["environment"] = environment;

  // ENFORCE: managedBy must be pulumi for audit trail
  enforced["managedBy"] = "pulumi";

  // ENFORCE: tenantId must be set
  if (!enforced["tenantId"]) {
    enforced["tenantId"] = "shared";
  }

  return enforced;
}

/**
 * Example usage and validation
 */
export function exampleTags() {
  // Platform layer
  const platformTags = getPlatformTags("prod", "eastus", "platform-team@company.com");
  console.log("Platform Tags:", platformTags);

  // Services layer
  const serviceTags = getServicesTags("prod", "eastus", "platform-team@company.com");
  console.log("Services Tags:", serviceTags);

  // Application layer - Tenant ACME
  const acmeTags = getApplicationTags(
    "acme",
    "prod",
    "eastus",
    "cc-12345",
    "acme-team@company.com"
  );
  console.log("ACME Tenant Tags:", acmeTags);

  // Validate
  const validation = validateTags(acmeTags);
  console.log("Validation:", validation);
}
