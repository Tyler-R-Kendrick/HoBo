/**
 * Gate-executed identity example for tenant-data-lifecycle-contract.
 * Asserts proof.json matches folder layer/slug — honest, unforgeable via stdout.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import assert from "node:assert/strict";

const root = path.dirname(fileURLToPath(import.meta.url));
// SAFETY: proof.json is the committed manifest for this example's parent package.
const proof = JSON.parse(
  readFileSync(path.join(root, "..", "proof.json"), "utf8"),
) as { slug: string; layer: string };

assert.equal(proof.slug, "tenant-data-lifecycle-contract");
assert.equal(proof.layer, "exp");
console.log(`slug: ${proof.slug}`);
console.log(`layer: ${proof.layer}`);
console.log("proof-identity: ok");
