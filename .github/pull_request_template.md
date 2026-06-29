## Summary

-

## Documentation

- [ ] README/design/proof docs updated, or not needed because:
- [ ] If code/tooling changed, `npm run docs:freshness` passes.
- [ ] If `src/draft/*` implementation changed, `npm run architecture:guard` passes with PACT/protobuf/CUE/parse/event evidence.
- [ ] If public CLI examples changed, `npm run docs:cli-lint` passes.
- [ ] If design terms/events/ADRs changed, `npm run docs:design-lint` and traceability validation pass.

## Testing

- [ ] `npm run architecture:guard`
- [ ] `npm test`
- [ ] `npm run docs:cli-lint`
- [ ] `npm run docs:design-lint`
- [ ] `npm run docs:coverage`
- [ ] `npm run docs:freshness`
- [ ] `node --import tsx scripts/validate-traceability.ts`
- [ ] `node --import tsx scripts/validate-sdk-contracts.ts`
- [ ] `node --import tsx scripts/validate-deployment-set-delta.ts`

## Notes / limitations

-
