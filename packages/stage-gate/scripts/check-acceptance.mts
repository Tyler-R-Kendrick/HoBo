// The release gate's check entry (ADR-0172): run one ai-bdd step, or all three,
// against HOBO_AI_BDD_PROJECT with HOBO_AI_BDD_CMD, print ai-bdd's own output to
// stderr and one JSON evidence line last on stdout (the stage-gate runner keeps
// that line), and exit 0 passed, ai-bdd's failing code, 1 a refused report,
// 2 configuration, or 3 not run.
//
//   node --import tsx packages/stage-gate/scripts/check-acceptance.mts [plans-fresh|replay|evidence-intact|all]
import { checkAcceptance } from "../src/acceptance-check.ts";

const result = checkAcceptance(
	process.argv.slice(2),
	process.env,
	process.cwd(),
);
if (result.transcript !== "") process.stderr.write(result.transcript);
process.stdout.write(`${JSON.stringify(result.evidence)}\n`);
process.exitCode = result.exitCode;
