package code

#ReviewDecision: "REVIEW_DECISION_COMMENT" | "REVIEW_DECISION_APPROVE" | "REVIEW_DECISION_REQUEST_CHANGES"
#ReviewInboxDisposition: "REVIEW_INBOX_DISPOSITION_ACTIVE" | "REVIEW_INBOX_DISPOSITION_DEFERRED" | "REVIEW_INBOX_DISPOSITION_IGNORED"
#ReviewErrorCode:
	"REVIEW_ERROR_CODE_MALFORMED_INPUT" |
	"REVIEW_ERROR_CODE_NOT_FOUND" |
	"REVIEW_ERROR_CODE_STALE_REVISION" |
	"REVIEW_ERROR_CODE_STALE_GENERATION" |
	"REVIEW_ERROR_CODE_UNSUPPORTED_CAPABILITY" |
	"REVIEW_ERROR_CODE_APPROVAL_REQUIRED" |
	"REVIEW_ERROR_CODE_APPROVAL_MISMATCH" |
	"REVIEW_ERROR_CODE_PROVIDER_DRIFT" |
	"REVIEW_ERROR_CODE_AMBIGUOUS_OUTCOME" |
	"REVIEW_ERROR_CODE_ANCHOR_STALE" |
	"REVIEW_ERROR_CODE_ANCHOR_AMBIGUOUS" |
	"REVIEW_ERROR_CODE_PATCH_CONFLICT" |
	"REVIEW_ERROR_CODE_BODY_LIMIT" |
	"REVIEW_ERROR_CODE_PAGE_LIMIT" |
	"REVIEW_ERROR_CODE_CORRUPTED_STATE" |
	"REVIEW_ERROR_CODE_AUTH_DENIED" |
	"REVIEW_ERROR_CODE_IDEMPOTENT_REPLAY"

#ReviewWorkingTreeTarget: {
	repository_id:          string & !=""
	repository_root:        string & !=""
	base_commit_oid:        string & !=""
	index_tree_oid:         string & !=""
	worktree_manifest_hash: string & !=""
}

#ReviewIndexTarget: {
	repository_id:   string & !=""
	repository_root: string & !=""
	base_commit_oid: string & !=""
	index_tree_oid:  string & !=""
}

#ReviewCommitTarget: {
	repository_id:          string & !=""
	repository_root:        string & !=""
	parent_commit_oid:      string & !=""
	commit_oid:             string & !=""
	stable_patch_evidence?: string
}

#ReviewRangeTarget: {
	repository_id:      string & !=""
	repository_root:    string & !=""
	requested_base_ref: string & !=""
	requested_head_ref: string & !=""
	merge_base_oid:     string & !=""
	base_commit_oid:    string & !=""
	head_commit_oid:    string & !=""
}

#ReviewPullRequestTarget: {
	provider:           "github"
	host:               string & !=""
	repository:         string & !=""
	number:             int & >0
	base_ref:           string & !=""
	head_ref:           string & !=""
	merge_base_oid:     string & !=""
	base_commit_oid:    string & !=""
	head_commit_oid:    string & !=""
	provider_node_id?:  string
}

#ReviewStackMemberTarget: {
	member_id:       string & !=""
	base_commit_oid: string & !=""
	head_commit_oid: string & !=""
	merge_base_oid:  string & !=""
}

#ReviewStackTarget: {
	stack_id:            string & !=""
	repository_id:       string & !=""
	members:             [...#ReviewStackMemberTarget]
	aggregate_base_oid:  string & !=""
	aggregate_head_oid:  string & !=""
}

#ReviewTarget: {
	working_tree?:  #ReviewWorkingTreeTarget
	index?:         #ReviewIndexTarget
	commit?:        #ReviewCommitTarget
	range?:         #ReviewRangeTarget
	pull_request?:  #ReviewPullRequestTarget
	stack?:         #ReviewStackTarget
}

#ReviewCommandEnvelope: {
	schema_version:     string & !=""
	command_id:         string & !=""
	actor_id:           string & !=""
	review_id:          string & !=""
	expected_revision:  int & >=0
	command_kind:       string & !=""
	command_json?:      bytes
}

#ReviewSnapshot: {
	schema_version:          string & !=""
	review_id:               string & !=""
	revision:                int & >=0
	session_id?:             string
	current_generation_id?:  string
	target?:                 #ReviewTarget
	thread_ids:              [...string]
	coverage_ids:            [...string]
	pending_review_id?:      string
	inbox_disposition:       #ReviewInboxDisposition
	closed:                  bool
	updated_at:              string & !=""
}

#ReviewTypedError: {
	code:    #ReviewErrorCode
	message: string & !=""
}
