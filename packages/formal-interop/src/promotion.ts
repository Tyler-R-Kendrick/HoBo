import { beqOpenUi } from "./beq.js";
import { replayFormalCertificate } from "./certificate.js";
import type {
	OpenUiPromotionDecision,
	OpenUiPromotionInput,
} from "./types.js";

/**
 * Fail-closed OpenUI promotion hook.
 * Semantic BEq is default-on for artifactKind === "openui".
 * Missing certificate / formal package / untyped claims refuse when required.
 */
export function evaluateOpenUiPromotion(
	input: OpenUiPromotionInput,
): OpenUiPromotionDecision {
	const failures: string[] = [];
	const semanticOn =
		input.semanticGateEnabled ?? input.artifactKind === "openui";

	if (input.conformance === false) {
		failures.push("conformance: hard contract not green");
	}
	if (input.policy === false) {
		failures.push("policy: promotion not allowed");
	}

	let beq: ReturnType<typeof beqOpenUi> | undefined;
	if (input.artifactKind === "openui" && semanticOn) {
		if (!input.generated || !input.goldOrIntent) {
			failures.push(
				"semantic: missing generated or gold/intent tree (fail closed)",
			);
		} else {
			beq = beqOpenUi(input.generated, input.goldOrIntent);
			if (!beq.ok) {
				failures.push(
					`semantic: BEq failed (${beq.failures.map((f) => f.reason).join("; ")})`,
				);
			}
		}
	}

	// Formal preflight: when a certificate is supplied, it must replay.
	if (input.certificate !== undefined && input.certificate !== null) {
		const replay = replayFormalCertificate(input.certificate);
		if (!replay.ok) {
			failures.push(`certificate: ${replay.code ?? "replay failed"}`);
		}
	}

	// Missing formal package when candidate claims formal provenance.
	if (input.formalPackagePresent === false) {
		failures.push("formal-package: missing controlled formal package");
	}

	const base = {
		ok: failures.length === 0,
		candidateId: input.candidateId,
		failures: Object.freeze(failures) as readonly string[],
	};
	return Object.freeze(
		beq === undefined ? base : { ...base, beq },
	);
}
