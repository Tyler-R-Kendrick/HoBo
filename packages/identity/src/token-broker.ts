import { createHmac } from "node:crypto";

import {
  createTokenGrantedEvent,
  createTokenRevokedEvent,
  createTokenUsedEvent,
  validateTokenEvent,
  type TokenEvent,
  type TokenScope,
} from "./events.js";
import type { ActiveSvidRecord } from "./identity-service.js";

export const TOKEN_BROKER_DEFAULT_TTL_SECONDS = 900;

// domain-view: an abstract vaulted root credential. The raw secret never leaves
// the vault: callers can only (a) read a non-secret reference and (b) ask the
// vault to derive non-invertible, scope-bound material by keyed HMAC. No real
// secret is hardcoded — the in-memory fixture vault takes its root secret from
// its constructor.
export type VaultedCredential = Readonly<{
  reference: string;
  deriveScopedMaterial(bindingMaterial: string): string;
  matchesReference(candidate: string): boolean;
}>;

export function createInMemoryVault(options: {
  reference: string;
  rootSecret: string;
}): VaultedCredential {
  // The root secret is closed over and is never re-exposed. Only HMAC-derived
  // (one-way) material ever crosses the boundary, so a scoped token cannot be
  // inverted back to the vaulted root credential.
  const rootSecret = options.rootSecret;
  const reference = options.reference;
  return Object.freeze({
    reference,
    deriveScopedMaterial(bindingMaterial: string): string {
      return createHmac("sha256", rootSecret).update(bindingMaterial).digest("base64url");
    },
    matchesReference(candidate: string): boolean {
      return candidate === reference;
    },
  });
}

// domain-view: a minted, per-deploy, scope-bound broker token. Its generated
// wire form is TokenGrantRecord in data-models/identity.proto.
export type ScopedTokenGrant = Readonly<{
  grantId: string;
  token: string;
  svidSubject: string;
  svidIdentityId: string;
  scope: TokenScope;
  deployId: string;
  audience: string;
  issuedAt: string;
  expiresAt: string;
  tokenRef: string;
  vaultReference: string;
}>;

export type GrantTokenResult =
  | Readonly<{ status: "granted"; grant: ScopedTokenGrant; events: readonly TokenEvent[] }>
  | Readonly<{ status: "denied"; reason: string; events: readonly TokenEvent[] }>;

export type UseTokenResult =
  | Readonly<{ status: "used"; grant: ScopedTokenGrant; events: readonly TokenEvent[] }>
  | Readonly<{ status: "denied"; reason: string; events: readonly TokenEvent[] }>;

export type RevokeTokenResult =
  | Readonly<{ status: "revoked"; events: readonly TokenEvent[] }>
  | Readonly<{ status: "denied"; reason: string; events: readonly TokenEvent[] }>;

/**
 * Per-deploy token broker. Holds a single vaulted root credential and mints
 * short-lived, scope-bound tokens for an attested SVID. Every mint/use/revoke is
 * an event carrying the never-compact credential-audit retention.
 *
 * Scope is narrowed, never widened: a broker token's `(port, resource, action)`
 * must be authorized by the SVID's own `(port, resource, verbs[])` scope.
 */
export class TokenBroker {
  private readonly vault: VaultedCredential;
  readonly ttlSeconds: number;
  readonly audience: string;
  readonly events: TokenEvent[] = [];
  private readonly grants = new Map<string, ScopedTokenGrant>();
  private readonly revoked = new Set<string>();
  private seq = 0;

  constructor(options: { vault: VaultedCredential; audience: string; ttlSeconds?: number }) {
    this.vault = options.vault;
    this.audience = options.audience;
    this.ttlSeconds = options.ttlSeconds ?? TOKEN_BROKER_DEFAULT_TTL_SECONDS;
  }

  grantForDeploy(input: {
    svid: ActiveSvidRecord;
    scope: TokenScope;
    deployId: string;
    now?: string;
  }): GrantTokenResult {
    if (!svidAuthorizesScope(input.svid, input.scope)) {
      return { status: "denied", reason: "scope-not-authorized-by-svid", events: [] };
    }

    const nowIso = input.now ?? new Date().toISOString();
    const tenant = tenantOfSubject(input.svid.subject);
    const grantId = `grant-${input.deployId}-${input.svid.identityId}`;
    const expiresAt = new Date(Date.parse(nowIso) + this.ttlSeconds * 1000).toISOString();

    // Deterministic binding material commits the token to this exact SVID,
    // scope, deploy, and expiry. The vault turns it into non-invertible material.
    const binding = JSON.stringify({
      grantId,
      subject: input.svid.subject,
      identityId: input.svid.identityId,
      scope: input.scope,
      deployId: input.deployId,
      audience: this.audience,
      expiresAt,
      vaultReference: this.vault.reference,
    });

    // ponytail: S3-03 replaces this local HMAC derivation with a keyless
    // provider-STS exchange — OIDC-federate the SVID to the cloud provider's
    // token endpoint and return the provider-scoped access token. For the S2-04
    // skeleton the vault mints a deterministic fixture-scoped token instead, so
    // no long-lived provider secret is ever handled here.
    const token = `hobotok_${this.vault.deriveScopedMaterial(binding)}`;
    const tokenRef = `tokenref://broker/grant/${grantId}`;

    const grant: ScopedTokenGrant = {
      grantId,
      token,
      svidSubject: input.svid.subject,
      svidIdentityId: input.svid.identityId,
      scope: input.scope,
      deployId: input.deployId,
      audience: this.audience,
      issuedAt: nowIso,
      expiresAt,
      tokenRef,
      vaultReference: this.vault.reference,
    };
    this.grants.set(grantId, grant);

    const event = createTokenGrantedEvent({
      grantId,
      svidSubject: grant.svidSubject,
      svidIdentityId: grant.svidIdentityId,
      tokenRef,
      scope: input.scope,
      expiresAt,
      tenant,
      seq: this.nextSeq(),
      time: nowIso,
    });
    validateTokenEvent(event);
    this.events.push(event);

    return { status: "granted", grant, events: [event] };
  }

  useToken(input: { grantId: string; now?: string }): UseTokenResult {
    const grant = this.grants.get(input.grantId);
    if (!grant) {
      return { status: "denied", reason: "unknown-grant", events: [] };
    }
    if (this.revoked.has(input.grantId)) {
      return { status: "denied", reason: "grant-revoked", events: [] };
    }
    const nowIso = input.now ?? new Date().toISOString();
    if (Date.parse(nowIso) >= Date.parse(grant.expiresAt)) {
      return { status: "denied", reason: "grant-expired", events: [] };
    }

    const event = createTokenUsedEvent({
      grantId: grant.grantId,
      svidSubject: grant.svidSubject,
      tokenRef: grant.tokenRef,
      scope: grant.scope,
      tenant: tenantOfSubject(grant.svidSubject),
      seq: this.nextSeq(),
      time: nowIso,
    });
    validateTokenEvent(event);
    this.events.push(event);

    return { status: "used", grant, events: [event] };
  }

  revokeToken(input: { grantId: string; reason: string; now?: string }): RevokeTokenResult {
    const grant = this.grants.get(input.grantId);
    if (!grant) {
      return { status: "denied", reason: "unknown-grant", events: [] };
    }
    const nowIso = input.now ?? new Date().toISOString();
    this.revoked.add(input.grantId);

    const event = createTokenRevokedEvent({
      grantId: grant.grantId,
      svidSubject: grant.svidSubject,
      tokenRef: grant.tokenRef,
      reason: input.reason,
      tenant: tenantOfSubject(grant.svidSubject),
      seq: this.nextSeq(),
      time: nowIso,
    });
    validateTokenEvent(event);
    this.events.push(event);

    return { status: "revoked", events: [event] };
  }

  getGrant(grantId: string): ScopedTokenGrant | undefined {
    return this.grants.get(grantId);
  }

  getAuditEvents(): readonly TokenEvent[] {
    return [...this.events];
  }

  private nextSeq(): number {
    this.seq += 1;
    return this.seq;
  }
}

function svidAuthorizesScope(svid: ActiveSvidRecord, scope: TokenScope): boolean {
  return svid.scope.some(
    (entry) =>
      entry.port === scope.port &&
      entry.resource === scope.resource &&
      entry.verbs.includes(scope.action),
  );
}

function tenantOfSubject(subject: string): string {
  // spiffe://yard/<tenant>/agent/<name>
  return subject.split("/")[3] ?? "unknown";
}
