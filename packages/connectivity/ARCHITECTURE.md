# @hobo/connectivity — Architecture

## Goals

- One hierarchical, **DNS-valid** naming function for local + overlay + public.
- Soft multi-tenancy (tenant IDs + PolicyEngine) as the default isolation model.
- Metering hooks on lifecycle paths so billing is an aggregator, not a rewrite.
- Graceful local DevX: portless optional; offline port-based path unchanged.

## Binding modes

```mermaid
flowchart TB
  subgraph Naming["HoBo naming (pure)"]
    N[getNamedEndpoint / sanitizeDnsLabel]
  end

  subgraph Local["Local binding mode"]
    D[hobo dev]
    Y[serveBindleOnLocalYard / multi-host serve]
    P[portless? optional]
    S[Real Node / Wasm servers]
    D --> Y --> S
    Y --> N
    Y -.->|if present| P
    P -->|HTTPS front| S
  end

  subgraph Overlay["Cross-cloud overlay mode"]
    O[OverlayNetwork port]
    TS[Tailscale primary]
    NB[Netbird alternative]
    J[Junction agent]
    B[Broker]
    L[Dev laptop]
    O --> TS
    O --> NB
    J --> O
    B --> O
    L --> O
    J --> N
  end

  Naming --> Local
  Naming --> Overlay
```

## Pluggable DNS

```mermaid
flowchart LR
  CFG["dns.public.managedBy"]
  CFG -->|hobo| M[PublicDnsManager.reconcile]
  CFG -->|cloud-provider / none| SUG[suggest only]
  M --> PROV[DnsProvider]
  PROV --> MEM[memory]
  PROV --> DC[dnscontrol plan export]
  PROV --> CF[cloudflare / route53 / …]
  M -->|CNAME to gateway only| GW[Funnel / CF Tunnel / exit node]
  M --> MET[MeteringBus]
  SUG --> MET
```

**Rule:** public records never target raw overlay IPs.

## Multi-tenant, policy, metering

```mermaid
flowchart TB
  T[Tenant / TenantScoped resources]
  PE[PolicyEngine]
  ACL[tag-acl engine v1]
  FUT[Future: OPA/Rego / ABAC]
  PE --> ACL
  PE -.-> FUT

  LIFE[Lifecycle: junction.join / overlay.join / name / DNS]
  LIFE --> PE
  LIFE --> MB[MeteringBus]
  MB --> MEMS[In-memory sink]
  MB --> LOG[Log sink]
  MB -.-> BILL[Future billing aggregator]

  T --> LIFE
```

### How full SaaS builds on this

| Concern | Foundation today | Next phase |
|---------|------------------|------------|
| Tenants | `Tenant`, `TenantId`, `tenantContextFromEnv` | Org membership, invites, SSO |
| Isolation | Soft **and** hard (`TenantIsolationRegistry`: dedicated overlay + control-plane partitions) | Multi-process shard routing / separate clusters |
| Policy | Tag ACL + OPA HTTP/CLI + **rego-lite** JSON documents | Per-tenant OPA bundle distribution |
| Billing | Aggregator + **durable ledger** + Stripe PaymentIntent REST | Tax, dunning, hosted checkout UX |
| DNS | Cloudflare + Route53 (**SigV4**), Tailscale **API** MagicDNS, Netbird management DNS, heartbeat dynamic DNS | Multi-region failover automation |
| Credentials | Real **ES256 DPoP** + audience-bound **JWT-SVID** | SPIRE Workload API fetch drop-in |

```mermaid
flowchart LR
  HB[Junction heartbeat]
  FN[Funnel / reverse proxy]
  GW["*.ts.net gateway"]
  DNS[PublicDnsManager]
  CF[Cloudflare]
  R53[Route53]
  HB --> FN --> GW --> DNS
  DNS --> CF
  DNS --> R53
  HB --> MET[MeteringBus]
  MET --> BILL[BillingAggregator]
```

## Package layout

- Ports live in `@hobo/core` (`naming`, `tenant`, `policy-engine`, `metering`, `dns`, `overlay`, extended `BindingSource`).
- Implementations live here so adapters and the composition root (`@hobo/hobo`) stay free of hard Tailscale/DNS SDK deps.
- Local serve paths call `attachNamedEndpoints` and expose results on `BareMetalServeResult` / `DevServeResult`.
