# @hobo/stations contracts

PACT consumer evidence for the Station control-plane occupancy boundary.
The Station local store / Conductor client is the provider under test.
`test/traffic-routing-contract.test.ts` validates the Pact identity/request envelope
and executes its bodies against the in-process synthesis boundary; it does not claim
that `@hobo/stations` hosts an HTTP server.
