import {
  AUTH_PORT_RBAC_NFR,
  BUILT_IN_ROLES,
  bindPrincipalToRole,
  bindScimGroupToRole,
  createAuthPortRbacResolver,
  createAuthPortSnapshot,
  defineCustomRole,
  grantAction,
  type AuthPortRbacResolver,
  type AuthPortSnapshot,
  type ResolvedAuthPortSubject,
  type ScimGroupRevocation,
} from "../src/auth-port-rbac-resolution.mjs";

function assertAuthPortRbacTypes() {
  const releaseObserver = defineCustomRole({
    id: "custom:typed-release-observer",
    grants: [grantAction("audit", "read")],
  });

  const resolver: AuthPortRbacResolver = createAuthPortRbacResolver({
    roles: [releaseObserver],
    bindings: [
      bindScimGroupToRole({
        groupId: "scim:typed-admins",
        roleId: BUILT_IN_ROLES.ORG_ADMIN,
      }),
      bindPrincipalToRole({
        principalId: "agent:typed-operator",
        roleId: BUILT_IN_ROLES.OPERATOR_SUPERVISOR,
      }),
    ],
  });

  const snapshot: AuthPortSnapshot = createAuthPortSnapshot({
    principal: { kind: "user", id: "user:typed-admin" },
    auth: {
      adapter: "workos",
      scimGroups: ["scim:typed-admins"],
      assertedRoles: [BUILT_IN_ROLES.AUDITOR],
      snapshotSeq: "auth-snapshot:typed",
    },
  });

  const resolved: ResolvedAuthPortSubject = resolver.resolveSubject(snapshot);
  const roles: string[] = resolved.subject.roles;
  const decision = resolver.authorize(snapshot, grantAction("role", "bind")).decision;
  const bindingDecisionReason: string = resolver.canBind(snapshot, {
    targetPrincipalId: "user:target",
    roleId: BUILT_IN_ROLES.AUDITOR,
  }).decision.reason;

  resolver.clock.set(AUTH_PORT_RBAC_NFR.revocationPropagationBoundMs);
  const revocation: ScimGroupRevocation = resolver.observeScimGroupRevocation({
    principalId: snapshot.principal.id,
    groupId: "scim:typed-admins",
    roleId: BUILT_IN_ROLES.ORG_ADMIN,
    revokedAtMs: 0,
    observedAtMs: AUTH_PORT_RBAC_NFR.revocationPropagationBoundMs,
  });

  // @ts-expect-error resolved role ids are strings, not numbers.
  const invalidRoleId: number = resolved.subject.roles[0];

  // @ts-expect-error action id must be a string.
  resolver.authorize(snapshot, 42);

  void roles;
  void decision;
  void bindingDecisionReason;
  void revocation;
  void invalidRoleId;
}

void assertAuthPortRbacTypes;
