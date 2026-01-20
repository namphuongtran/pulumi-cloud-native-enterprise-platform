/**
 * Configuration Loader
 *
 * Loads and validates landing zone configuration from YAML files.
 */

import * as fs from "fs";
import * as path from "path";
import * as yaml from "yaml";
import {
  LandingZoneConfig,
  PlatformConfig,
  WorkloadsConfig,
  BillingConfig,
  DEFAULT_BILLING,
  DEFAULT_REGION,
  DEFAULT_CONNECTIVITY,
  DEFAULT_MANAGEMENT,
  DEFAULT_IDENTITY,
  DEFAULT_WORKLOAD_DEFAULTS,
} from "./schema";

// ============================================================================
// Errors
// ============================================================================

export class ConfigurationError extends Error {
  constructor(
    message: string,
    public readonly field?: string,
    public readonly value?: unknown
  ) {
    super(message);
    this.name = "ConfigurationError";
  }
}

export class ValidationError extends Error {
  constructor(
    message: string,
    public readonly errors: string[]
  ) {
    super(message);
    this.name = "ValidationError";
  }
}

// ============================================================================
// Loader Functions
// ============================================================================

/**
 * Find configuration file in standard locations
 */
function findConfigFile(customPath?: string): string {
  if (customPath) {
    if (fs.existsSync(customPath)) {
      return customPath;
    }
    throw new ConfigurationError(`Configuration file not found: ${customPath}`);
  }

  const searchPaths = [
    process.env.LANDING_ZONE_CONFIG,
    path.join(process.cwd(), "config", "landing-zone.yaml"),
    path.join(process.cwd(), "config", "landing-zone.yml"),
    path.join(process.cwd(), "landing-zone.yaml"),
    path.join(process.cwd(), "landing-zone.yml"),
  ].filter(Boolean) as string[];

  for (const searchPath of searchPaths) {
    if (fs.existsSync(searchPath)) {
      return searchPath;
    }
  }

  throw new ConfigurationError(
    "Configuration file not found. Create config/landing-zone.yaml or set LANDING_ZONE_CONFIG environment variable."
  );
}

/**
 * Load raw configuration from YAML file
 */
function loadRawConfig(filePath: string): Record<string, unknown> {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    return yaml.parse(content) || {};
  } catch (error) {
    if (error instanceof Error) {
      throw new ConfigurationError(`Failed to parse configuration: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Deep merge objects, with source taking precedence
 */
function deepMerge<T>(target: T, source: Partial<T>): T {
  if (!target || typeof target !== "object") return target;
  const result = { ...target } as Record<string, unknown>;

  for (const key in source) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      const sourceValue = source[key as keyof typeof source];
      const targetValue = result[key];

      if (
        sourceValue !== undefined &&
        sourceValue !== null &&
        typeof sourceValue === "object" &&
        !Array.isArray(sourceValue) &&
        typeof targetValue === "object" &&
        targetValue !== null &&
        !Array.isArray(targetValue)
      ) {
        result[key] = deepMerge(
          targetValue as Record<string, unknown>,
          sourceValue as Record<string, unknown>
        );
      } else if (sourceValue !== undefined) {
        result[key] = sourceValue;
      }
    }
  }

  return result as T;
}

/**
 * Apply defaults to configuration
 */
function applyDefaults(raw: Record<string, unknown>): LandingZoneConfig {
  const platform = (raw.platform || {}) as Partial<PlatformConfig>;
  const workloads = (raw.workloads || {}) as Partial<WorkloadsConfig>;

  return {
    platform: {
      organization: platform.organization || { name: "org" },
      billing: (platform.billing || DEFAULT_BILLING) as BillingConfig,
      region: deepMerge(DEFAULT_REGION, platform.region || {}),
      managementGroups: platform.managementGroups,
      connectivity: deepMerge(DEFAULT_CONNECTIVITY, platform.connectivity || {}),
      management: deepMerge(DEFAULT_MANAGEMENT, platform.management || {}),
      identity: deepMerge(DEFAULT_IDENTITY, platform.identity || {}),
    },
    workloads: {
      defaults: deepMerge(DEFAULT_WORKLOAD_DEFAULTS, workloads.defaults || {}),
      applications: workloads.applications || [],
    },
  };
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Validate configuration
 */
function validateConfig(config: LandingZoneConfig): string[] {
  const errors: string[] = [];

  // Validate billing
  if (config.platform.billing.model === "PAYG") {
    const billing = config.platform.billing;
    if (!billing.subscriptions?.management) {
      errors.push("PAYG billing requires platform.billing.subscriptions.management");
    }
    if (!billing.subscriptions?.connectivity) {
      errors.push("PAYG billing requires platform.billing.subscriptions.connectivity");
    }
  } else if (config.platform.billing.model === "EA") {
    const billing = config.platform.billing;
    if (!billing.enrollmentAccountId) {
      errors.push("EA billing requires platform.billing.enrollmentAccountId");
    }
  } else if (config.platform.billing.model === "MCA") {
    const billing = config.platform.billing;
    if (!billing.billingAccountName) {
      errors.push("MCA billing requires platform.billing.billingAccountName");
    }
    if (!billing.billingProfileName) {
      errors.push("MCA billing requires platform.billing.billingProfileName");
    }
    if (!billing.invoiceSectionName) {
      errors.push("MCA billing requires platform.billing.invoiceSectionName");
    }
  }

  // Validate region
  if (config.platform.region.mode === "multi" && !config.platform.region.secondary) {
    errors.push("Multi-region mode requires platform.region.secondary");
  }

  // Validate connectivity
  if (config.platform.connectivity.architecture === "hub-spoke") {
    if (!config.platform.connectivity.hub?.addressSpace) {
      errors.push("Hub-spoke architecture requires platform.connectivity.hub.addressSpace");
    }
  }

  // Validate applications
  for (const app of config.workloads.applications) {
    if (!app.name) {
      errors.push("Application requires a name");
    }
    if (app.name && !/^[a-z0-9-]+$/.test(app.name)) {
      errors.push(`Application name '${app.name}' must be lowercase alphanumeric with hyphens`);
    }
  }

  return errors;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Load and validate landing zone configuration
 */
export function loadLandingZoneConfig(configPath?: string): LandingZoneConfig {
  const filePath = findConfigFile(configPath);
  const raw = loadRawConfig(filePath);
  const config = applyDefaults(raw);

  const errors = validateConfig(config);
  if (errors.length > 0) {
    throw new ValidationError("Configuration validation failed", errors);
  }

  return config;
}

/**
 * Load configuration without validation (for testing)
 */
export function loadRawLandingZoneConfig(configPath?: string): LandingZoneConfig {
  const filePath = findConfigFile(configPath);
  const raw = loadRawConfig(filePath);
  return applyDefaults(raw);
}

/**
 * Get configuration for a specific application
 */
export function getApplicationConfig(
  config: LandingZoneConfig,
  appName: string
) {
  const app = config.workloads.applications.find((a) => a.name === appName);
  if (!app) {
    throw new ConfigurationError(`Application not found: ${appName}`);
  }

  // Merge with defaults
  return {
    ...config.workloads.defaults,
    ...app,
    computeType: app.computeType || config.workloads.defaults.computeType,
    tier: app.tier || config.workloads.defaults.tier,
  };
}

/**
 * Check if billing model allows subscription creation
 */
export function canCreateSubscriptions(config: LandingZoneConfig): boolean {
  return config.platform.billing.model !== "PAYG";
}
