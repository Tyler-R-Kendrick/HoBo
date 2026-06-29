import type { DeploymentPlan } from "../../../deployment-plan-ir-contract/src/deployment-plan-ir.d.js";
import type { PlannerInput, PlannerResult } from "../../src/planner.d.mts";
import { createFixtureManifestIr, plan } from "../../src/planner.js";

const input: PlannerInput = {
  manifest: createFixtureManifestIr(),
  config: {
    deploymentId: "deploy-gallery-preview",
    context: {
      envType: "ephemeral",
      app: "gallery",
      env: "preview",
      tenant: "tenant-acme"
    }
  }
};

const result: PlannerResult = plan(input.manifest, input.config);
const deploymentPlan: DeploymentPlan = result.deploymentPlan;

deploymentPlan.resources.map((resource) => resource.id);
result.plannedEvent.data.planHash.toString();
