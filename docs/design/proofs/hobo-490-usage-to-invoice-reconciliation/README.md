# HOBO-490 Usage-To-Invoice Reconciliation Proof

HOBO-490 is proven by the focused M1 contract at
[`src/draft/usage-to-invoice-reconciliation-contract`](../../../../src/draft/usage-to-invoice-reconciliation-contract/README.md)
and the durable design record at
[`usage-to-invoice-reconciliation.md`](../../usage-to-invoice-reconciliation.md).

## Acceptance Evidence

- Usage events map to invoice line items with source refs, quantities, units,
  amounts, periods, redacted customer summaries, and audit refs.
- Corrections, late events, replay/idempotency, duplicate suppression, disputed
  usage, and support-visible audit records are first-class mappings.
- Deterministic fixtures cover normal usage, late usage, duplicate usage, refund
  or credit correction, and disputed usage.
- Customer-visible usage details are redacted while support audit lineage remains
  replayable.

## Negative Coverage

- Validation rejects live payment provider and production finance integration
  implementation claims.
- Validation requires customer-visible privacy constraints.
- Validation rejects proofless mapping rows.

## Verification

```powershell
npm.cmd --prefix src\draft\usage-to-invoice-reconciliation-contract test
```
