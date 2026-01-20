import * as pulumi from "@pulumi/pulumi";
import {
  loadLandingZoneConfig,
  LandingZoneConfig,
  getPlatformTags,
} from "@enterprise/core";
import { ManagementGroupHierarchy } from "./management-groups";

/**
 * Bootstrap Stack: Management Groups
 *
 * Creates the Azure Landing Zone management group hierarchy.
 * This is typically the first resource deployed after state backend.
 *
 * Prerequisites:
 * - Azure CLI authenticated with tenant admin permissions
 * - Management Group Contributor role at tenant root
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

const { organization, managementGroups } = config.platform;

// Create management group hierarchy
const hierarchy = new ManagementGroupHierarchy("alz-hierarchy", {
  organization,
  managementGroups: managementGroups || {
    root: organization.name,
    includeIdentity: false,
    includeSandbox: true,
    includeDecommissioned: true,
  },
});

// Export management group IDs for use by other stacks
export const rootManagementGroupId = hierarchy.root.resource.id;
export const rootManagementGroupName = hierarchy.root.name;

export const platformManagementGroupId = hierarchy.platform.resource.id;
export const managementManagementGroupId = hierarchy.management.resource.id;
export const connectivityManagementGroupId = hierarchy.connectivity.resource.id;
export const identityManagementGroupId = hierarchy.identity?.resource.id;

export const landingZonesManagementGroupId = hierarchy.landingZones.resource.id;
export const corpManagementGroupId = hierarchy.corp.resource.id;
export const onlineManagementGroupId = hierarchy.online.resource.id;

export const sandboxManagementGroupId = hierarchy.sandbox?.resource.id;
export const decommissionedManagementGroupId =
  hierarchy.decommissioned?.resource.id;

// Export organization info for reference
export const organizationName = organization.name;
export const organizationDisplayName = organization.displayName;

// Export summary of created management groups
export const managementGroupsSummary = pulumi.all([
  hierarchy.root.resource.id,
  hierarchy.platform.resource.id,
  hierarchy.landingZones.resource.id,
]).apply(([rootId, platformId, lzId]) => ({
  root: rootId,
  platform: platformId,
  landingZones: lzId,
  structure: `
    ${hierarchy.root.name} (${hierarchy.root.displayName})
    ├── ${hierarchy.platform.name} (Platform)
    │   ├── ${hierarchy.management.name} (Management)
    │   ├── ${hierarchy.connectivity.name} (Connectivity)
    │   ${hierarchy.identity ? `└── ${hierarchy.identity.name} (Identity)` : ""}
    ├── ${hierarchy.landingZones.name} (Landing Zones)
    │   ├── ${hierarchy.corp.name} (Corp)
    │   └── ${hierarchy.online.name} (Online)
    ${hierarchy.sandbox ? `├── ${hierarchy.sandbox.name} (Sandbox)` : ""}
    ${hierarchy.decommissioned ? `└── ${hierarchy.decommissioned.name} (Decommissioned)` : ""}
  `.trim(),
}));
