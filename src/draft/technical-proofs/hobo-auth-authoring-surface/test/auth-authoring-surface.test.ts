import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  auth,
  buildAuthManifestEntry,
  emitAuthConsumerContract,
  evaluateAuthCanDeploy,
  generateAuthSurfaceDeclaration,
} from "../src/auth-authoring-surface.js";
import { generateDevPrincipalFixture } from "../../hobo-auth-consumer-contract/src/auth-consumer-contract.js";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function declareAppAuth(overrides = {}) {
  return auth({
    providers: [
      auth.oidc({
        id: "google",
        issuer: "https://accounts.google.com",
      }),
      auth.customJwt({
        id: "shoo",
        issuer: "https://shoo.example",
        jwks: "https://shoo.example/.well-known/jwks.json",
        alg: "ES256",
      }),
      auth.builtin(),
    ],
    subject: {
      idClaim: "sub",
      claims: {
        sub: { type: "string" },
        email: { type: "string" },
        tenant: { type: "string" },
        plan: { enum: ["free", "pro"] },
      },
      roles: ["customer"],
      scopes: ["orders:read"],
      tenancy: {
        platformTenant: "platform-acme",
        appTenantClaim: "tenant",
        defaultAppTenant: "app-acme",
      },
    },
    sessionOverrides: {
      roles: ["customer", "support"],
      tenants: ["app-acme", "app-beta"],
      claims: {
        plan: ["free", "pro"],
      },
    },
    grantedCapabilities: [
      {
        port: "hobo:data",
        resource: "orders",
        actions: ["read"],
      },
    ],
    ...overrides,
  });
}

describe("hobo:auth authoring surface", () => {
  it("lowers oidc, customJwt, and builtin providers into a secret-free manifest auth entry", () => {
    const declaration = declareAppAuth();
    const manifestEntry = buildAuthManifestEntry(declaration);

    assert.equal(manifestEntry.type, "auth.v1");
    assert.equal(manifestEntry.port, "hobo:auth");
    assert.deepEqual(
      manifestEntry.providers.map((provider) => provider.id),
      ["google", "shoo", "builtin"],
    );
    assert.deepEqual(manifestEntry.providers[0].verification, {
      issuer: "https://accounts.google.com",
      jwks: "https://accounts.google.com/.well-known/jwks.json",
      alg: "RS256",
    });
    assert.deepEqual(manifestEntry.providers[1].verification, {
      issuer: "https://shoo.example",
      jwks: "https://shoo.example/.well-known/jwks.json",
      alg: "ES256",
    });
    assert.deepEqual(manifestEntry.providers[2], {
      id: "builtin",
      kind: "builtin",
      environment: ["air-gap", "dev"],
      productionEligible: false,
      verification: {
        issuer: "urn:hobo:dev-builtin",
        jwks: "urn:hobo:dev-builtin:jwks",
        alg: "HOBO-BUILTIN-FIXTURE",
      },
    });
    assert.doesNotMatch(JSON.stringify(manifestEntry), /secret|password|token/i);
  });

  it("emits the consumer-driven auth contract used by can-deploy and dev fixtures", () => {
    const declaration = declareAppAuth();
    const contract = emitAuthConsumerContract(declaration, {
      fixtureIdpSuite: "fixture-idp-jwks-can-deploy",
    });
    const fixture = generateDevPrincipalFixture(contract, {
      roles: ["support"],
      tenant: "app-beta",
      claims: {
        plan: "pro",
      },
    });

    assert.equal(contract.port, "hobo:auth");
    assert.equal(contract.subject.kind, "user");
    assert.equal(contract.subject.tenancy.appTenantClaim, "tenant");
    assert.equal(fixture.ctxUser.tenant.app, "app-beta");
    assert.equal(fixture.ctxUser.claims.plan, "pro");
    assert.equal(contract.verificationBoundary.requiredGate, "fixture-idp-jwks-can-deploy");
  });

  it("generates typed client and server auth surface declarations", () => {
    const declaration = generateAuthSurfaceDeclaration(declareAppAuth(), {
      interfaceName: "ShopAuthSurface",
    });

    assert.match(declaration, /type AuthProviderId = "google" \| "shoo" \| "builtin";/);
    assert.match(declaration, /useAuth\(\): AuthState/);
    assert.match(declaration, /signIn\(provider: AuthProviderId\): Promise<void>/);
    assert.match(declaration, /signOut\(\): Promise<void>/);
    assert.match(declaration, /readonly user: PrincipalRef/);
    assert.match(declaration, /readonly tenant: AppTenantContext/);
  });

  it("rejects unsafe customJwt declarations and builtin-only production deploys", () => {
    assert.throws(
      () =>
        auth.customJwt({
          id: "unsafe",
          issuer: "https://issuer.example",
          jwks: "https://issuer.example/jwks.json",
          alg: "none",
        }),
      /alg:none/i,
    );
    assert.throws(
      () =>
        auth.customJwt({
          id: "missing-jwks",
          issuer: "https://issuer.example",
          alg: "RS256",
        }),
      /jwks/i,
    );

    const builtinOnly = auth({
      providers: [auth.builtin()],
      subject: declareAppAuth().subject,
      grantedCapabilities: [],
    });

    assert.deepEqual(evaluateAuthCanDeploy(builtinOnly, { target: "dev" }), {
      ok: true,
      target: "dev",
      reason: "dev-or-air-gap-builtin-provider",
    });
    assert.deepEqual(evaluateAuthCanDeploy(builtinOnly, { target: "production" }), {
      ok: false,
      target: "production",
      reason: "builtin-auth-provider-is-not-production-eligible",
    });
  });

  it("marks unresolved tenancy as fail-closed for downstream tenant enforcement", () => {
    const manifestEntry = buildAuthManifestEntry(declareAppAuth());

    assert.deepEqual(manifestEntry.tenancy, {
      claim: "tenant",
      defaultTenant: "app-acme",
      unresolved: "fail-closed",
      enforcementMarker: "ctx.tenant.required",
    });
  });

  it("type declarations narrow providers and carry ctx.user claims", () => {
    const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
    const command = process.platform === "win32" ? process.env.ComSpec ?? "cmd.exe" : npmCommand;
    const args = [
      "exec",
      "--yes",
      "--package",
      "typescript@5.5.4",
      "--",
      "tsc",
      "--noEmit",
      "--project",
      "tsconfig.types.json",
    ];
    const result = spawnSync(
      command,
      process.platform === "win32" ? ["/d", "/c", npmCommand, ...args] : args,
      {
        cwd: packageRoot,
        encoding: "utf8",
        shell: false,
      },
    );

    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  });
});
