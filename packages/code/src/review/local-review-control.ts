import { join } from "node:path";
import {
	createResidentReviewRuntime,
	type ResidentReviewRuntime,
	type ReviewView,
} from "./resident-review-runtime.js";
import { parseReviewCommand } from "./review-contract.js";
import type {
	ReviewCommandResult,
	ReviewContentStore,
	ReviewDiffSource,
	ReviewReanchorEngine,
	ReviewSnapshot,
} from "./review-ports.js";

export interface LocalReviewControlOptions {
	readonly hoboHome: string;
	readonly now?: () => string;
	readonly id?: () => string;
	readonly contentStore?: ReviewContentStore;
	readonly diffSource?: ReviewDiffSource;
	readonly reanchor?: ReviewReanchorEngine;
	readonly inlineLimit?: number;
}

export interface LocalReviewControl {
	readonly runtime: ResidentReviewRuntime;
	execute(command: unknown): Promise<ReviewCommandResult>;
	load(reviewId: string): Promise<ReviewSnapshot>;
	loadView(reviewId: string): Promise<ReviewView>;
	list(input?: {
		readonly sessionId?: string;
	}): Promise<readonly ReviewSnapshot[]>;
	close(): void;
}

export function reviewControlDataDir(hoboHome: string): string {
	return join(hoboHome, "durable", "code", "reviews");
}

export function createLocalReviewControl(
	options: LocalReviewControlOptions,
): LocalReviewControl {
	const runtime = createResidentReviewRuntime({
		dataDir: reviewControlDataDir(options.hoboHome),
		...(options.now ? { now: options.now } : {}),
		...(options.id ? { id: options.id } : {}),
		...(options.contentStore ? { contentStore: options.contentStore } : {}),
		...(options.diffSource ? { diffSource: options.diffSource } : {}),
		...(options.reanchor ? { reanchor: options.reanchor } : {}),
		...(options.inlineLimit === undefined
			? {}
			: { inlineLimit: options.inlineLimit }),
	});
	return {
		runtime,
		execute(command) {
			return runtime.execute(parseReviewCommand(command));
		},
		load: (reviewId) => runtime.load(reviewId),
		loadView: (reviewId) => runtime.loadView(reviewId),
		list: (input) => runtime.list(input),
		close: () => runtime.close(),
	};
}
