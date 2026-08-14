package review

#ReviewTargetKind: "REVIEW_TARGET_KIND_UNSPECIFIED" | "REVIEW_TARGET_KIND_WORKING_TREE" | "REVIEW_TARGET_KIND_INDEX" | "REVIEW_TARGET_KIND_COMMIT" | "REVIEW_TARGET_KIND_RANGE" | "REVIEW_TARGET_KIND_PULL_REQUEST" | "REVIEW_TARGET_KIND_STACK"
#ReviewFileStatus: "REVIEW_FILE_STATUS_UNSPECIFIED" | "REVIEW_FILE_STATUS_ADDED" | "REVIEW_FILE_STATUS_MODIFIED" | "REVIEW_FILE_STATUS_DELETED" | "REVIEW_FILE_STATUS_RENAMED" | "REVIEW_FILE_STATUS_COPIED" | "REVIEW_FILE_STATUS_TYPE_CHANGED" | "REVIEW_FILE_STATUS_UNMERGED" | "REVIEW_FILE_STATUS_SUBMODULE" | "REVIEW_FILE_STATUS_BINARY"
#ReviewLineKind: "REVIEW_LINE_KIND_UNSPECIFIED" | "REVIEW_LINE_KIND_CONTEXT" | "REVIEW_LINE_KIND_ADDITION" | "REVIEW_LINE_KIND_DELETION" | "REVIEW_LINE_KIND_NO_NEWLINE"
#ReviewAnchorSide: "REVIEW_ANCHOR_SIDE_UNSPECIFIED" | "REVIEW_ANCHOR_SIDE_OLD" | "REVIEW_ANCHOR_SIDE_NEW" | "REVIEW_ANCHOR_SIDE_FILE"
#ReviewCoverageState: "REVIEW_COVERAGE_STATE_UNSPECIFIED" | "REVIEW_COVERAGE_STATE_REVIEWED" | "REVIEW_COVERAGE_STATE_STALE" | "REVIEW_COVERAGE_STATE_EXCLUDED"
#ReviewActorKind: "REVIEW_ACTOR_KIND_UNSPECIFIED" | "REVIEW_ACTOR_KIND_HUMAN" | "REVIEW_ACTOR_KIND_AGENT" | "REVIEW_ACTOR_KIND_SYSTEM" | "REVIEW_ACTOR_KIND_PROVIDER_USER"
#ReviewThreadOrigin: "REVIEW_THREAD_ORIGIN_UNSPECIFIED" | "REVIEW_THREAD_ORIGIN_LOCAL_HUMAN" | "REVIEW_THREAD_ORIGIN_LOCAL_AGENT" | "REVIEW_THREAD_ORIGIN_GITHUB" | "REVIEW_THREAD_ORIGIN_SYSTEM"
#ReviewVisibility: "REVIEW_VISIBILITY_UNSPECIFIED" | "REVIEW_VISIBILITY_PRIVATE" | "REVIEW_VISIBILITY_SESSION" | "REVIEW_VISIBILITY_FORGE"
#ReviewThreadResolution: "REVIEW_THREAD_RESOLUTION_UNSPECIFIED" | "REVIEW_THREAD_RESOLUTION_OPEN" | "REVIEW_THREAD_RESOLUTION_RESOLVED"
#ReviewAnchorHealth: "REVIEW_ANCHOR_HEALTH_UNSPECIFIED" | "REVIEW_ANCHOR_HEALTH_CURRENT" | "REVIEW_ANCHOR_HEALTH_REANCHORED" | "REVIEW_ANCHOR_HEALTH_STALE" | "REVIEW_ANCHOR_HEALTH_AMBIGUOUS" | "REVIEW_ANCHOR_HEALTH_OUTDATED" | "REVIEW_ANCHOR_HEALTH_DELETED"
#ReviewPublicationState: "REVIEW_PUBLICATION_STATE_UNSPECIFIED" | "REVIEW_PUBLICATION_STATE_PRIVATE" | "REVIEW_PUBLICATION_STATE_SELECTED_FOR_PUBLICATION" | "REVIEW_PUBLICATION_STATE_PUBLISHED" | "REVIEW_PUBLICATION_STATE_REJECTED"
#ReviewDecision: "REVIEW_DECISION_UNSPECIFIED" | "REVIEW_DECISION_COMMENT" | "REVIEW_DECISION_APPROVE" | "REVIEW_DECISION_REQUEST_CHANGES"
#ReviewSubmissionState: "REVIEW_SUBMISSION_STATE_UNSPECIFIED" | "REVIEW_SUBMISSION_STATE_PENDING" | "REVIEW_SUBMISSION_STATE_APPLIED" | "REVIEW_SUBMISSION_STATE_AMBIGUOUS" | "REVIEW_SUBMISSION_STATE_RECONCILED" | "REVIEW_SUBMISSION_STATE_FAILED"
#ReviewInboxDisposition: "REVIEW_INBOX_DISPOSITION_UNSPECIFIED" | "REVIEW_INBOX_DISPOSITION_ACTIVE" | "REVIEW_INBOX_DISPOSITION_DEFERRED" | "REVIEW_INBOX_DISPOSITION_IGNORED"
#ReviewDerivedState: "REVIEW_DERIVED_STATE_UNSPECIFIED" | "REVIEW_DERIVED_STATE_NEEDS_REVIEW" | "REVIEW_DERIVED_STATE_IN_PROGRESS" | "REVIEW_DERIVED_STATE_AWAITING_AGENT" | "REVIEW_DERIVED_STATE_AWAITING_AUTHOR" | "REVIEW_DERIVED_STATE_CHANGED_SINCE_REVIEW" | "REVIEW_DERIVED_STATE_CONFLICTS" | "REVIEW_DERIVED_STATE_CHECKS_FAILING" | "REVIEW_DERIVED_STATE_APPROVED_BLOCKED" | "REVIEW_DERIVED_STATE_READY_TO_MERGE" | "REVIEW_DERIVED_STATE_CLOSED"
#ReviewLifecycle: "REVIEW_LIFECYCLE_UNSPECIFIED" | "REVIEW_LIFECYCLE_OPEN" | "REVIEW_LIFECYCLE_CLOSED"

#ReviewStackMemberTarget: {
	member_id:            string
	branch:               string
	commit_oid:           string
	pull_request_number?: int & >=0
}
#ReviewTarget: {
	kind:                    #ReviewTargetKind
	repository_id:           string & !=""
	repository_root?:        string
	base_commit_oid?:        string
	head_commit_oid?:        string
	index_tree_oid?:         string
	worktree_manifest_hash?: string
}
#ReviewGeneration: {
	id:            string & !=""
	review_id:     string & !=""
	ordinal:       int & >0
	manifest_hash: string & !=""
}
#ReviewFileSummary: {
	file_id: string & !=""
	status:  #ReviewFileStatus
	binary:  bool
}
#ReviewPageMetadata: {
	page_size:   int & >0
	total_files: int & >=0
}
#ReviewDiffManifest: {
	generation_id: string & !=""
	manifest_hash: string & !=""
}
#ReviewDiffLine: {
	line_id:       string & !=""
	kind:          #ReviewLineKind
	raw_text_hash: string
}
#ReviewHunk: {
	hunk_id:     string & !=""
	fingerprint: string & !=""
}
#ReviewDiffChunk: {
	generation_id: string & !=""
	file_id:       string & !=""
	chunk_id:      string & !=""
}
#ReviewAnchor: {
	anchor_id:     string & !=""
	generation_id: string & !=""
	file_id:       string & !=""
	side:          #ReviewAnchorSide
}
#ReviewCoverageUnit: {
	kind:              string & !=""
	content_identity?: string
}
#ReviewCoverageRecord: {
	coverage_id:   string & !=""
	review_id:     string & !=""
	actor_id:      string & !=""
	generation_id: string & !=""
	state:         #ReviewCoverageState
}
#ReviewProviderThreadIdentity: {
	provider: string
}
#ReviewThread: {
	thread_id:  string & !=""
	review_id:  string & !=""
	origin:     #ReviewThreadOrigin
	visibility: #ReviewVisibility
	resolution: #ReviewThreadResolution
}
#ReviewMessage: {
	message_id: string & !=""
	thread_id:  string & !=""
	author_id:  string & !=""
	body_hash:  string & !=""
}
#PreparedInlineComment: {
	message_id: string & !=""
	body_hash:  string
}
#ReviewThreadOperation: {
	thread_id: string & !=""
	operation: string & !=""
}
#PendingReview: {
	pending_review_id: string & !=""
	review_id:         string & !=""
	generation_id:     string & !=""
	decision:          #ReviewDecision
	effect_digest:     string & !=""
}
#ReviewSubmission: {
	submission_id:     string & !=""
	pending_review_id: string & !=""
	command_id:        string & !=""
	effect_digest:     string & !=""
	state:             #ReviewSubmissionState
}
#ReviewProgressSummary: {
	reviewed_files:   int & >=0
	stale_files:      int & >=0
	unreviewed_files: int & >=0
	open_threads:     int & >=0
}
#ReviewStackSummary: {
	stack_id:     string
	member_count: int & >=0
}
#ReviewInboxItem: {
	item_id:             string & !=""
	review_id:           string & !=""
	manual_disposition:  #ReviewInboxDisposition
	derived_state:       #ReviewDerivedState
}
#ReviewSnapshot: {
	schema_version: string & !=""
	review_id:      string & !=""
	revision:       int & >=0
	lifecycle:      #ReviewLifecycle
}
#StartReviewCommand: {
	session_id?: string
	label?:      string
}
#RefreshReviewCommand: {}
#MarkReviewCoverageCommand: {
	state: #ReviewCoverageState
}
#CreateReviewThreadCommand: {
	body: string & !=""
}
#AddReviewMessageCommand: {
	thread_id: string & !=""
	body:      string & !=""
}
#EditDraftReviewMessageCommand: {
	message_id: string & !=""
	body:       string & !=""
}
#DeleteDraftReviewMessageCommand: {
	message_id: string & !=""
}
#RouteReviewThreadToAgentCommand: {
	thread_id: string & !=""
	agent_id:  string & !=""
}
#ResolveReviewThreadCommand: {
	thread_id: string & !=""
}
#UnresolveReviewThreadCommand: {
	thread_id: string & !=""
}
#PrepareReviewSubmissionCommand: {
	decision: #ReviewDecision
}
#PublishReviewSubmissionCommand: {
	pending_review_id: string & !=""
}
#ApplyReviewSuggestionCommand: {
	message_id: string & !=""
}
#StageReviewSelectionCommand: {
	file_id: string & !=""
}
#UnstageReviewSelectionCommand: {
	file_id: string & !=""
}
#SetReviewInboxDispositionCommand: {
	disposition: #ReviewInboxDisposition
}
#CloseReviewCommand: {}
#ReviewCommandEnvelope: {
	schema_version: string & !=""
	command_id:     string & !=""
	actor_id:       string & !=""
	review_id:      string & !=""
}
#ReviewCommandResult: {
	accepted: bool
	code:     string
}
#ReviewEffectApproval: {
	operation:         string & !=""
	command_id:        string & !=""
	actor_id:          string & !=""
	review_id:         string & !=""
	expected_revision: int & >=0
	effect_digest:     string & !=""
}
