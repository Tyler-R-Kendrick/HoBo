import { describe, expect, it } from "vitest";

import {
  createFixtureHostAttestor,
  createInMemoryVault,
  IdentityService,
  TokenBroker,
  type ActiveSvidRecord,
} from "../src/index.js";

const ISSUER_URL = "https://identity.yard.example";
const NOW = "2026-06-25T15:00:00.000Z";
const IMAGE_DIGEST = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const CODE_DIGEST = "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

// A fixture-only root credential. It is never shipped and only ever lives inside
// the in-memory vault; the secret-scan test below proves it never leaks out.
const FIXTURE_ROOT_SECRET = "fixture-root-credential-3f9a-DO-NOT-SHIP";

function launchMeasurement(overrides: Record<string, unknown> = {}) {
  return {
    runId: "run-20260625-identity-628",
    tenant: "tenant-a",
    parentPrincipal: { kind: "user", id: "user:platform-admin" },
    codeVersion: { digest: CODE_DIGEST, version: "git:628-identity" },
    componentImageDigest: IMAGE_DIGEST,
    hostId: "host-firecracker-1",
    issuedAt: "2026-06-25T14:59:30.000Z",
    expiresAt: "2026-06-25T15:01:00.000Z",
    nonce: "nonce-hobo-628",
    isolationTier: "firecracker-microvm",
    ...overrides,
  };
}

async function issuedSvid(): Promise<{ service: IdentityService; svid: ActiveSvidRecord }> {
  const service = new IdentityService({ issuerUrl: ISSUER_URL, genesisKeyId: "yard-genesis-2026-07" });
  const attestor = createFixtureHostAttestor({ hostId: "host-firecracker-1" });
  const document = attestor.createDocument({ launchMeasurement: launchMeasurement() });
  const result = await service.issueSvidFromAttestation({
    attestationDocument: document,
    requestedScope: { port: "database", resource: "shop.db", verbs: ["write", "read"] },
    audience: "hobo-broker",
    agentName: "deployer",
    hostPublicKeys: attestor.publicKeys(),
    knownImageDigests: [IMAGE_DIGEST],
    now: NOW,
  });
  if (result.status !== "issued") throw new Error(`expected issued, got ${result.status}`);
  return { service, svid: result.svid };
}

describe("identity + token events carry never-compact credential-audit retention", () => {
  it("identity.Issued retention is never-compacted", async () => {
    const { service } = await issuedSvid();
    const events = service.getAuditEvents();
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe("identity.Issued");
    expect(events[0]?.retention.neverCompact).toBe(true);
    expect(events[0]?.retention.class).toBe("security-audit");
  });

  it("token.Granted retention is never-compacted and shares the identity retention object", async () => {
    const { svid, service } = await issuedSvid();
    const broker = new TokenBroker({
      vault: createInMemoryVault({ reference: "tokenref://vault/root-1", rootSecret: FIXTURE_ROOT_SECRET }),
      audience: "provider-sts",
    });
    const granted = broker.grantForDeploy({
      svid,
      scope: { port: "database", resource: "shop.db", action: "write" },
      deployId: "deploy-42",
      now: NOW,
    });
    expect(granted.status).toBe("granted");
    const tokenEvent = broker.getAuditEvents()[0];
    const identityEvent = service.getAuditEvents()[0];
    expect(tokenEvent?.type).toBe("token.Granted");
    expect(tokenEvent?.retention.neverCompact).toBe(true);
    // same frozen retention descriptor as the identity events
    expect(tokenEvent?.retention).toBe(identityEvent?.retention);
  });
});

describe("token broker mints a per-deploy scoped token bound to the SVID", () => {
  it("mints a token bound to the SVID subject and scope, emitting token.Granted", async () => {
    const { svid } = await issuedSvid();
    const broker = new TokenBroker({
      vault: createInMemoryVault({ reference: "tokenref://vault/root-1", rootSecret: FIXTURE_ROOT_SECRET }),
      audience: "provider-sts",
      ttlSeconds: 600,
    });
    const granted = broker.grantForDeploy({
      svid,
      scope: { port: "database", resource: "shop.db", action: "write" },
      deployId: "deploy-42",
      now: NOW,
    });
    expect(granted.status).toBe("granted");
    if (granted.status !== "granted") return;

    expect(granted.grant.svidSubject).toBe(svid.subject);
    expect(granted.grant.svidIdentityId).toBe(svid.identityId);
    expect(granted.grant.token.startsWith("hobotok_")).toBe(true);
    expect(granted.grant.expiresAt).toBe(new Date(Date.parse(NOW) + 600 * 1000).toISOString());
    expect(granted.events[0]?.type).toBe("token.Granted");
    expect(granted.events[0]?.data.svidSubject).toBe(svid.subject);
    expect(granted.events[0]?.data.tokenRef).toMatch(/^tokenref:\/\/broker\/grant\//);

    // deterministic: the same binding mints the same fixture token
    const broker2 = new TokenBroker({
      vault: createInMemoryVault({ reference: "tokenref://vault/root-1", rootSecret: FIXTURE_ROOT_SECRET }),
      audience: "provider-sts",
      ttlSeconds: 600,
    });
    const again = broker2.grantForDeploy({
      svid,
      scope: { port: "database", resource: "shop.db", action: "write" },
      deployId: "deploy-42",
      now: NOW,
    });
    expect(again.status === "granted" && again.grant.token).toBe(granted.grant.token);
  });

  it("rejects a broker scope the SVID does not authorize (no widening past the SVID)", async () => {
    const { svid } = await issuedSvid();
    const broker = new TokenBroker({
      vault: createInMemoryVault({ reference: "tokenref://vault/root-1", rootSecret: FIXTURE_ROOT_SECRET }),
      audience: "provider-sts",
    });
    const denied = broker.grantForDeploy({
      svid,
      scope: { port: "database", resource: "shop.db", action: "delete" },
      deployId: "deploy-42",
      now: NOW,
    });
    expect(denied.status).toBe("denied");
    if (denied.status !== "denied") return;
    expect(denied.reason).toBe("scope-not-authorized-by-svid");
    expect(broker.getAuditEvents()).toHaveLength(0);
  });

  it("emits token.Used and token.Revoked over the grant lifecycle", async () => {
    const { svid } = await issuedSvid();
    const broker = new TokenBroker({
      vault: createInMemoryVault({ reference: "tokenref://vault/root-1", rootSecret: FIXTURE_ROOT_SECRET }),
      audience: "provider-sts",
    });
    const granted = broker.grantForDeploy({
      svid,
      scope: { port: "database", resource: "shop.db", action: "read" },
      deployId: "deploy-7",
      now: NOW,
    });
    if (granted.status !== "granted") throw new Error("expected granted");

    const used = broker.useToken({ grantId: granted.grant.grantId, now: NOW });
    expect(used.status).toBe("used");
    expect(used.events[0]?.type).toBe("token.Used");

    const revoked = broker.revokeToken({ grantId: granted.grant.grantId, reason: "deploy-complete", now: NOW });
    expect(revoked.status).toBe("revoked");
    expect(revoked.events[0]?.type).toBe("token.Revoked");

    const afterRevoke = broker.useToken({ grantId: granted.grant.grantId, now: NOW });
    expect(afterRevoke.status).toBe("denied");
    if (afterRevoke.status === "denied") expect(afterRevoke.reason).toBe("grant-revoked");
  });
});

describe("secret-scan: no static vaulted secret leaks outside the vault", () => {
  it("the minted token, grant record, and every emitted event exclude the root secret", async () => {
    const { svid } = await issuedSvid();
    const broker = new TokenBroker({
      vault: createInMemoryVault({ reference: "tokenref://vault/root-1", rootSecret: FIXTURE_ROOT_SECRET }),
      audience: "provider-sts",
    });
    const granted = broker.grantForDeploy({
      svid,
      scope: { port: "database", resource: "shop.db", action: "write" },
      deployId: "deploy-42",
      now: NOW,
    });
    if (granted.status !== "granted") throw new Error("expected granted");
    broker.useToken({ grantId: granted.grant.grantId, now: NOW });
    broker.revokeToken({ grantId: granted.grant.grantId, reason: "done", now: NOW });

    const surface = JSON.stringify({
      grant: granted.grant,
      events: broker.getAuditEvents(),
    });
    // The raw root credential must never cross the vault boundary.
    expect(surface.includes(FIXTURE_ROOT_SECRET)).toBe(false);
    // What crosses is a non-secret reference and one-way-derived material.
    expect(granted.grant.vaultReference).toBe("tokenref://vault/root-1");
    expect(granted.grant.token).not.toContain(FIXTURE_ROOT_SECRET);
  });
});

describe("rotation narrows scope (accepts an equal-or-narrower scope)", () => {
  it("accepts a narrowing rotation inside the renewal grace window", async () => {
    const service = new IdentityService({
      issuerUrl: ISSUER_URL,
      genesisKeyId: "yard-genesis-2026-07",
      ttlSeconds: 900,
      renewalGraceSeconds: 300,
    });
    const attestor = createFixtureHostAttestor({ hostId: "host-firecracker-1" });
    const document = attestor.createDocument({ launchMeasurement: launchMeasurement() });
    const issued = await service.issueSvidFromAttestation({
      attestationDocument: document,
      requestedScope: { port: "database", resource: "shop.db", verbs: ["write", "read"] },
      audience: "hobo-gateway",
      agentName: "deployer",
      hostPublicKeys: attestor.publicKeys(),
      knownImageDigests: [IMAGE_DIGEST],
      now: NOW,
    });
    if (issued.status !== "issued") throw new Error("expected issued");

    const narrowed = await service.rotateSvidWithScope({
      identityId: issued.svid.identityId,
      requestedScope: { port: "database", resource: "shop.db", verbs: ["read"] },
      now: "2026-06-25T15:14:30.000Z",
    });
    expect(narrowed.status).toBe("rotated");
  });
});
