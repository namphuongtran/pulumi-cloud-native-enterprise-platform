import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";
import { getServicesTags, kubernetesNamespace } from "@enterprise/core";

const config = new pulumi.Config();
const upstreamConfig = new pulumi.Config("upstream");

// Read configuration
const environment = config.require("infrastructure:environment");
const location = config.require("infrastructure:location");
const enableGrafana = config.getBoolean("services:enableGrafana") ?? true;
const enableKyverno = config.getBoolean("services:enableKyverno") ?? true;
const enableOpenSearch = config.getBoolean("services:enableOpenSearch") ?? false;
const enableUptimeKuma = config.getBoolean("services:enableUptimeKuma") ?? false;

// Access Platform layer outputs
const aksClusterId = upstreamConfig.get("aksClusterId");
const resourceGroupName = upstreamConfig.get("resourceGroupName");

// Generate tags
const tags = getServicesTags(environment, location, "platform-services-team");

pulumi.log.info(`Services layer deploying to: ${environment}-${location}`);
pulumi.log.info(`AKS Cluster ID: ${aksClusterId}`);

// ============================================================
// KUBERNETES PROVIDER (Connected to Platform AKS)
// ============================================================

// TODO: Retrieve kubeconfig from Platform layer
// For now, create provider stub
const k8sProvider = new k8s.Provider("k8s", {
  // kubeconfig will be passed from platform layer
  // kubeconfig: platformOutputs.aks.kubeconfig,
}, { dependsOn: [] });

// ============================================================
// CREATE MONITORING NAMESPACE
// ============================================================

const monitoringNamespace = new k8s.core.v1.Namespace(
  "monitoring",
  {
    metadata: { name: "monitoring" },
  },
  { provider: k8sProvider }
);

pulumi.log.info("Created Kubernetes namespace: monitoring");

// ============================================================
// GRAFANA DEPLOYMENT (Chart stub)
// ============================================================

if (enableGrafana) {
  pulumi.log.info("Deploying Grafana...");
  
  // TODO: Deploy Grafana Helm chart
  // const grafana = new k8s.helm.v3.Chart("grafana", {
  //   chart: "grafana",
  //   namespace: "monitoring",
  //   values: {...}
  // });
  
  pulumi.log.warn("Grafana deployment is a stub - implement Helm chart deployment");
}

// ============================================================
// KYVERNO DEPLOYMENT (Chart stub)
// ============================================================

if (enableKyverno) {
  pulumi.log.info("Deploying Kyverno...");
  
  // TODO: Deploy Kyverno Helm chart
  // const kyverno = new k8s.helm.v3.Chart("kyverno", {
  //   chart: "kyverno",
  //   namespace: "kyverno",
  //   values: {...}
  // });
  
  pulumi.log.warn("Kyverno deployment is a stub - implement Helm chart deployment");
}

// ============================================================
// OPENSEARCH DEPLOYMENT (Chart stub)
// ============================================================

if (enableOpenSearch) {
  pulumi.log.info("Deploying OpenSearch...");
  
  // TODO: Deploy OpenSearch Helm chart
  // const opensearch = new k8s.helm.v3.Chart("opensearch", {
  //   chart: "opensearch",
  //   namespace: "opensearch",
  //   values: {...}
  // });
  
  pulumi.log.warn("OpenSearch deployment is a stub - implement Helm chart deployment");
}

// ============================================================
// UPTIME KUMA DEPLOYMENT (Chart stub)
// ============================================================

if (enableUptimeKuma) {
  pulumi.log.info("Deploying Uptime Kuma...");
  
  // TODO: Deploy Uptime Kuma Helm chart
  // const uptimeKuma = new k8s.helm.v3.Chart("uptime-kuma", {
  //   chart: "uptime-kuma",
  //   namespace: "monitoring",
  //   values: {...}
  // });
  
  pulumi.log.warn("Uptime Kuma deployment is a stub - implement Helm chart deployment");
}

// ============================================================
// EXPORTS
// ============================================================

export const monitoringNamespaceName = monitoringNamespace.metadata.name;

pulumi.log.info("✅ Services layer deployment complete");
