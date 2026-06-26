import assert from "node:assert/strict";
import test from "node:test";

import {
  blueGreenStrategy,
  canaryStrategy,
  createDeploymentStrategySaga,
  progressiveStrategy,
  recreateStrategy,
  replayGatewayState,
} from "../src/deployment-strategy-saga-templates.mjs";

const baseTarget = Object.freeze({
  service: "checkout-web",
  routeId: "checkout-public",
  fromVersion: "checkout@sha256:blue",
  toVersion: "checkout@sha256:green",
});

test("canary shifts traffic in stages and auto-rolls back on injected regression signals", async () => {
  const gateway = recordingGateway();
  const saga = createDeploymentStrategySaga({ now: fixedClock() });

  const result = await saga.run({
    rollout: rolloutWith(canaryStrategy({
      routeId: baseTarget.routeId,
      percentages: [1, 10, 50, 100],
      healthGate: { id: "checkout-red", timeoutMs: 300000 },
      autoRollbackSignals: ["slo-burn", "golden-suite"],
    })),
    gateway,
    gateSignal: ({ step }) => {
      if (step.action.toWeight === 50) {
        return {
          signals: {
            sloBurn: { verdict: "rollback", sourceSeq: 17 },
            goldenSuite: { status: "passed", runId: "golden-17" },
          },
        };
      }

      return { decision: "pass", reason: "healthy" };
    },
  });

  assert.equal(result.status.state, "rolled-back");
  assert.deepEqual(
    gateway.commands.map((command) => [command.kind, command.toWeight ?? command.restoredWeight]),
    [
      ["gateway.shiftTraffic", 1],
      ["gateway.shiftTraffic", 10],
      ["gateway.shiftTraffic", 50],
      ["gateway.rollbackTraffic", 100],
    ],
  );
  assert.deepEqual(result.events.map((event) => event.type), [
    "rollout.Started",
    "rollout.Stepped",
    "rollout.GateEvaluated",
    "rollout.Stepped",
    "rollout.GateEvaluated",
    "rollout.Stepped",
    "rollout.GateEvaluated",
    "rollout.Failed",
    "rollout.RolledBack",
  ]);
  assert.equal(result.events[6].data.gateRefs[0].kind, "health");
  assert.deepEqual(result.events[6].data.signals, {
    sloBurn: { verdict: "rollback", sourceSeq: 17 },
    goldenSuite: { status: "passed", runId: "golden-17" },
  });
  assert.deepEqual(replayGatewayState(result.events), gateway.state);
});

test("blue-green flips the router only after the health gate and retains blue through soak", async () => {
  const gateway = recordingGateway();
  const saga = createDeploymentStrategySaga({ now: fixedClock() });

  const result = await saga.run({
    rollout: rolloutWith(blueGreenStrategy({
      routeId: baseTarget.routeId,
      healthGate: { id: "checkout-green-ready", timeoutMs: 180000 },
      soakSeconds: 900,
    })),
    gateway,
    gateSignal: ({ step }) => {
      if (step.action.kind === "gateway.flipRoute") {
        assert.deepEqual(gateway.commands.map((command) => command.kind), ["deployment.prepareGreen"]);
      }
      return { decision: "pass", reason: "green slot healthy" };
    },
  });

  assert.equal(result.status.state, "promoted");
  assert.deepEqual(gateway.commands.map((command) => command.kind), [
    "deployment.prepareGreen",
    "gateway.flipRoute",
    "deployment.retainBlue",
  ]);
  assert.deepEqual(result.events.map((event) => event.type), [
    "rollout.Started",
    "rollout.Stepped",
    "rollout.GateEvaluated",
    "rollout.Stepped",
    "rollout.Stepped",
    "rollout.Promoted",
  ]);
  assert.equal(gateway.state.activeVersion, baseTarget.toVersion);
  assert.equal(gateway.state.retainedVersion, baseTarget.fromVersion);
  assert.equal(gateway.state.reapAfter, "2026-06-26T19:18:00.000Z");
  assert.equal(result.events.at(-1).data.retainedVersion, baseTarget.fromVersion);
  assert.deepEqual(replayGatewayState(result.events), gateway.state);
});

test("recreate and progressive templates compile provider-agnostic saga steps", () => {
  const recreate = recreateStrategy({
    routeId: baseTarget.routeId,
    healthGate: { id: "checkout-new-ready", timeoutMs: 120000 },
  });
  const progressive = progressiveStrategy({
    routeId: baseTarget.routeId,
    stages: [
      { name: "internal", toWeight: 5, timeoutMs: 120000 },
      { name: "regional", toWeight: 25, timeoutMs: 180000 },
      { name: "global", toWeight: 100, timeoutMs: 300000 },
    ],
    autoRollbackSignals: ["slo-burn", "golden-suite"],
  });

  assert.deepEqual(recreate.steps.map((step) => [step.name, step.action.kind, step.gateTiming]), [
    ["stop-blue", "deployment.stopVersion", "after"],
    ["start-green", "deployment.startVersion", "after"],
    ["route-green", "gateway.shiftTraffic", "before"],
  ]);
  assert.deepEqual(progressive.steps.map((step) => [step.name, step.action.toWeight]), [
    ["progressive-internal", 5],
    ["progressive-regional", 25],
    ["progressive-global", 100],
  ]);
  assert.equal(progressive.steps[0].gateRefs.at(-1).signal, "golden-suite");
});

test("flapping health signals require hysteresis and fail closed on timeout", async () => {
  const gateway = recordingGateway();
  const saga = createDeploymentStrategySaga({ now: fixedClock() });

  const result = await saga.run({
    rollout: rolloutWith(canaryStrategy({
      routeId: baseTarget.routeId,
      percentages: [1, 10],
      healthGate: { id: "checkout-red", timeoutMs: 30000, passAfterConsecutive: 2 },
    })),
    gateway,
    gateSignal: () => ({
      healthSamples: ["healthy", "unhealthy", "healthy", "unhealthy", "healthy"],
      reason: "flapping sample window exhausted",
    }),
  });

  assert.equal(result.status.state, "rolled-back");
  assert.equal(result.events[2].data.decision, "fail");
  assert.equal(result.events[2].data.reason, "health-hysteresis-timeout");
  assert.deepEqual(gateway.commands.map((command) => command.kind), [
    "gateway.shiftTraffic",
    "gateway.rollbackTraffic",
  ]);
});

test("half-applied blue-green router flips are retried idempotently before the step completes", async () => {
  const gateway = recordingGateway({ partialFlipOnce: true });
  const saga = createDeploymentStrategySaga({ now: fixedClock() });

  const result = await saga.run({
    rollout: rolloutWith(blueGreenStrategy({
      routeId: baseTarget.routeId,
      healthGate: { id: "checkout-green-ready", timeoutMs: 180000 },
      soakSeconds: 900,
    })),
    gateway,
  });

  const flipCommands = gateway.commands.filter((command) => command.kind === "gateway.flipRoute");
  assert.equal(result.status.state, "promoted");
  assert.equal(flipCommands.length, 2);
  assert.equal(flipCommands[0].idempotencyKey, flipCommands[1].idempotencyKey);
  const flipEvent = result.events.find(
    (event) => event.type === "rollout.Stepped" && event.data.step.action.kind === "gateway.flipRoute",
  );
  assert.equal(flipEvent.data.actionResult.attempts, 2);
  assert.equal(gateway.state.activeVersion, baseTarget.toVersion);
});

test("canary stuck between stages on gate timeout rolls back to the old version", { timeout: 1000 }, async () => {
  const gateway = recordingGateway();
  const saga = createDeploymentStrategySaga({ now: fixedClock() });

  const result = await saga.run({
    rollout: rolloutWith(canaryStrategy({
      routeId: baseTarget.routeId,
      percentages: [1, 10, 50],
      healthGate: { id: "checkout-red", timeoutMs: 1 },
    })),
    gateway,
    gateSignal: ({ step }) => step.action.toWeight === 10
      ? new Promise(() => {})
      : { decision: "pass", reason: "healthy" },
  });

  assert.equal(result.status.state, "rolled-back");
  assert.equal(result.status.rollbackReason, "gate timeout: canary-10 exceeded 1ms");
  assert.deepEqual(gateway.state, {
    routeId: baseTarget.routeId,
    activeVersion: baseTarget.fromVersion,
    split: {
      [baseTarget.fromVersion]: 100,
      [baseTarget.toVersion]: 0,
    },
  });
  assert.deepEqual(replayGatewayState(result.events), gateway.state);
});

test("terminal rollout replay does not execute later gateway steps", async () => {
  const saga = createDeploymentStrategySaga({ now: fixedClock() });
  const first = await saga.run({
    rollout: rolloutWith(canaryStrategy({
      routeId: baseTarget.routeId,
      percentages: [1, 10, 50],
      healthGate: { id: "checkout-red", timeoutMs: 30000 },
    })),
    gateway: recordingGateway(),
    gateSignal: ({ step }) => step.action.toWeight === 10
      ? { decision: "fail", reason: "injected regression" }
      : { decision: "pass", reason: "healthy" },
  });
  const resumedGateway = recordingGateway();

  const resumed = await saga.run({
    rollout: rolloutWith(canaryStrategy({
      routeId: baseTarget.routeId,
      percentages: [1, 10, 50],
      healthGate: { id: "checkout-red", timeoutMs: 30000 },
    })),
    eventLog: first.events,
    gateway: resumedGateway,
  });

  assert.equal(first.status.state, "rolled-back");
  assert.equal(resumed.status.state, "rolled-back");
  assert.deepEqual(resumed.events, []);
  assert.deepEqual(resumedGateway.commands, []);
});

function rolloutWith(strategy) {
  return {
    rolloutId: "rollout_checkout_canary",
    runId: "run_checkout_canary",
    tenant: "tenant_a",
    actor: { kind: "service-account", id: "delivery-harness", tenant: "tenant_a" },
    target: baseTarget,
    strategy,
  };
}

function recordingGateway(options = {}) {
  let partialFlipReturned = false;
  const gateway = {
    state: {
      routeId: baseTarget.routeId,
      activeVersion: baseTarget.fromVersion,
      split: {
        [baseTarget.fromVersion]: 100,
        [baseTarget.toVersion]: 0,
      },
    },
    commands: [],
    async apply(command) {
      this.commands.push(command);
      if (command.kind === "gateway.shiftTraffic") {
        this.state = {
          routeId: command.routeId,
          activeVersion: command.toWeight === 100 ? command.toVersion : command.fromVersion,
          split: {
            [command.fromVersion]: 100 - command.toWeight,
            [command.toVersion]: command.toWeight,
          },
        };
        return { status: "applied", state: this.state };
      }

      if (command.kind === "gateway.rollbackTraffic") {
        this.state = {
          routeId: command.routeId,
          activeVersion: command.restoredVersion,
          split: {
            [command.restoredVersion]: command.restoredWeight,
            [command.revertedVersion]: 0,
          },
        };
        return { status: "applied", state: this.state };
      }

      if (command.kind === "deployment.prepareGreen") {
        this.state = {
          ...this.state,
          preparedVersion: command.toVersion,
        };
        return { status: "applied", state: this.state };
      }

      if (command.kind === "gateway.flipRoute") {
        if (options.partialFlipOnce && !partialFlipReturned) {
          partialFlipReturned = true;
          this.state = {
            routeId: command.routeId,
            activeVersion: command.fromVersion,
            retainedVersion: command.fromVersion,
            partialFlip: true,
            split: {
              [command.fromVersion]: 50,
              [command.toVersion]: 50,
            },
          };
          return { status: "partial", state: this.state };
        }

        this.state = {
          routeId: command.routeId,
          activeVersion: command.toVersion,
          retainedVersion: command.fromVersion,
          split: {
            [command.fromVersion]: 0,
            [command.toVersion]: 100,
          },
        };
        return { status: "applied", state: this.state };
      }

      if (command.kind === "deployment.retainBlue") {
        this.state = {
          ...this.state,
          retainedVersion: command.retainedVersion,
          reapAfter: command.reapAfter,
        };
        return { status: "applied", state: this.state };
      }

      throw new Error(`unexpected command ${command.kind}`);
    },
  };

  return gateway;
}

function fixedClock() {
  let tick = 0;
  return () => `2026-06-26T19:${String(tick++).padStart(2, "0")}:00.000Z`;
}
