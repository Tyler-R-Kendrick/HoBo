import { bench, describe } from "vitest";

// Benchmark the proof's hot path. Numbers are advisory (committed to bench/baseline.json for
// trend); the gate only requires that declared benches EXECUTE.
describe("__SLUG__ hot path", () => {
  bench("replace with the real operation", () => {
    JSON.parse(JSON.stringify({ replace: "me" }));
  });
});
