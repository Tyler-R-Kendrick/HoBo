import type { ReviewSnapshot } from "../_generated/code_review_pb.js";
import { ReviewCoverageState, ReviewLifecycle } from "../_generated/code_review_pb.js";

export function renderReviewPane(snapshot: ReviewSnapshot, width = 80): string {
	const files = snapshot.manifest?.files ?? [];
	const reviewed = snapshot.coverage.filter((item) => item.state === ReviewCoverageState.REVIEWED).length;
	const stale = snapshot.coverage.filter((item) => item.state === ReviewCoverageState.STALE).length;
	const title = `hobo-code review ${snapshot.reviewId.slice(0, 8)} · gen ${snapshot.generations.length} · ${snapshot.lifecycle === ReviewLifecycle.CLOSED ? "closed" : "open"}`;
	const progress = `reviewed ${reviewed} · stale ${stale} · files ${files.length} · threads ${snapshot.threads.length}`;
	const rows = files.slice(0, 16).map((file) => {
		const mark = snapshot.coverage.some(
			(item) => item.unit?.fileId === file.fileId && item.state === ReviewCoverageState.REVIEWED,
		)
			? "✓"
			: snapshot.coverage.some(
						(item) => item.unit?.fileId === file.fileId && item.state === ReviewCoverageState.STALE,
				  )
				? "!"
				: "·";
		const path = (file.pathAfter || file.pathBefore).slice(0, Math.max(12, width - 16));
		return ` ${mark} ${path}  +${file.additions}/-${file.deletions}`;
	});
	return [title, progress, ...rows].join("\n");
}
