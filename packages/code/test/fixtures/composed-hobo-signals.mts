// Loads @hobo/hobo's composition through hobo-code's sibling-path loader, in a
// fresh process, step by step, and prints how many listeners each ending
// signal had gained after each load:
//   node --import tsx composed-hobo-signals.mts <ask|from=<dir>|load>...
// `ask` asks for removal on a signal, as the hobo-code entry point does;
// `load` loads the composition, as each /hobo verb does, from the @hobo/hobo
// found from <dir> once a `from=<dir>` came before it. A library caller never
// asks.
import {
	loadCreateComposedHoboCli,
	removeComposedDirsOnSignals,
} from "../../src/composed-hobo.ts";

const signals = ["SIGTERM", "SIGHUP", "SIGINT", "SIGQUIT"] as const;
const before = signals.map((signal) => process.listenerCount(signal));
const gained: number[][] = [];
let from: string | undefined;
for (const step of process.argv.slice(2)) {
	if (step === "ask") removeComposedDirsOnSignals();
	else if (step.startsWith("from=")) from = step.slice("from=".length);
	else if (step === "load") {
		await loadCreateComposedHoboCli(from);
		gained.push(
			signals.map(
				(signal, at) => process.listenerCount(signal) - (before[at] ?? 0),
			),
		);
	} else throw new Error(`unknown step: ${step}`);
}
process.stdout.write(`${JSON.stringify(gained)}\n`);
process.exit(0);
