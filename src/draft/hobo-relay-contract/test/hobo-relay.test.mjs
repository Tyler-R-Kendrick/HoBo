import assert from "node:assert/strict";
import test from "node:test";

import {
  attemptInboundConnection,
  attachRelay,
  dispatchRelayWork,
  registerRelay,
  routeRelayTarget
} from "../src/hobo-relay.mjs";

const now = "2026-06-28T12:00:00.000Z";
const yardSvid = "spiffe://yard/tenant-acme/hobo-yard/control-plane";
const relaySvid = "spiffe://yard/tenant-acme/hobo-relay/private-relay";

test("relay registration and attach require governed allow plus outbound-only TCP 443 SVID authentication", () => {
  const registration = registerRelay(relaySpec(), policyAllow("hobo:relay:register"));
  assert.equal(registration.ok, true);
  assert.deepEqual(registration.audit, [
    {
      type: "policy.Decided",
      action: "hobo:relay:register",
      effect: "allow",
      relayId: "relay-private-network"
    },
    {
      type: "relay.Registered",
      relayId: "relay-private-network",
      targetIds: ["cluster-a", "cluster-b"]
    }
  ]);

  const session = attachRelay(registration.relay, policyAllow("hobo:relay:attach"));

  assert.equal(session.ok, true);
  assert.equal(session.session.transport.direction, "relay-to-yard");
  assert.equal(session.session.transport.port, 443);
  assert.equal(session.session.hasInboundListener, false);
  assert.equal(session.session.peer.spiffeId, relaySvid);
  assert.deepEqual(session.session.targetIds, ["cluster-a", "cluster-b"]);
});

test("yard dispatches work and receives exec results through the relay without credential egress", () => {
  const session = attachedRelay();

  const routed = dispatchRelayWork(session.session, {
    workId: "exec-apply-db",
    targetId: "cluster-a",
    resourceId: "db",
    provider: "aws",
    credentialRef: "private-broker://cluster-a/scoped-token/db/apply",
    outputs: { endpoint: "postgres://db.internal" }
  });

  assert.equal(routed.ok, true);
  assert.deepEqual(routed.yardFrames, [
    {
      type: "relay.WorkDispatched",
      relayId: "relay-private-network",
      targetId: "cluster-a",
      workId: "exec-apply-db",
      resourceId: "db",
      provider: "aws"
    },
    {
      type: "exec.Succeeded",
      relayId: "relay-private-network",
      targetId: "cluster-a",
      workId: "exec-apply-db",
      outputs: { endpoint: "postgres://db.internal" }
    }
  ]);
  assert.deepEqual(routed.privateExecutorFrame, {
    targetId: "cluster-a",
    workId: "exec-apply-db",
    resourceId: "db",
    provider: "aws",
    credentialRef: "private-broker://cluster-a/scoped-token/db/apply"
  });
  assert.equal(JSON.stringify(routed.yardFrames).includes("scoped-token"), false);
});

test("one relay routes multiple private targets by target id", () => {
  const session = attachedRelay().session;

  assert.deepEqual(routeRelayTarget(session, "cluster-a"), {
    ok: true,
    relayId: "relay-private-network",
    target: {
      targetId: "cluster-a",
      kind: "kubernetes-cluster",
      privateNetwork: "prod-a"
    }
  });
  assert.deepEqual(routeRelayTarget(session, "cluster-b"), {
    ok: true,
    relayId: "relay-private-network",
    target: {
      targetId: "cluster-b",
      kind: "vm-pool",
      privateNetwork: "prod-b"
    }
  });
});

test("inbound listeners and inbound connection attempts are impossible", () => {
  assert.deepEqual(registerRelay(relaySpec({
    transport: {
      direction: "yard-to-relay",
      protocol: "tcp",
      port: 443
    }
  }), policyAllow("hobo:relay:register")), {
    ok: false,
    code: "relay.transport.not-outbound",
    reason: "relay must dial the Yard over outbound TCP 443"
  });

  assert.deepEqual(registerRelay(relaySpec({
    inboundListeners: [{ host: "0.0.0.0", port: 8443 }]
  }), policyAllow("hobo:relay:register")), {
    ok: false,
    code: "relay.inbound.exposed",
    reason: "relay contract forbids inbound listeners into the private network"
  });

  assert.deepEqual(attemptInboundConnection(attachedRelay().session), {
    ok: false,
    code: "relay.inbound.unavailable",
    reason: "relay relay-private-network exposes no inbound listener"
  });
});

test("invalid, expired, or cross-tenant SVIDs cannot attach", () => {
  assert.deepEqual(attachRelay(registerRelay(relaySpec({
    mtls: mtlsContract({
      peerCertificate: cert(relaySvid, { notAfter: "2026-06-28T11:59:59.000Z" })
    })
  }), policyAllow("hobo:relay:register")).relay, policyAllow("hobo:relay:attach")), {
    ok: false,
    code: "relay.attach.svid-rejected",
    reason: "peer SVID is expired or not yet valid"
  });

  assert.deepEqual(attachRelay(registerRelay(relaySpec({
    mtls: mtlsContract({
      peerCertificate: cert("spiffe://yard/tenant-beta/hobo-relay/private-relay"),
      allowedPeers: ["spiffe://yard/tenant-beta/hobo-relay/private-relay"]
    })
  }), policyAllow("hobo:relay:register")).relay, policyAllow("hobo:relay:attach")), {
    ok: false,
    code: "relay.attach.svid-rejected",
    reason: "peer tenant tenant-beta does not match connection tenant tenant-acme"
  });
});

test("target id mismatch and credential material in a Yard work frame fail closed", () => {
  const session = attachedRelay().session;

  assert.deepEqual(routeRelayTarget(session, "metadata-service"), {
    ok: false,
    code: "relay.target.unknown",
    reason: "target id metadata-service is not registered for relay relay-private-network"
  });

  assert.deepEqual(dispatchRelayWork(session, {
    workId: "exec-apply-db",
    targetId: "cluster-a",
    resourceId: "db",
    provider: "aws",
    credentialRef: "private-broker://cluster-a/scoped-token/db/apply",
    credentialMaterial: "secret-token-value"
  }), {
    ok: false,
    code: "relay.credential.egress",
    reason: "Yard work frames must carry private-network credential references, never credential material"
  });
});

test("relay register and attach actions are governed deny-by-default", () => {
  assert.deepEqual(registerRelay(relaySpec(), policyDeny("hobo:relay:register")), {
    ok: false,
    code: "relay.policy.denied",
    reason: "policy denied hobo:relay:register for relay relay-private-network",
    audit: [{
      type: "policy.Decided",
      action: "hobo:relay:register",
      effect: "deny",
      relayId: "relay-private-network"
    }]
  });

  const registration = registerRelay(relaySpec(), policyAllow("hobo:relay:register"));
  assert.deepEqual(attachRelay(registration.relay, policyDeny("hobo:relay:attach")), {
    ok: false,
    code: "relay.policy.denied",
    reason: "policy denied hobo:relay:attach for relay relay-private-network",
    audit: [{
      type: "policy.Decided",
      action: "hobo:relay:attach",
      effect: "deny",
      relayId: "relay-private-network"
    }]
  });
});

function attachedRelay() {
  const registration = registerRelay(relaySpec(), policyAllow("hobo:relay:register"));
  assert.equal(registration.ok, true);
  const session = attachRelay(registration.relay, policyAllow("hobo:relay:attach"));
  assert.equal(session.ok, true);
  return session;
}

function relaySpec(overrides = {}) {
  return {
    relayId: "relay-private-network",
    tenant: "tenant-acme",
    transport: {
      direction: "relay-to-yard",
      protocol: "tcp",
      port: 443
    },
    inboundListeners: [],
    mtls: mtlsContract(),
    targets: [
      {
        targetId: "cluster-a",
        kind: "kubernetes-cluster",
        privateNetwork: "prod-a"
      },
      {
        targetId: "cluster-b",
        kind: "vm-pool",
        privateNetwork: "prod-b"
      }
    ],
    ...overrides
  };
}

function mtlsContract(overrides = {}) {
  return {
    schemaVersion: "hobo.mtls-data-path/v1",
    connectionId: "conn-yard-relay",
    tenant: "tenant-acme",
    trustDomain: "yard",
    sourceSvid: yardSvid,
    peerCertificate: cert(relaySvid),
    allowedPeers: [relaySvid],
    certMaterialRef: "identity://svid-cert/tenant-acme/hobo-yard/control-plane",
    authz: {
      bindEdgeId: "yard.control-plane->relay.private-relay",
      verbs: ["connect"]
    },
    now,
    ...overrides
  };
}

function cert(spiffeId, overrides = {}) {
  return {
    spiffeId,
    serialNumber: "stub-cert-relay",
    notBefore: "2026-06-28T11:55:00.000Z",
    notAfter: "2026-06-28T12:05:00.000Z",
    rotationEpoch: 1,
    ...overrides
  };
}

function policyAllow(action) {
  return { action, effect: "allow" };
}

function policyDeny(action) {
  return { action, effect: "deny" };
}
