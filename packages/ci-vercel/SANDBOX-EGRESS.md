# Sandbox egress proxy

The isolated runner uses a dedicated, temporary Sandbox proxy VM for each job.
The relay starts it before the runner VM, binds it to the runner session, and
stops both VMs before settling the reservation. The exposed proxy port verifies
Vercel's signed OIDC metadata, limits traffic to configured HTTPS hostnames,
pins public IPv4 DNS results, and obtains durable, bounded quota grants from
the relay before forwarding traffic. The scoped quota credential stays in the
proxy VM and is not given to the untrusted runner. Local contracts exercise
streaming transfers above 4 MiB and the two-VM lifecycle.

On October 27, 2026, a live Sandbox test on a Pro team transferred 16 MiB in each
direction through an exposed port, including both fixed-length and chunked
uploads, with matching SHA-256 digests. A separate forwarding test observed
that the OIDC `sandbox_id`, team, project and audience matched the guest session
and forward URL. A bundled proxy accepted the bound guest through signature
verification to quota enforcement and rejected a different Sandbox and a forged
token. A subsequent live test used the bundled proxy and an authenticated test
quota service to fetch GitHub's `robots.txt` from an isolated guest. The 14,540
byte response matched a direct upstream fetch by SHA-256, the quota service
recorded a grant, and the guest could not reach an unlisted domain. That test
did not use the production PostgreSQL quota service. A later live test ran the
actual `PostgresCiStore` and quota handler against a disposable PostgreSQL in
the proxy Sandbox. A separate guest fetched the same 14,540-byte file through
the signed bundled proxy; the digest matched and PostgreSQL recorded a 65,536
byte reservation and one authenticated quota call. Both Sandboxes stopped.
The database, GitHub App and runner registration in that test were disposable
or simulated; it did not exercise the deployed Neon database or a workflow job.
These tests do not establish the gateway's maximum transfer size or verify the
complete isolation path. Identity mismatches fail closed. This path is disabled
by default; readiness also requires successful runtime and worker health checks.
The older Function-hosted `createSandboxEgressProxy` has a 4 MiB request and
response limit; it cannot handle larger workflow transfers.

The quota measures application traffic and does not guarantee an exact bill or
hard spend cap. In particular, traffic to the publicly exposed port can be
billed before authentication; TLS, DNS, retries and platform metering can add
costs. The reservation includes both VM lifetimes, creations, transfer and
quota-control calls using configured rate evidence and network headroom, but
headroom is an estimate. The provider CPU metric's aggregation is unverified,
so settlement conservatively charges provisioned vCPUs for VM duration.

The proxy permits allowlisted HTTPS hosts and public IPv4 destinations. Its only
wildcard patterns are `*.actions.githubusercontent.com` and
`*.blob.core.windows.net`, which must be explicitly configured; neither pattern
matches the parent domain. The Azure Blob wildcard includes accounts outside
GitHub, so enabling it allows jobs to send data to any publicly reachable Azure
Blob account under that suffix. Configure it only when that egress is acceptable.
A live Sandbox test verified forwarding of a GitHub
Actions subdomain and denial of the parent, a suffix-confusion host and a direct
IP. A second test sent an Actions subdomain request through the bundled proxy,
validated its signed Sandbox identity and temporary quota grant, and matched the
upstream response hash. Both sessions were stopped. The live test exercised a
download; fixed-length uploads were checked with local contracts. The proxy
rejects private and special-use addresses, arbitrary ports, raw TCP/UDP,
WebSockets and IPv6-only hosts. Redirect targets must independently satisfy
the network policy. Workflows requiring unsupported protocols or hosts cannot
run through it.

The pinned GitHub runner archive is about 218 MiB. The relay buffers and hashes
it before upload, and the SDK also buffers a compressed transfer. The quote
must include Function memory, CPU and transfer costs. If assignment or JIT
registration outcome cannot be proven, the controller stops known VMs but
holds the reservation for investigation instead of assuming zero usage or an
idle runner.

The Ubuntu 26.04 Sandbox image does not include ICU, which the GitHub runner's
.NET runtime requires. The relay also downloads the fixed 11,456,466-byte
Ubuntu `libicu78` 78.2-2ubuntu1 package from `snapshot.ubuntu.com`, verifies its
pinned SHA-256 and size, and uploads it to the guest. The guest checks the hash
again and installs the package noninteractively before runner registration.
The package's `/usr/share/doc/libicu78/copyright` contains the ICU MIT license
and Debian packaging notices. The relay needs HTTPS access to the Ubuntu
snapshot host; the guest does not need that host in its egress allowlist. The
quote must include this additional package transfer and installation time.

A live, nonpersistent Vercel Sandbox verified the pinned runner 2.338.2 archive
digest and its native library dependencies, and `Runner.Listener --version`
returned `2.338.2`. Its default user was `vercel-sandbox` and `/home/ubuntu`
was absent, so preparation creates a private home in the guest and startup
uses the current account name. A second live nonpersistent Sandbox verified
the private home's permissions and writability and the current `USER` value.
This does not verify GitHub JIT registration or execution of an actual workflow
job.
