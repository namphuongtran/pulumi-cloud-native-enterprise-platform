import * as pulumi from "@pulumi/pulumi";
import { loadLandingZoneConfig, LandingZoneConfig } from "@enterprise/core";
import { PolicyAssignments, PolicyInitiativeAssignment } from "./policy-assignments";
import { BUILTIN_INITIATIVES } from "./policy-definitions";

/**
 * Bootstrap Stack: Policy Assignments
 *
 * Assigns Azure policies to the management group hierarchy
 * following Azure Landing Zone best practices.
 *
 * Prerequisites:
 * - Management groups stack deployed (stacks/00-bootstrap/management-groups)
 * - Azure CLI authenticated with Policy Contributor permissions
 * - config/landing-zone.yaml configured
 */

// Load configuration
let config: LandingZoneConfig;
try {
  config = loadLandingZoneConfig();
} catch (error) {
  throw new Error(
    `Failed to load landing zone configuration: ${error instanceof Error ? error.message : error}\n` +
      `Ensure config/landing-zone.yaml exists and is valid.`
  );
}

const pulumiConfig = new pulumi.Config();

// Get management group IDs from stack reference
const mgStackRef = new pulumi.StackReference(
  pulumiConfig.get("managementGroupsStack") || "bootstrap-management-groups/bootstrap"
);

// Build management group IDs from outputs
const { organization, managementGroups, region } = config.platform;
const prefix = managementGroups?.root || organization.name;

// Get management group IDs (either from stack reference or construct from config)
const managementGroupIds = {
  root: mgStackRef.getOutput("rootManagementGroupId").apply(id =>
    id || `/providers/Microsoft.Management/managementGroups/${prefix}`
  ),
  platform: mgStackRef.getOutput("platformManagementGroupId").apply(id =>
    id || `/providers/Microsoft.Management/managementGroups/${prefix}-platform`
  ),
  management: mgStackRef.getOutput("managementManagementGroupId").apply(id =>
    id || `/providers/Microsoft.Management/managementGroups/${prefix}-management`
  ),
  connectivity: mgStackRef.getOutput("connectivityManagementGroupId").apply(id =>
    id || `/providers/Microsoft.Management/managementGroups/${prefix}-connectivity`
  ),
  identity: managementGroups?.includeIdentity !== false
    ? mgStackRef.getOutput("identityManagementGroupId").apply(id =>
        id || `/providers/Microsoft.Management/managementGroups/${prefix}-identity`
      )
    : undefined,
  landingZones: mgStackRef.getOutput("landingZonesManagementGroupId").apply(id =>
    id || `/providers/Microsoft.Management/managementGroups/${prefix}-landingzones`
  ),
  corp: mgStackRef.getOutput("corpManagementGroupId").apply(id =>
    id || `/providers/Microsoft.Management/managementGroups/${prefix}-corp`
  ),
  online: mgStackRef.getOutput("onlineManagementGroupId").apply(id =>
    id || `/providers/Microsoft.Management/managementGroups/${prefix}-online`
  ),
  sandbox: managementGroups?.includeSandbox !== false
    ? mgStackRef.getOutput("sandboxManagementGroupId").apply(id =>
        id || `/providers/Microsoft.Management/managementGroups/${prefix}-sandbox`
      )
    : undefined,
  decommissioned: managementGroups?.includeDecommissioned !== false
    ? mgStackRef.getOutput("decommissionedManagementGroupId").apply(id =>
        id || `/providers/Microsoft.Management/managementGroups/${prefix}-decommissioned`
      )
    : undefined,
};

// Determine allowed locations
const allowedLocations = region.mode === "multi" && region.secondary
  ? [region.primary, region.secondary]
  : [region.primary];

// Optional: Get Log Analytics Workspace ID from platform stack (if deployed)
const platformStackRef = pulumiConfig.get("platformStack")
  ? new pulumi.StackReference(pulumiConfig.require("platformStack"))
  : undefined;

const logAnalyticsWorkspaceId = platformStackRef
  ? platformStackRef.getOutput("logAnalyticsWorkspaceId")
  : undefined;

// Get enforcement mode from config
const enforceMode = pulumiConfig.getBoolean("enforceMode") ?? true;

// Create policy assignments
const policyAssignments = new PolicyAssignments("alz-policies", {
  managementGroupIds,
  allowedLocations,
  logAnalyticsWorkspaceId,
  enforceMode,
  skipSandbox: managementGroups?.includeSandbox === false,
});

// Optional: Assign Azure Security Benchmark initiative to root
const enableSecurityBenchmark = pulumiConfig.getBoolean("enableSecurityBenchmark") ?? false;
let securityBenchmarkAssignment: PolicyInitiativeAssignment | undefined;

if (enableSecurityBenchmark) {
  securityBenchmarkAssignment = new PolicyInitiativeAssignment(
    "azure-security-benchmark",
    {
      managementGroupId: managementGroupIds.root,
      policySetDefinitionId: BUILTIN_INITIATIVES.AZURE_SECURITY_BENCHMARK,
      displayName: "Azure Security Benchmark",
      description: "Microsoft Cloud Security Benchmark policies for Azure",
      enforcementMode: enforceMode ? "Default" : "DoNotEnforce",
    }
  );
}

// Export outputs
export const totalPolicyAssignments = policyAssignments.assignments.length;
export const rootPolicyAssignments = policyAssignments.rootAssignments.map(a => a.name);
export const platformPolicyAssignments = policyAssignments.platformAssignments.map(a => a.name);
export const landingZonePolicyAssignments = policyAssignments.landingZoneAssignments.map(a => a.name);
export const corpPolicyAssignments = policyAssignments.corpAssignments.map(a => a.name);
export const onlinePolicyAssignments = policyAssignments.onlineAssignments.map(a => a.name);
export const sandboxPolicyAssignments = policyAssignments.sandboxAssignments.map(a => a.name);

export const securityBenchmarkEnabled = enableSecurityBenchmark;
export const securityBenchmarkAssignmentId = securityBenchmarkAssignment?.id;

export const enforcementMode = enforceMode ? "Enforced" : "Audit Only";
export const allowedLocationsConfig = allowedLocations;

// Summary output
export const policySummary = pulumi.all([
  policyAssignments.rootAssignments.length,
  policyAssignments.platformAssignments.length,
  policyAssignments.landingZoneAssignments.length,
  policyAssignments.corpAssignments.length,
  policyAssignments.onlineAssignments.length,
  policyAssignments.sandboxAssignments.length,
]).apply(([root, platform, lz, corp, online, sandbox]) => ({
  total: root + platform + lz + corp + online + sandbox,
  byScope: {
    root,
    platform,
    landingZones: lz,
    corp,
    online,
    sandbox,
  },
  enforcementMode: enforceMode ? "Enforced" : "Audit Only",
  allowedLocations,
  securityBenchmark: enableSecurityBenchmark,
}));
