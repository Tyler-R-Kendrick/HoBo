import assert from "node:assert/strict";
import test from "node:test";

import { createExperimentEvent } from "../../hobo-experiment-port/src/experiment-contract.mjs";
import {
  analyzeExperiment,
  ExperimentAnalysisError
} from "../src/experiment-statistical-analysis.mjs";

function experimentDefinition(overrides = {}) {
  return {
    key: "checkout-copy",
    controlVariant: "control",
    minimumSamplesPerVariant: 4,
    primaryConfidence: 0.95,
    metrics: [
      {
        name: "checkout.completed",
        role: "primary",
        direction: "increase",
        minDetectableEffect: 0.2,
        bounds: [0, 1]
      },
      {
        name: "checkout.error_rate",
        role: "guardrail",
        direction: "decrease",
        maxRegression: 0.05,
        bounds: [0, 1]
      }
    ],
    ...overrides
  };
}

function exposure(subjectKey, variantKey, overrides = {}) {
  return {
    type: "experiment.Exposed",
    id: `${variantKey}:${subjectKey}`,
    data: {
      experimentKey: "checkout-copy",
      subjectKey,
      variantKey,
      sampling: {
        population: "sampled",
        sampled: true,
        rateBasisPoints: 10000
      },
      ...overrides
    }
  };
}

function metric(subjectKey, variantKey, metricName, value) {
  return {
    experimentKey: "checkout-copy",
    subjectKey,
    variantKey,
    metricName,
    value
  };
}

function metricEvent(observation) {
  return {
    type: "metric.Observed",
    data: observation
  };
}

function cohort(variantKey, values, metricName = "checkout.completed") {
  return values.map((value, index) => {
    const subjectKey = `${variantKey}-${index}`;
    return {
      exposure: exposure(subjectKey, variantKey),
      metric: metric(subjectKey, variantKey, metricName, value)
    };
  });
}

function flatten(groups) {
  return groups.flatMap((group) => group);
}

test("analysis is pure and replayable for fixed exposures and metrics", () => {
  const rows = flatten([
    cohort("control", [0, 0, 0, 0]),
    cohort("treatment", [1, 1, 1, 1])
  ]);
  const input = {
    exposures: rows.map((row) => row.exposure),
    metrics: rows.map((row) => metricEvent(row.metric)),
    seq: 42
  };

  const left = analyzeExperiment(experimentDefinition(), input);
  const right = analyzeExperiment(experimentDefinition(), input);

  assert.deepEqual(left, right);
  assert.equal(left.event.type, "experiment.Concluded");
  assert.equal(left.event.seq, 42);
  assert.doesNotThrow(() => createExperimentEvent("experiment.Concluded", left.event.data));
});

test("clearly winning variant concludes winner with confidence interval", () => {
  const rows = flatten([
    cohort("control", [0, 0, 0, 0, 0, 0]),
    cohort("treatment", [1, 1, 1, 1, 1, 1])
  ]);

  const analysis = analyzeExperiment(experimentDefinition(), {
    exposures: rows.map((row) => row.exposure),
    metrics: rows.map((row) => row.metric),
    seq: 7
  });

  assert.equal(analysis.outcome, "winner");
  assert.equal(analysis.event.data.verdict, "promote");
  assert.equal(analysis.event.data.winningVariant, "treatment");
  assert.equal(analysis.primary.interval.lower > 0, true);
  assert.equal(analysis.primary.confidence, 0.95);
});

test("underpowered experiment is inconclusive and never a false winner", () => {
  const rows = flatten([
    cohort("control", [0, 0]),
    cohort("treatment", [1, 1])
  ]);

  const analysis = analyzeExperiment(experimentDefinition(), {
    exposures: rows.map((row) => row.exposure),
    metrics: rows.map((row) => row.metric),
    seq: 8
  });

  assert.equal(analysis.outcome, "inconclusive");
  assert.equal(analysis.event.data.verdict, "inconclusive");
  assert.match(analysis.event.data.reason, /insufficient sample/);
});

test("guardrail regression flips a would-be winner to do not ship", () => {
  const primaryRows = flatten([
    cohort("control", [0, 0, 0, 0, 0, 0]),
    cohort("treatment", [1, 1, 1, 1, 1, 1])
  ]);
  const guardrailRows = flatten([
    cohort("control", [0, 0, 0, 0, 0, 0], "checkout.error_rate"),
    cohort("treatment", [0.2, 0.2, 0.2, 0.2, 0.2, 0.2], "checkout.error_rate")
  ]);

  const analysis = analyzeExperiment(experimentDefinition(), {
    exposures: primaryRows.map((row) => row.exposure),
    metrics: [...primaryRows, ...guardrailRows].map((row) => row.metric),
    seq: 9
  });

  assert.equal(analysis.outcome, "do-not-ship");
  assert.equal(analysis.event.data.verdict, "rollback");
  assert.equal(analysis.guardrails[0].regressed, true);
  assert.equal(
    analysis.guardrails[0].interval.lower > analysis.guardrails[0].maxRegression,
    true
  );
});

test("extreme metric outlier cannot let one subject flip the verdict", () => {
  const rows = flatten([
    cohort("control", [0.5, 0.5, 0.5, 0.5]),
    cohort("treatment", [0.5, 0.5, 0.5, 100])
  ]);

  const analysis = analyzeExperiment(experimentDefinition(), {
    exposures: rows.map((row) => row.exposure),
    metrics: rows.map((row) => row.metric),
    seq: 10
  });

  assert.equal(analysis.outcome, "no-difference");
  assert.equal(analysis.event.data.verdict, "inconclusive");
  assert.equal(analysis.primary.outliersClamped, 1);
});

test("sampled exposure counts are scaled instead of treated as full traffic", () => {
  const sampledExposure = (subjectKey, variantKey) =>
    exposure(subjectKey, variantKey, {
      sampling: {
        population: "sampled",
        sampled: true,
        rateBasisPoints: 5000
      }
    });
  const exposures = [
    sampledExposure("control-0", "control"),
    sampledExposure("treatment-0", "treatment")
  ];
  const metrics = [
    metric("control-0", "control", "checkout.completed", 0),
    metric("treatment-0", "treatment", "checkout.completed", 1)
  ];

  const analysis = analyzeExperiment(experimentDefinition({ minimumSamplesPerVariant: 1 }), {
    exposures,
    metrics,
    seq: 11
  });

  assert.equal(analysis.variants.control.observedExposures, 1);
  assert.equal(analysis.variants.control.populationEstimate, 2);
  assert.equal(analysis.variants.treatment.populationEstimate, 2);

  const underpowered = analyzeExperiment(experimentDefinition({ minimumSamplesPerVariant: 2 }), {
    exposures,
    metrics,
    seq: 12
  });

  assert.equal(underpowered.outcome, "inconclusive");
  assert.match(underpowered.event.data.reason, /insufficient sample/);
});

test("zero exposures conclude inconclusive instead of divide by zero", () => {
  const analysis = analyzeExperiment(experimentDefinition(), {
    exposures: [],
    metrics: [],
    seq: 13
  });

  assert.equal(analysis.outcome, "inconclusive");
  assert.equal(analysis.event.data.verdict, "inconclusive");
  assert.match(analysis.event.data.reason, /zero exposures/);
});

test("sampled exposure without a sampling rate fails closed", () => {
  assert.throws(
    () =>
      analyzeExperiment(experimentDefinition(), {
        exposures: [
          exposure("control-0", "control", {
            sampling: { population: "sampled", sampled: true }
          })
        ],
        metrics: [],
        seq: 14
      }),
    (error) =>
      error instanceof ExperimentAnalysisError &&
      error.code === "invalid-sampling-marker"
  );
});
