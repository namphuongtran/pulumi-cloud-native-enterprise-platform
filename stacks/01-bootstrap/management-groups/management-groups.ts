import * as pulumi from "@pulumi/pulumi";
import * as management from "@pulumi/azure-native/management";
import * as types from "@pulumi/azure-native/types";
import { ManagementGroupsConfig, OrganizationConfig } from "@enterprise/core";

/**
 * Management Group hierarchy following Azure Landing Zone architecture.
 *
 * Structure:
 *   Tenant Root Group
 *   └── {prefix} (Landing Zone Root)
 *       ├── {prefix}-platform
 *       │   ├── {prefix}-management
 *       │   ├── {prefix}-connectivity
 *       │   └── {prefix}-identity (optional)
 *       ├── {prefix}-landingzones
 *       │   ├── {prefix}-corp
 *       │   └── {prefix}-online
 *       ├── {prefix}-sandbox (optional)
 *       └── {prefix}-decommissioned (optional)
 */

export interface ManagementGroupHierarchyArgs {
  /**
   * Organization configuration for naming
   */
  organization: OrganizationConfig;

  /**
   * Management groups configuration
   */
  managementGroups: ManagementGroupsConfig;

  /**
   * Tenant ID (optional, uses current tenant if not specified)
   */
  tenantId?: pulumi.Input<string>;
}

export interface ManagementGroupInfo {
  resource: management.ManagementGroup;
  name: string;
  displayName: string;
}

export class ManagementGroupHierarchy extends pulumi.ComponentResource {
  /**
   * Root management group (Landing Zone Root)
   */
  public readonly root: ManagementGroupInfo;

  /**
   * Platform management group
   */
  public readonly platform: ManagementGroupInfo;

  /**
   * Management subscription management group
   */
  public readonly management: ManagementGroupInfo;

  /**
   * Connectivity subscription management group
   */
  public readonly connectivity: ManagementGroupInfo;

  /**
   * Identity subscription management group (optional)
   */
  public readonly identity?: ManagementGroupInfo;

  /**
   * Landing Zones parent management group
   */
  public readonly landingZones: ManagementGroupInfo;

  /**
   * Corp landing zone management group
   */
  public readonly corp: ManagementGroupInfo;

  /**
   * Online landing zone management group
   */
  public readonly online: ManagementGroupInfo;

  /**
   * Sandbox management group (optional)
   */
  public readonly sandbox?: ManagementGroupInfo;

  /**
   * Decommissioned management group (optional)
   */
  public readonly decommissioned?: ManagementGroupInfo;

  /**
   * All management groups as a flat map
   */
  public readonly allGroups: Map<string, ManagementGroupInfo>;

  constructor(
    name: string,
    args: ManagementGroupHierarchyArgs,
    opts?: pulumi.ComponentResourceOptions
  ) {
    super("enterprise:bootstrap:ManagementGroupHierarchy", name, {}, opts);

    const { organization, managementGroups } = args;
    const prefix = managementGroups.root || organization.name;

    this.allGroups = new Map();

    // Helper to create management group
    const createMg = (
      mgName: string,
      displayName: string,
      parentId?: pulumi.Input<string>
    ): ManagementGroupInfo => {
      const details: types.input.management.CreateManagementGroupDetailsArgs = {};

      if (parentId) {
        details.parent = { id: parentId };
      }

      const mg = new management.ManagementGroup(
        mgName,
        {
          groupId: mgName,
          displayName,
          details,
        },
        { parent: this }
      );

      const info: ManagementGroupInfo = {
        resource: mg,
        name: mgName,
        displayName,
      };

      this.allGroups.set(mgName, info);
      return info;
    };

    // Level 1: Root (Landing Zone Root)
    this.root = createMg(
      prefix,
      organization.displayName || `${organization.name} Landing Zone`
    );

    // Level 2: Platform
    this.platform = createMg(
      `${prefix}-platform`,
      "Platform",
      this.root.resource.id
    );

    // Level 2: Landing Zones
    this.landingZones = createMg(
      `${prefix}-landingzones`,
      "Landing Zones",
      this.root.resource.id
    );

    // Level 2: Sandbox (optional)
    if (managementGroups.includeSandbox !== false) {
      this.sandbox = createMg(
        `${prefix}-sandbox`,
        "Sandbox",
        this.root.resource.id
      );
    }

    // Level 2: Decommissioned (optional)
    if (managementGroups.includeDecommissioned !== false) {
      this.decommissioned = createMg(
        `${prefix}-decommissioned`,
        "Decommissioned",
        this.root.resource.id
      );
    }

    // Level 3: Platform children
    this.management = createMg(
      `${prefix}-management`,
      "Management",
      this.platform.resource.id
    );

    this.connectivity = createMg(
      `${prefix}-connectivity`,
      "Connectivity",
      this.platform.resource.id
    );

    // Level 3: Identity (optional)
    if (managementGroups.includeIdentity !== false) {
      this.identity = createMg(
        `${prefix}-identity`,
        "Identity",
        this.platform.resource.id
      );
    }

    // Level 3: Landing Zone children
    this.corp = createMg(
      `${prefix}-corp`,
      "Corp",
      this.landingZones.resource.id
    );

    this.online = createMg(
      `${prefix}-online`,
      "Online",
      this.landingZones.resource.id
    );

    // Register outputs
    this.registerOutputs({
      rootId: this.root.resource.id,
      platformId: this.platform.resource.id,
      managementId: this.management.resource.id,
      connectivityId: this.connectivity.resource.id,
      identityId: this.identity?.resource.id,
      landingZonesId: this.landingZones.resource.id,
      corpId: this.corp.resource.id,
      onlineId: this.online.resource.id,
      sandboxId: this.sandbox?.resource.id,
      decommissionedId: this.decommissioned?.resource.id,
    });
  }
}
