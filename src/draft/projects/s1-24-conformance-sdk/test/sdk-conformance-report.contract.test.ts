import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  parseLoweringCorpus,
  parseSemanticsAnnexVectors,
  runSdkIdiomConformance,
  serializeReportForPact,
} from "../src/sdk/index.js";
import pact from "../contracts/pacts/sdk_conformance_report.pact.json";
import { createDriftAdapter, createReferenceAdapter } from "./fixtures/drift-adapters.js";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const corpus = parseLoweringCorpus(
  JSON.parse(readFileSync(join(rootDir, "src/sdk/corpus/lowering-corpus.json"), "utf8")),
);
const annexVectors = parseSemanticsAnnexVectors(
  JSON.parse(readFileSync(join(rootDir, "src/sdk/vectors/semantics-annex.vectors.json"), "utf8")),
);

describe("sdk conformance report pact", () => {
  it("provider emits passing report matching pact envelope", async () => {
    const report = await runSdkIdiomConformance({
      corpus,
      annexVectors,
      adapter: createReferenceAdapter(),
    });
    const body = serializeReportForPact(report);
    const interaction = pact.interactions[0];

    expect(body.suite).toBe(interaction.response.body.suite);
    expect(body.contract).toBe(interaction.response.body.contract);
    expect(body.status).toBe(interaction.response.body.status);
    expect(body.lanes.some((lane) => lane.lane === "golden-ir-lowering-equivalence")).toBe(true);
    expect(body.lanes.some((lane) => lane.lane === "semantics-annex")).toBe(true);
  });

  it("provider emits failing semantics report with vector diff", async () => {
    const report = await runSdkIdiomConformance({
      corpus: [corpus[0]!],
      annexVectors,
      adapter: createDriftAdapter({ hideCancellationAsRetry: true }),
    });
    const semantics = report.lanes.find((lane) => lane.lane === "semantics-annex");
    const cancellation = semantics?.cases.find((entry) => entry.name === "caller-cancellation");

    expect(report.status).toBe("failed");
    expect(cancellation?.diffPaths?.length).toBeGreaterThan(0);
  });

  it("consumer expects TypeError envelope for empty corpus", async () => {
    const interaction = pact.interactions[2];
    await expect(
      runSdkIdiomConformance({
        corpus: [],
        annexVectors,
        adapter: createReferenceAdapter(),
      }),
    ).rejects.toMatchObject({
      name: "TypeError",
      message: interaction.response.body.message,
    });
  });
});
