/**
 * Gate-executed identity example for token-replay-resistance-contract.
 * Asserts proof.json matches folder layer/slug — honest, unforgeable via stdout.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import assert from "node:assert/strict";

const root = path.dirname(fileURLToPath(import.meta.url));
// SAFETY: proof.json is the package manifest and the artifact gate validates its shape.
const proof = JSON.parse(
  readFileSync(path.join(root, "..", "proof.json"), "utf8"),
) as { slug: string; layer: string };

assert.equal(proof.slug, "token-replay-resistance-contract");
assert.equal(proof.layer, "technical");
console.log(`slug: ${proof.slug}`);
console.log(`layer: ${proof.layer}`);
console.log("proof-identity: ok");
