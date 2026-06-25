# Incident Aggregate Contract POC

Independent proof for HOBO-258: the SRE Incident aggregate and `incident.*`
lifecycle contract.

## Contract Surface

- Incident stream id: `incident:<id>`.
- Single aggregate fold: `foldIncidentStream(events)`.
- Source-signal correlation: `deriveIncidentOpenEvents(signals, existingIncidents)`.
- Event constructor: `makeIncidentEvent(type, envelope)`.

## Proven Behaviors

- Lifecycle rejects illegal transitions.
- Multiple source signals with the same `correlationId` open one Incident.
- From-zero replay rebuilds the same timeline.
- Late duplicate signals after resolution do not reopen silently.
- An ownerless Incident cannot advance past `Triaged`.

## Run

```powershell
npm.cmd --prefix src\draft\incident-aggregate-contract test
```
