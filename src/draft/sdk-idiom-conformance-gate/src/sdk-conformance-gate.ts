import {
  assertThinIdiomLayer,
  lowerCanonicalSdkProgram,
  lowerFluentBindle,
  runLoweringConformance,
} from "../../idiom-layer-lowering-contract/src/lowering-contract.js";
import { runSemanticsAnnex } from "../../idiom-semantics-annex/src/semantics-annex.js";

export const sdkConformanceGateSpec = Object.freeze({
  suite: "@hobo/conformance/sdk",
  contract: "hobo:sdk@0.1.0",
  lanes: [
    "golden-ir-lowering-equivalence",
    "semantics-annex",
    "thin-idiom-layer",
    "authorship-neutral-gate",
  ],
  corpusClaim:
    "Golden-IR equivalence is bounded by the checked corpus; semantics outside that corpus must be covered by annex vectors or called out as unsupported.",
});

export function buildTypescriptSdkLowerers(overrides = {}) {
  return {
    idiom: overrides.idiom ?? ((fixture) => lowerFluentBindle(fixture.fluent)),
    canonical:
      overrides.canonical ??
      ((fixture) => lowerCanonicalSdkProgram(fixture.expectedManifest)),
  };
}

export async function runSdkIdiomConformance({
  layerName = "@hobo/bindles",
  authorship = "hand-authored",
  corpus,
  corpusPath,
  annexVectors,
  annexPath,
  annexAdapter,
  lowerers = buildTypescriptSdkLowerers(),
  sourceFiles = [],
} = {}) {
  if (!Array.isArray(corpus) || corpus.length === 0) {
    throw new TypeError("SDK conformance requires a non-empty golden-IR corpus");
  }
  if (!Array.isArray(annexVectors) || annexVectors.length === 0) {
    throw new TypeError("SDK conformance requires non-empty semantics-annex vectors");
  }
  if (!annexAdapter) {
    throw new TypeError("SDK conformance requires a semantics-annex adapter");
  }

  const lowering = runLoweringConformance(
    corpus,
    {
      typescript: lowerers.idiom,
      canonical: lowerers.canonical,
    },
    { corpusPath },
  );
  const semantics = await runSemanticsAnnex(annexVectors, annexAdapter);
  const thinLayer = runThinLayerLane(sourceFiles);
  const authorshipLane = runAuthorshipLane(authorship);
  const coverage = runCoverageLane({ corpusPath, annexPath });

  const laneList = [lowering, semantics, thinLayer, authorshipLane, coverage];

  return {
    suite: sdkConformanceGateSpec.suite,
    contract: sdkConformanceGateSpec.contract,
    layerName,
    authorship,
    status: laneList.every((lane) => lane.status === "passed") ? "passed" : "failed",
    lanes: {
      lowering: {
        ...lowering,
        lane: "golden-ir-lowering-equivalence",
        boundedByCorpus: true,
      },
      semantics: {
        ...semantics,
        lane: "semantics-annex",
        annexPath,
      },
      thinLayer,
      authorship: authorshipLane,
      coverage,
    },
  };
}

function runThinLayerLane(sourceFiles) {
  const violations = assertThinIdiomLayer(sourceFiles);
  const violationsByPath = new Map();

  for (const violation of violations) {
    const entries = violationsByPath.get(violation.path) ?? [];
    entries.push(violation);
    violationsByPath.set(violation.path, entries);
  }

  return {
    suite: "@hobo/conformance/sdk/thin-idiom-layer",
    lane: "thin-idiom-layer",
    status: violations.length === 0 ? "passed" : "failed",
    cases: sourceFiles.map((file) => {
      const fileViolations = violationsByPath.get(file.path) ?? [];
      return {
        name: file.path,
        status: fileViolations.length === 0 ? "passed" : "failed",
        reason:
          fileViolations.length === 0
            ? undefined
            : fileViolations.map((entry) => `${entry.reason}: ${entry.match}`).join("; "),
      };
    }),
  };
}

function runAuthorshipLane(authorship) {
  const accepted = new Set(["hand-authored", "generated"]);
  const status = accepted.has(authorship) ? "passed" : "failed";

  return {
    suite: "@hobo/conformance/sdk/authorship-neutral-gate",
    lane: "authorship-neutral-gate",
    status,
    trustedByConvention: false,
    sameGateFor: ["hand-authored", "generated"],
    cases: [
      {
        name: `${authorship}-uses-same-gate`,
        status,
        reason: status === "passed" ? undefined : `unknown idiom-layer authorship: ${authorship}`,
      },
    ],
  };
}

function runCoverageLane({ corpusPath, annexPath }) {
  return {
    suite: "@hobo/conformance/sdk/coverage-claim",
    lane: "coverage-claim",
    status: "passed",
    claim: "bounded-by-corpus",
    corpusPath,
    annexPath,
    notCoveredHere: [
      "authoring non-TS idiom layers",
      "AI-generation implementation loop",
      "full @hobo/bindles fluent surface",
    ],
    requiredFollowupForOffCorpusSemantics:
      "Add semantics-annex vectors or mark the behavior unsupported before claiming parity.",
  };
}
