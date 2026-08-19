// Parse, don't validate: untrusted review JSON becomes parsed derived types
// (generated ReviewCommandEnvelope / ReviewSnapshot). Review commands are
// commands; review events are events. ReviewRuntime is the actor. Durable
// event-store partition hobo-code-reviews; snapshots and inbox projections
// are the materialized view / read store.

import { fromJson, type JsonValue, toJson } from "@bufbuild/protobuf";

import {
	type ReviewCommandEnvelope,
	ReviewCommandEnvelopeSchema,
	ReviewLifecycle,
	type ReviewSnapshot,
	ReviewSnapshotSchema,
	ReviewTargetKind,
} from "../_generated/code_review_pb.js";
import { REVIEW_ERROR, ReviewError } from "./review-errors.js";

// public-contract: clients pin the review command envelope version.
export const REVIEW_COMMAND_SCHEMA = "hobo.code.review-command/v1" as const;
// public-contract: every client reads the same durable review snapshot version.
export const REVIEW_SNAPSHOT_SCHEMA = "hobo.code.review-snapshot/v1" as const;

const MAX_BODY = 64 * 1024;
const MAX_MESSAGES = 2_000;

function required(value: string, field: string): void {
	if (!value) {
		throw new ReviewError(REVIEW_ERROR.MALFORMED, `${field} must not be empty`);
	}
}

export function parseReviewCommand(input: unknown): ReviewCommandEnvelope {
	if (input === null || typeof input !== "object") {
		throw new ReviewError(
			REVIEW_ERROR.MALFORMED,
			"review command must be an object",
		);
	}
	const envelope = fromJson(ReviewCommandEnvelopeSchema, input as JsonValue, {
		ignoreUnknownFields: false,
	});
	if (
		envelope.schemaVersion &&
		envelope.schemaVersion !== REVIEW_COMMAND_SCHEMA
	) {
		throw new ReviewError(
			REVIEW_ERROR.MALFORMED,
			`unsupported review command schema ${envelope.schemaVersion}`,
		);
	}
	required(envelope.commandId, "commandId");
	required(envelope.actorId, "actorId");
	required(envelope.reviewId, "reviewId");
	if (!envelope.command.case) {
		throw new ReviewError(REVIEW_ERROR.MALFORMED, "review command is required");
	}
	const command = envelope.command;
	if (command.case === "startReview") {
		if (command.value.target?.kind === ReviewTargetKind.UNSPECIFIED) {
			throw new ReviewError(REVIEW_ERROR.MALFORMED, "startReview.target.kind");
		}
		required(
			command.value.target?.repositoryId ?? "",
			"startReview.target.repositoryId",
		);
	}
	if (command.case === "createReviewThread") {
		if (command.value.body.length > MAX_BODY) {
			throw new ReviewError(REVIEW_ERROR.LIMIT, "thread body exceeds 64KiB");
		}
		required(command.value.body, "createReviewThread.body");
	}
	if (command.case === "addReviewMessage") {
		required(command.value.threadId, "addReviewMessage.threadId");
		required(command.value.body, "addReviewMessage.body");
	}
	if (command.case === "publishReviewSubmission") {
		required(
			command.value.pendingReviewId,
			"publishReviewSubmission.pendingReviewId",
		);
	}
	return envelope;
}

export function parseReviewSnapshot(input: unknown): ReviewSnapshot {
	if (input === null || typeof input !== "object") {
		throw new ReviewError(
			REVIEW_ERROR.CORRUPT,
			"review snapshot must be an object",
		);
	}
	const snapshot = fromJson(ReviewSnapshotSchema, input as JsonValue, {
		ignoreUnknownFields: false,
	});
	if (
		snapshot.schemaVersion &&
		snapshot.schemaVersion !== REVIEW_SNAPSHOT_SCHEMA
	) {
		throw new ReviewError(
			REVIEW_ERROR.CORRUPT,
			`unsupported review snapshot schema ${snapshot.schemaVersion}`,
		);
	}
	required(snapshot.reviewId, "reviewId");
	if (snapshot.messages.length > MAX_MESSAGES) {
		throw new ReviewError(REVIEW_ERROR.LIMIT, "review message cap exceeded");
	}
	if (
		snapshot.lifecycle !== ReviewLifecycle.UNSPECIFIED &&
		snapshot.lifecycle !== ReviewLifecycle.OPEN &&
		snapshot.lifecycle !== ReviewLifecycle.CLOSED
	) {
		throw new ReviewError(REVIEW_ERROR.CORRUPT, "unknown review lifecycle");
	}
	return snapshot;
}

export function reviewSnapshotJson(snapshot: ReviewSnapshot): JsonValue {
	return toJson(ReviewSnapshotSchema, snapshot);
}

export function reviewCommandJson(command: ReviewCommandEnvelope): JsonValue {
	return toJson(ReviewCommandEnvelopeSchema, command);
}
