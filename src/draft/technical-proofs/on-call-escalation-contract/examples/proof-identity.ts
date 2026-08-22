/**
 * Gate-executed identity example for on-call-escalation-contract.
 * Asserts proof.json matches folder layer/slug — honest, unforgeable via stdout.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import assert from "node:assert/strict";

const root = path.dirname(fileURLToPath(import.meta.url));
// SAFETY: proof.json is the gate-validated manifest for this folder; the assertion narrows its parsed manifest shape.
const proof = JSON.parse(
  readFileSync(path.join(root, "..", "proof.json"), "utf8"),
) as { slug: string; layer: string };

assert.equal(proof.slug, "on-call-escalation-contract");
assert.equal(proof.layer, "technical");
console.log(`slug: ${proof.slug}`);
console.log(`layer: ${proof.layer}`);
console.log("proof-identity: ok");
