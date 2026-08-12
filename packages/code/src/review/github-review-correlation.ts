import { createHash } from "node:crypto";
import { reviewError } from "./review-errors.js";

const MARKER_RE = /<!-- hobo-code-review:v1:([0-9a-f]{64}) -->/gu;

export function githubReviewCorrelationKey(
	commandId: string,
	digest: string,
): string {
	if (commandId.length === 0 || digest.length === 0) {
		throw reviewError(
			"malformed-input",
			"correlation requires commandId and digest",
		);
	}
	return createHash("sha256")
		.update("hobo.code.review-correlation/v1\n")
		.update(commandId)
		.update("\n")
		.update(digest)
		.digest("hex");
}

export function githubReviewCorrelationMarker(input: {
	readonly commandId: string;
	readonly digest: string;
}): string {
	return `<!-- hobo-code-review:v1:${githubReviewCorrelationKey(input.commandId, input.digest)} -->`;
}

export function readGithubReviewCorrelationKey(
	body: string,
): string | undefined {
	const match = /<!-- hobo-code-review:v1:([0-9a-f]{64}) -->/u.exec(body);
	return match?.[1];
}

export function collectGithubReviewCorrelationKeys(
	body: string,
): readonly string[] {
	return [...body.matchAll(MARKER_RE)].flatMap((match) =>
		match[1] === undefined ? [] : [match[1]],
	);
}

export function redactGithubSecrets(text: string): string {
	return text
		.replace(/github_pat_[A-Za-z0-9_]+/gu, "[redacted]")
		.replace(/gh[pousr]_[A-Za-z0-9]+/gu, "[redacted]")
		.replace(/(Bearer|token)\s+[A-Za-z0-9._\-+/=]+/giu, "$1 [redacted]")
		.replace(
			/\b(GH_TOKEN|GITHUB_TOKEN|GH_ENTERPRISE_TOKEN)\s*[=:]\s*\S+/giu,
			"$1=[redacted]",
		)
		.replace(
			/\bAuthorization\s*:\s*\S+(?:\s+\S+)?/giu,
			"Authorization: [redacted]",
		);
}
