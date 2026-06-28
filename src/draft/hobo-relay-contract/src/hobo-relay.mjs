import { evaluateMtlsHandshake } from "../../mtls-data-path-contract/src/mtls-data-path.mjs";

const REGISTER_ACTION = "hobo:relay:register";
const ATTACH_ACTION = "hobo:relay:attach";
const FORBIDDEN_WORK_CREDENTIAL_FIELDS = [
  "credential",
  "credentials",
  "credentialMaterial",
  "providerToken",
  "token",
  "secret"
];

export function registerRelay(spec, policyDecision) {
  const policy = evaluateRelayPolicy(spec, REGISTER_ACTION, policyDecision);
  if (!policy.ok) return policy;

  if (
    spec?.transport?.direction !== "relay-to-yard" ||
    spec?.transport?.protocol !== "tcp" ||
    spec?.transport?.port !== 443
  ) {
    return invalid("relay.transport.not-outbound", "relay must dial the Yard over outbound TCP 443");
  }

  if (Array.isArray(spec.inboundListeners) && spec.inboundListeners.length > 0) {
    return invalid("relay.inbound.exposed", "relay contract forbids inbound listeners into the private network");
  }

  const relay = clone({
    ...spec,
    inboundListeners: [],
    targetIds: spec.targets.map((target) => target.targetId)
  });

  return {
    ok: true,
    relay,
    audit: [
      ...policy.audit,
      {
        type: "relay.Registered",
        relayId: spec.relayId,
        targetIds: relay.targetIds
      }
    ]
  };
}

export function attachRelay(relay, policyDecision) {
  const policy = evaluateRelayPolicy(relay, ATTACH_ACTION, policyDecision);
  if (!policy.ok) return policy;

  const handshake = evaluateMtlsHandshake(relay.mtls);
  if (!handshake.ok) {
    return invalid("relay.attach.svid-rejected", handshake.reason);
  }

  return {
    ok: true,
    session: {
      relayId: relay.relayId,
      tenant: relay.tenant,
      transport: clone(relay.transport),
      hasInboundListener: false,
      targetIds: relay.targetIds.slice(),
      targets: relay.targets.map(clone),
      peer: {
        spiffeId: relay.mtls.peerCertificate.spiffeId,
        parsed: handshake.peer
      }
    },
    audit: [
      ...policy.audit,
      {
        type: "relay.Attached",
        relayId: relay.relayId,
        peerSvid: relay.mtls.peerCertificate.spiffeId
      }
    ]
  };
}

export function routeRelayTarget(session, targetId) {
  const target = session.targets.find((candidate) => candidate.targetId === targetId);
  if (!target) {
    return invalid(
      "relay.target.unknown",
      `target id ${targetId} is not registered for relay ${session.relayId}`
    );
  }

  return {
    ok: true,
    relayId: session.relayId,
    target: clone(target)
  };
}

export function attemptInboundConnection(session) {
  return invalid("relay.inbound.unavailable", `relay ${session.relayId} exposes no inbound listener`);
}

export function dispatchRelayWork(session, work) {
  for (const field of FORBIDDEN_WORK_CREDENTIAL_FIELDS) {
    if (field in work) {
      return invalid(
        "relay.credential.egress",
        "Yard work frames must carry private-network credential references, never credential material"
      );
    }
  }

  const route = routeRelayTarget(session, work.targetId);
  if (!route.ok) return route;

  return {
    ok: true,
    yardFrames: [
      {
        type: "relay.WorkDispatched",
        relayId: session.relayId,
        targetId: work.targetId,
        workId: work.workId,
        resourceId: work.resourceId,
        provider: work.provider
      },
      {
        type: "exec.Succeeded",
        relayId: session.relayId,
        targetId: work.targetId,
        workId: work.workId,
        outputs: clone(work.outputs)
      }
    ],
    privateExecutorFrame: {
      targetId: work.targetId,
      workId: work.workId,
      resourceId: work.resourceId,
      provider: work.provider,
      credentialRef: work.credentialRef
    }
  };
}

function evaluateRelayPolicy(spec, action, decision = {}) {
  const relayId = spec?.relayId ?? "unknown";
  const effect = decision.action === action ? decision.effect : "deny";
  const audit = [
    {
      type: "policy.Decided",
      action,
      effect,
      relayId
    }
  ];

  if (effect !== "allow") {
    return {
      ok: false,
      code: "relay.policy.denied",
      reason: `policy denied ${action} for relay ${relayId}`,
      audit
    };
  }

  return { ok: true, audit };
}

function invalid(code, reason) {
  return { ok: false, code, reason };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
