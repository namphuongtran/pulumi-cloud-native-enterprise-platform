import * as pulumi from "@pulumi/pulumi";

/**
 * Azure Landing Zone Policy Definitions
 *
 * Contains both built-in policy IDs and custom policy definitions
 * following Microsoft's Cloud Adoption Framework.
 */

// ============================================================================
// Built-in Policy Definition IDs
// ============================================================================

/**
 * Governance Policies
 */
export const BUILTIN_POLICIES = {
  // Location restrictions
  ALLOWED_LOCATIONS: "/providers/Microsoft.Authorization/policyDefinitions/e56962a6-4747-49cd-b67b-bf8b01975c4c",
  ALLOWED_LOCATIONS_RG: "/providers/Microsoft.Authorization/policyDefinitions/e765b5de-1225-4ba3-bd56-1ac6695af988",

  // Tag governance
  REQUIRE_TAG_ON_RG: "/providers/Microsoft.Authorization/policyDefinitions/96670d01-0a4d-4649-9c89-2d3abc0a5025",
  INHERIT_TAG_FROM_RG: "/providers/Microsoft.Authorization/policyDefinitions/cd3aa116-8754-49c9-a813-ad46512ece54",

  // Resource governance
  ALLOWED_RESOURCE_TYPES: "/providers/Microsoft.Authorization/policyDefinitions/a08ec900-254a-4555-9bf5-e42af04b5c5c",
  NOT_ALLOWED_RESOURCE_TYPES: "/providers/Microsoft.Authorization/policyDefinitions/6c112d4e-5bc7-47ae-a041-ea2d9dccd749",
  ALLOWED_VM_SKUS: "/providers/Microsoft.Authorization/policyDefinitions/cccc23c7-8427-4f53-ad12-b6a63eb452b3",

  // Security - Defender for Cloud
  ENABLE_DEFENDER_FOR_SERVERS: "/providers/Microsoft.Authorization/policyDefinitions/8e86a5b6-b9bd-49d1-8e21-4bb8a0862222",
  ENABLE_DEFENDER_FOR_STORAGE: "/providers/Microsoft.Authorization/policyDefinitions/cfdc5972-75b3-4418-8ae1-7f5c36839390",
  ENABLE_DEFENDER_FOR_SQL: "/providers/Microsoft.Authorization/policyDefinitions/6134c3db-786f-471e-87bc-8f479dc890f6",
  ENABLE_DEFENDER_FOR_CONTAINERS: "/providers/Microsoft.Authorization/policyDefinitions/c9ddb292-b203-4738-aead-18e2716e858f",
  ENABLE_DEFENDER_FOR_KV: "/providers/Microsoft.Authorization/policyDefinitions/1f725891-01c0-420a-9059-4fa46cb770b7",

  // Security - Encryption
  STORAGE_HTTPS_ONLY: "/providers/Microsoft.Authorization/policyDefinitions/404c3081-a854-4457-ae30-26a93ef643f9",
  STORAGE_SECURE_TRANSFER: "/providers/Microsoft.Authorization/policyDefinitions/404c3081-a854-4457-ae30-26a93ef643f9",
  SQL_TDE_ENABLED: "/providers/Microsoft.Authorization/policyDefinitions/86a912f6-9a06-4e26-b447-11b16ba8659f",
  KEYVAULT_SOFT_DELETE: "/providers/Microsoft.Authorization/policyDefinitions/1e66c121-a66a-4b1f-9b83-0fd99bf0fc2d",
  KEYVAULT_PURGE_PROTECTION: "/providers/Microsoft.Authorization/policyDefinitions/0b60c0b2-2dc2-4e1c-b5c9-abbed971de53",

  // Security - Network
  NO_PUBLIC_IP_ON_NIC: "/providers/Microsoft.Authorization/policyDefinitions/83a86a26-fd1f-447c-b59d-e51f44264114",
  DENY_PUBLIC_IP: "/providers/Microsoft.Authorization/policyDefinitions/6c112d4e-5bc7-47ae-a041-ea2d9dccd749",
  NSG_ON_SUBNET: "/providers/Microsoft.Authorization/policyDefinitions/e71308d3-144b-4262-b144-efdc3cc90517",
  AUDIT_NSG_RULES: "/providers/Microsoft.Authorization/policyDefinitions/2f080164-9f4d-497e-9db6-416dc9f7b48a",

  // Monitoring - Diagnostic Settings
  DEPLOY_DIAG_STORAGE: "/providers/Microsoft.Authorization/policyDefinitions/bef3f64c-5290-43b7-85b0-9b254eef4c47",
  DEPLOY_DIAG_KEYVAULT: "/providers/Microsoft.Authorization/policyDefinitions/bef3f64c-5290-43b7-85b0-9b254eef4c47",
  DEPLOY_DIAG_AKS: "/providers/Microsoft.Authorization/policyDefinitions/6c66c325-74c8-42fd-a286-a74b0e2939d8",

  // Kubernetes
  AKS_AZURE_POLICY_ADDON: "/providers/Microsoft.Authorization/policyDefinitions/a8eff44f-8c92-45c3-a3fb-9880802d67a7",
  AKS_HTTPS_INGRESS: "/providers/Microsoft.Authorization/policyDefinitions/1a5b4dca-0b6f-4cf5-907c-56316bc1bf3d",
  AKS_INTERNAL_LB: "/providers/Microsoft.Authorization/policyDefinitions/3fc4dc25-5baf-40d8-9b05-7fe74c1bc64e",

  // SQL
  SQL_AUDITING: "/providers/Microsoft.Authorization/policyDefinitions/a6fb4358-5bf4-4ad7-ba82-2cd2f41ce5e9",
  SQL_THREAT_DETECTION: "/providers/Microsoft.Authorization/policyDefinitions/36d49e87-48c4-4f2e-beed-ba4ed02b71f5",
} as const;

// ============================================================================
// Policy Initiative (Policy Set) Definitions
// ============================================================================

export const BUILTIN_INITIATIVES = {
  // Azure Security Benchmark
  AZURE_SECURITY_BENCHMARK: "/providers/Microsoft.Authorization/policySetDefinitions/1f3afdf9-d0c9-4c3d-847f-89da613e70a8",

  // CIS Microsoft Azure Foundations Benchmark
  CIS_AZURE_1_3_0: "/providers/Microsoft.Authorization/policySetDefinitions/612b5213-9160-4969-8578-1518bd2a000c",

  // NIST SP 800-53 Rev. 5
  NIST_SP_800_53_R5: "/providers/Microsoft.Authorization/policySetDefinitions/179d1daa-458f-4e47-8086-2a68d0d6c38f",

  // ISO 27001
  ISO_27001_2013: "/providers/Microsoft.Authorization/policySetDefinitions/89c6cddc-1c73-4ac1-b19c-54d1a15a42f2",
} as const;

// ============================================================================
// Policy Assignment Configuration
// ============================================================================

export interface PolicyAssignmentConfig {
  /**
   * Policy definition ID (built-in or custom)
   */
  policyDefinitionId: string;

  /**
   * Display name for the assignment
   */
  displayName: string;

  /**
   * Description of the policy assignment
   */
  description?: string;

  /**
   * Policy parameters
   */
  parameters?: Record<string, { value: unknown }>;

  /**
   * Enforcement mode
   */
  enforcementMode?: "Default" | "DoNotEnforce";

  /**
   * Non-compliance messages
   */
  nonComplianceMessages?: Array<{
    message: string;
    policyDefinitionReferenceId?: string;
  }>;

  /**
   * Resource selectors for scoping
   */
  resourceSelectors?: Array<{
    name: string;
    selectors: Array<{
      kind: "resourceLocation" | "resourceType" | "resourceWithoutLocation";
      in?: string[];
      notIn?: string[];
    }>;
  }>;
}

// ============================================================================
// Landing Zone Policy Sets
// ============================================================================

/**
 * Root-level policies applied to all subscriptions
 */
export function getRootPolicies(
  allowedLocations: string[]
): Record<string, PolicyAssignmentConfig> {
  return {
    "allowed-locations": {
      policyDefinitionId: BUILTIN_POLICIES.ALLOWED_LOCATIONS,
      displayName: "Allowed locations",
      description: "Restricts resources to specified Azure regions",
      parameters: {
        listOfAllowedLocations: { value: allowedLocations },
      },
      enforcementMode: "Default",
      nonComplianceMessages: [
        {
          message: "Resources must be deployed to approved regions only.",
        },
      ],
    },
    "allowed-locations-rg": {
      policyDefinitionId: BUILTIN_POLICIES.ALLOWED_LOCATIONS_RG,
      displayName: "Allowed locations for resource groups",
      description: "Restricts resource groups to specified Azure regions",
      parameters: {
        listOfAllowedLocations: { value: allowedLocations },
      },
    },
  };
}

/**
 * Platform management group policies
 */
export function getPlatformPolicies(): Record<string, PolicyAssignmentConfig> {
  return {
    "require-tag-environment": {
      policyDefinitionId: BUILTIN_POLICIES.REQUIRE_TAG_ON_RG,
      displayName: "Require Environment tag on resource groups",
      description: "Ensures all resource groups have an Environment tag",
      parameters: {
        tagName: { value: "Environment" },
      },
    },
    "require-tag-owner": {
      policyDefinitionId: BUILTIN_POLICIES.REQUIRE_TAG_ON_RG,
      displayName: "Require Owner tag on resource groups",
      description: "Ensures all resource groups have an Owner tag",
      parameters: {
        tagName: { value: "Owner" },
      },
    },
    "inherit-tag-environment": {
      policyDefinitionId: BUILTIN_POLICIES.INHERIT_TAG_FROM_RG,
      displayName: "Inherit Environment tag from resource group",
      description: "Resources inherit the Environment tag from their resource group",
      parameters: {
        tagName: { value: "Environment" },
      },
    },
  };
}

/**
 * Landing Zone policies for production workloads
 */
export function getLandingZonePolicies(
  logAnalyticsWorkspaceId?: string
): Record<string, PolicyAssignmentConfig> {
  const policies: Record<string, PolicyAssignmentConfig> = {
    // Security policies
    "storage-https-only": {
      policyDefinitionId: BUILTIN_POLICIES.STORAGE_HTTPS_ONLY,
      displayName: "Storage accounts should use HTTPS",
      description: "Audit storage accounts that do not use secure transfer",
      enforcementMode: "Default",
    },
    "keyvault-soft-delete": {
      policyDefinitionId: BUILTIN_POLICIES.KEYVAULT_SOFT_DELETE,
      displayName: "Key vaults should have soft delete enabled",
      description: "Ensures key vaults have soft delete enabled for recovery",
    },
    "keyvault-purge-protection": {
      policyDefinitionId: BUILTIN_POLICIES.KEYVAULT_PURGE_PROTECTION,
      displayName: "Key vaults should have purge protection enabled",
      description: "Ensures key vaults have purge protection to prevent permanent deletion",
    },
    "sql-tde": {
      policyDefinitionId: BUILTIN_POLICIES.SQL_TDE_ENABLED,
      displayName: "SQL databases should have TDE enabled",
      description: "Transparent data encryption should be enabled on SQL databases",
    },
    "sql-auditing": {
      policyDefinitionId: BUILTIN_POLICIES.SQL_AUDITING,
      displayName: "SQL servers should have auditing enabled",
      description: "Auditing should be enabled on SQL servers",
    },

    // Kubernetes policies
    "aks-azure-policy": {
      policyDefinitionId: BUILTIN_POLICIES.AKS_AZURE_POLICY_ADDON,
      displayName: "AKS clusters should have Azure Policy add-on",
      description: "Azure Policy add-on should be enabled on AKS clusters",
    },
    "aks-https-ingress": {
      policyDefinitionId: BUILTIN_POLICIES.AKS_HTTPS_INGRESS,
      displayName: "AKS clusters should use HTTPS ingress",
      description: "Kubernetes clusters should only be accessible over HTTPS",
      enforcementMode: "Default",
    },
  };

  return policies;
}

/**
 * Corp landing zone specific policies (stricter)
 */
export function getCorpPolicies(): Record<string, PolicyAssignmentConfig> {
  return {
    "deny-public-ip": {
      policyDefinitionId: BUILTIN_POLICIES.NO_PUBLIC_IP_ON_NIC,
      displayName: "Network interfaces should not have public IPs",
      description: "Denies public IP addresses on network interfaces in corp landing zone",
      enforcementMode: "Default",
      nonComplianceMessages: [
        {
          message:
            "Public IP addresses are not allowed in the Corp landing zone. Use private endpoints or Azure Firewall.",
        },
      ],
    },
    "nsg-on-subnet": {
      policyDefinitionId: BUILTIN_POLICIES.NSG_ON_SUBNET,
      displayName: "Subnets should have a Network Security Group",
      description: "Ensures all subnets have an associated NSG",
    },
    "aks-internal-lb": {
      policyDefinitionId: BUILTIN_POLICIES.AKS_INTERNAL_LB,
      displayName: "AKS clusters should use internal load balancers",
      description: "Internal load balancers should be used in AKS clusters",
      enforcementMode: "Default",
    },
  };
}

/**
 * Online landing zone specific policies (more permissive)
 */
export function getOnlinePolicies(): Record<string, PolicyAssignmentConfig> {
  return {
    // Online workloads may have public endpoints, so we audit instead of deny
    "audit-public-ip": {
      policyDefinitionId: BUILTIN_POLICIES.NO_PUBLIC_IP_ON_NIC,
      displayName: "Audit network interfaces with public IPs",
      description: "Audits public IP addresses on network interfaces",
      enforcementMode: "DoNotEnforce", // Audit only
    },
  };
}

/**
 * Sandbox policies (minimal restrictions)
 */
export function getSandboxPolicies(): Record<string, PolicyAssignmentConfig> {
  return {
    // Only basic security policies, audit mode
    "audit-storage-https": {
      policyDefinitionId: BUILTIN_POLICIES.STORAGE_HTTPS_ONLY,
      displayName: "Audit storage accounts HTTPS",
      description: "Audits storage accounts that do not use secure transfer",
      enforcementMode: "DoNotEnforce",
    },
  };
}
