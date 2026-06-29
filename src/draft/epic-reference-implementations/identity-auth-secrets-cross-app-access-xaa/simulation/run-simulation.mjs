import { runIdentityReferenceSimulation } from "../services/identity-reference-architecture.mjs";

const result = await runIdentityReferenceSimulation();
console.log(JSON.stringify(result, null, 2));
