# shoo.dev → HoBo parity & mapping tracker

> How shoo's ideas map onto HoBo's identity/auth model. ✅ = HoBo has an equivalent · ➕ = HoBo goes further · n/a = out of HoBo's scope. HoBo design lives in [`../../docs/design/`](../../docs/design/README.md). shoo is *adjacent* to HoBo (an end-user auth broker), not a head-on competitor — the interesting overlap is the identity/token model.

| shoo.dev | HoBo equivalent | Status | HoBo doc |
|---|---|---|---|
| Auth broker (intent: "sign-in with ~zero config") | HoBo's identity model is for **workloads + agents**, not human Google sign-in — but the "keyless, zero-config credential" goal is shared | ➕ | [06](../../docs/design/ai-native-agent-auth.md#plan-06) |
| ES256 `id_token` + JWKS verification | HoBo principals carry **SVIDs**/OIDC tokens verified the same standards-based way; brokered, short-lived | ➕ | [06](../../docs/design/ai-native-agent-auth.md#plan-06), [12](../../docs/design/security-networking.md#plan-12) |
| OIDC discovery (`/.well-known/openid-configuration`, JWKS) | HoBo issues/consumes OIDC; agents are first-class **OIDC principals** | ✅ | [06](../../docs/design/ai-native-agent-auth.md#plan-06) |
| Domain-scoped `pairwise_sub` (no cross-site tracking) | Tenant/audience-scoped identities; least-privilege, per-scope tokens | ✅ | [12](../../docs/design/security-networking.md#plan-12) |
| Mandatory PKCE (S256) | HoBo's agent OAuth/token brokering uses PKCE + audience-scoping | ✅ | [06](../../docs/design/ai-native-agent-auth.md#plan-06) |
| Mandatory server-side verification (browser untrusted) | HoBo's invariant: the control plane never trusts client claims; everything is verified + event-logged | ➕ | [12](../../docs/design/security-networking.md#plan-12), [11](../../docs/design/event-model.md#plan-11) |
| `customJwt`/JWKS integration into a backend (Convex) | A HoBo app could trust shoo (or any OIDC issuer) for **end-user** auth via the `secrets`/identity ports — orthogonal to HoBo's **workload** identity | ✅ | [21](../../docs/design/authoring-resources-wiring.md#plan-21), [06](../../docs/design/ai-native-agent-auth.md#plan-06) |

## How they relate (not competitors)
shoo answers **"how do end users sign in"** (human → Google). HoBo answers **"how do workloads and AI agents prove identity and get scoped credentials to clouds"** (machine → infra). They compose: a HoBo-deployed app could use shoo for its end-user login while HoBo handles the workload/agent identity + secret brokering underneath. shoo's design choices HoBo already shares — standards-based tokens (not proprietary SDKs), JWKS verification, PKCE, audience-scoping, mandatory server verification — are good corroboration of HoBo's [Plan 6](../../docs/design/ai-native-agent-auth.md#plan-06)/[Plan 12](../../docs/design/security-networking.md#plan-12) choices, extended to agents-as-principals and event-sourced auditing.

## Where HoBo deliberately differs
- **Subject is machines/agents**, not humans — HoBo's identity exists to let workloads/agents self-provision cloud credentials with zero developer involvement.
- **Event-sourced, auditable** — every credential issuance/use is an event ([Plan 11](../../docs/design/event-model.md#plan-11)); shoo is a stateless token broker.
- **Self-hostable, multi-provider** — HoBo identity isn't tied to one IdP or a single SaaS.
