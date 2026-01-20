import * as pulumi from "@pulumi/pulumi";
import * as authorization from "@pulumi/azure-native/authorization";
import {
  PolicyAssignmentConfig,
  getRootPolicies,
  getPlatformPolicies,
  getLandingZonePolicies,
  getCorpPolicies,
  getOnlinePolicies,
  getSandboxPolicies,
} from "./policy-definitions";

/**
 * Policy Assignment Component
 *
 * Assigns Azure policies to management groups following
 * Azure Landing Zone architecture patterns.
 */

export interface ManagementGroupIds {
  root: pulumi.Input<string>;
  platform: pulumi.Input<string>;
  management: pulumi.Input<string>;
  connectivity: pulumi.Input<string>;
  identity?: pulumi.Input<string>;
  landingZones: pulumi.Input<string>;
  corp: pulumi.Input<string>;
  online: pulumi.Input<string>;
  sandbox?: pulumi.Input<string>;
  decommissioned?: pulumi.Input<string>;
}

export interface PolicyAssignmentsArgs {
  /**
   * Management group IDs from the management-groups stack
   */
  managementGroupIds: ManagementGroupIds;

  /**
   * Allowed Azure locations for resources
   */
  allowedLocations: string[];

  /**
   * Log Analytics Workspace ID for diagnostic policies
   */
  logAnalyticsWorkspaceId?: pulumi.Input<string>;

  /**
   * Enable enforcement (true) or audit-only mode (false)
   */
  enforceMode?: boolean;

  /**
   * Skip sandbox policies
   */
  skipSandbox?: boolean;
}

export interface PolicyAssignmentResult {
  name: string;
  id: pulumi.Output<string>;
  scope: string;
}

export class PolicyAssignments extends pulumi.ComponentResource {
  /**
   * All policy assignments created
   */
  public readonly assignments: PolicyAssignmentResult[];

  /**
   * Root-level policy assignments
   */
  public readonly rootAssignments: PolicyAssignmentResult[];

  /**
   * Platform policy assignments
   */
  public readonly platformAssignments: PolicyAssignmentResult[];

  /**
   * Landing zone policy assignments
   */
  public readonly landingZoneAssignments: PolicyAssignmentResult[];

  /**
   * Corp-specific policy assignments
   */
  public readonly corpAssignments: PolicyAssignmentResult[];

  /**
   * Online-specific policy assignments
   */
  public readonly onlineAssignments: PolicyAssignmentResult[];

  /**
   * Sandbox policy assignments
   */
  public readonly sandboxAssignments: PolicyAssignmentResult[];

  constructor(
    name: string,
    args: PolicyAssignmentsArgs,
    opts?: pulumi.ComponentResourceOptions
  ) {
    super("enterprise:bootstrap:PolicyAssignments", name, {}, opts);

    const {
      managementGroupIds,
      allowedLocations,
      logAnalyticsWorkspaceId,
      enforceMode = true,
      skipSandbox = false,
    } = args;

    this.assignments = [];
    this.rootAssignments = [];
    this.platformAssignments = [];
    this.landingZoneAssignments = [];
    this.corpAssignments = [];
    this.onlineAssignments = [];
    this.sandboxAssignments = [];

    // Helper to create policy assignment
    const createAssignment = (
      assignmentName: string,
      scope: pulumi.Input<string>,
      scopeName: string,
      config: PolicyAssignmentConfig
    ): PolicyAssignmentResult => {
      // Determine enforcement mode
      let enforcementMode = config.enforcementMode || "Default";
      if (!enforceMode && enforcementMode === "Default") {
        enforcementMode = "DoNotEnforce";
      }

      const assignment = new authorization.PolicyAssignment(
        assignmentName,
        {
          policyAssignmentName: assignmentName,
          scope: scope,
          policyDefinitionId: config.policyDefinitionId,
          displayName: config.displayName,
          description: config.description,
          enforcementMode: enforcementMode,
          parameters: config.parameters,
          nonComplianceMessages: config.nonComplianceMessages?.map((msg) => ({
            message: msg.message,
            policyDefinitionReferenceId: msg.policyDefinitionReferenceId,
          })),
        },
        { parent: this }
      );

      return {
        name: assignmentName,
        id: assignment.id,
        scope: scopeName,
      };
    };

    // Helper to assign policies to a scope
    const assignPolicies = (
      scope: pulumi.Input<string>,
      scopeName: string,
      policies: Record<string, PolicyAssignmentConfig>,
      prefix: string
    ): PolicyAssignmentResult[] => {
      const results: PolicyAssignmentResult[] = [];
      for (const [key, config] of Object.entries(policies)) {
        const assignmentName = `${prefix}-${key}`;
        const result = createAssignment(assignmentName, scope, scopeName, config);
        results.push(result);
        this.assignments.push(result);
      }
      return results;
    };

    // 1. Root-level policies (apply to all subscriptions)
    const rootPolicies = getRootPolicies(allowedLocations);
    this.rootAssignments = assignPolicies(
      managementGroupIds.root,
      "root",
      rootPolicies,
      "root"
    );

    // 2. Platform policies
    const platformPolicies = getPlatformPolicies();
    this.platformAssignments = assignPolicies(
      managementGroupIds.platform,
      "platform",
      platformPolicies,
      "platform"
    );

    // 3. Landing Zone policies (apply to all landing zones)
    // Note: logAnalyticsWorkspaceId is available for diagnostic policies but not used currently
    const landingZonePolicies = getLandingZonePolicies();
    this.landingZoneAssignments = assignPolicies(
      managementGroupIds.landingZones,
      "landingZones",
      landingZonePolicies,
      "lz"
    );

    // 4. Corp-specific policies (stricter)
    const corpPolicies = getCorpPolicies();
    this.corpAssignments = assignPolicies(
      managementGroupIds.corp,
      "corp",
      corpPolicies,
      "corp"
    );

    // 5. Online-specific policies (more permissive)
    const onlinePolicies = getOnlinePolicies();
    this.onlineAssignments = assignPolicies(
      managementGroupIds.online,
      "online",
      onlinePolicies,
      "online"
    );

    // 6. Sandbox policies (if sandbox exists and not skipped)
    if (managementGroupIds.sandbox && !skipSandbox) {
      const sandboxPolicies = getSandboxPolicies();
      this.sandboxAssignments = assignPolicies(
        managementGroupIds.sandbox,
        "sandbox",
        sandboxPolicies,
        "sandbox"
      );
    }

    // Register outputs
    this.registerOutputs({
      totalAssignments: this.assignments.length,
      rootAssignmentCount: this.rootAssignments.length,
      platformAssignmentCount: this.platformAssignments.length,
      landingZoneAssignmentCount: this.landingZoneAssignments.length,
      corpAssignmentCount: this.corpAssignments.length,
      onlineAssignmentCount: this.onlineAssignments.length,
      sandboxAssignmentCount: this.sandboxAssignments.length,
    });
  }
}

/**
 * Policy Initiative (Policy Set) Assignment Component
 *
 * Assigns built-in policy initiatives (like Azure Security Benchmark)
 * to management groups.
 */

export interface PolicyInitiativeAssignmentArgs {
  /**
   * Management group ID to assign the initiative to
   */
  managementGroupId: pulumi.Input<string>;

  /**
   * Policy set definition ID
   */
  policySetDefinitionId: string;

  /**
   * Display name for the assignment
   */
  displayName: string;

  /**
   * Description
   */
  description?: string;

  /**
   * Parameters for the policy set
   */
  parameters?: Record<string, { value: unknown }>;

  /**
   * Enforcement mode
   */
  enforcementMode?: "Default" | "DoNotEnforce";
}

export class PolicyInitiativeAssignment extends pulumi.ComponentResource {
  public readonly assignment: authorization.PolicyAssignment;
  public readonly id: pulumi.Output<string>;

  constructor(
    name: string,
    args: PolicyInitiativeAssignmentArgs,
    opts?: pulumi.ComponentResourceOptions
  ) {
    super("enterprise:bootstrap:PolicyInitiativeAssignment", name, {}, opts);

    this.assignment = new authorization.PolicyAssignment(
      name,
      {
        policyAssignmentName: name,
        scope: args.managementGroupId,
        policyDefinitionId: args.policySetDefinitionId,
        displayName: args.displayName,
        description: args.description,
        enforcementMode: args.enforcementMode || "Default",
        parameters: args.parameters,
      },
      { parent: this }
    );

    this.id = this.assignment.id;

    this.registerOutputs({
      assignmentId: this.id,
    });
  }
}
