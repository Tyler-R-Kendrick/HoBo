import { createHmac, timingSafeEqual } from "node:crypto";

import { REVIEW_ERROR, ReviewError } from "./review-errors.js";

export type ReviewCursorPayload = {
	readonly generationId: string;
	readonly fileId: string;
	readonly offset: number;
};

export function encodeReviewCursor(
	payload: ReviewCursorPayload,
	secret: string,
): string {
	const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
	const mac = createHmac("sha256", secret).update(body).digest("base64url");
	return `${body}.${mac}`;
}

export function decodeReviewCursor(
	cursor: string,
	secret: string,
	generationId: string,
): ReviewCursorPayload {
	const [body, mac] = cursor.split(".");
	if (!body || !mac) {
		throw new ReviewError(REVIEW_ERROR.MALFORMED, "cursor is not generation-bound");
	}
	const expected = createHmac("sha256", secret).update(body).digest("base64url");
	const left = Buffer.from(mac);
	const right = Buffer.from(expected);
	if (left.length !== right.length || !timingSafeEqual(left, right)) {
		throw new ReviewError(REVIEW_ERROR.MALFORMED, "cursor signature invalid");
	}
	const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as ReviewCursorPayload;
	if (payload.generationId !== generationId) {
		throw new ReviewError(REVIEW_ERROR.STALE_GENERATION, "cursor generation mismatch");
	}
	return payload;
}
