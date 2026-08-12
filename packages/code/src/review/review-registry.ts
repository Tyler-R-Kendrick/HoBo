import {
	createResidentReviewRuntime,
	type ResidentReviewRuntime,
	type ResidentReviewRuntimeOptions,
} from "./resident-review-runtime.js";
import type { ReviewRuntime, ReviewSnapshot } from "./review-ports.js";

export interface ReviewRegistry {
	readonly runtime: ReviewRuntime;
	load(reviewId: string): Promise<ReviewSnapshot>;
	list(input?: {
		readonly sessionId?: string;
	}): Promise<readonly ReviewSnapshot[]>;
	close(): void;
}

export function createReviewRegistry(
	options:
		| ResidentReviewRuntimeOptions
		| { readonly runtime: ResidentReviewRuntime },
): ReviewRegistry {
	const runtime =
		"runtime" in options
			? options.runtime
			: createResidentReviewRuntime(options);
	return {
		runtime,
		load: (reviewId) => runtime.load(reviewId),
		list: (input) => runtime.list(input),
		close: () => {
			if ("close" in runtime) runtime.close();
		},
	};
}
