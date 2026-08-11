package code

#SessionLifecycleState: "SESSION_LIFECYCLE_STATE_STARTING" | "SESSION_LIFECYCLE_STATE_RUNNING" | "SESSION_LIFECYCLE_STATE_STOPPING" | "SESSION_LIFECYCLE_STATE_STOPPED" | "SESSION_LIFECYCLE_STATE_FAILED"
#PaneLifecycleState: "PANE_LIFECYCLE_STATE_STARTING" | "PANE_LIFECYCLE_STATE_RUNNING" | "PANE_LIFECYCLE_STATE_EXITED" | "PANE_LIFECYCLE_STATE_MISSING"
#AgentLifecycleState: "AGENT_LIFECYCLE_STATE_STARTING" | "AGENT_LIFECYCLE_STATE_IDLE" | "AGENT_LIFECYCLE_STATE_WORKING" | "AGENT_LIFECYCLE_STATE_BLOCKED" | "AGENT_LIFECYCLE_STATE_DONE" | "AGENT_LIFECYCLE_STATE_FAILED" | "AGENT_LIFECYCLE_STATE_STOPPED" | "AGENT_LIFECYCLE_STATE_UNKNOWN"
#CheckpointLifecycleState: "CHECKPOINT_LIFECYCLE_STATE_CREATED" | "CHECKPOINT_LIFECYCLE_STATE_RESTORING" | "CHECKPOINT_LIFECYCLE_STATE_RESTORED" | "CHECKPOINT_LIFECYCLE_STATE_FAILED"
#DeliveryLifecycleState: "DELIVERY_LIFECYCLE_STATE_IDLE" | "DELIVERY_LIFECYCLE_STATE_READY" | "DELIVERY_LIFECYCLE_STATE_PUSHING" | "DELIVERY_LIFECYCLE_STATE_PULL_REQUEST_OPEN" | "DELIVERY_LIFECYCLE_STATE_MERGING" | "DELIVERY_LIFECYCLE_STATE_MERGED" | "DELIVERY_LIFECYCLE_STATE_FAILED"

#Session: {
	id:              string & !=""
	name:            string & !=""
	project_root:    string & !=""
	worktree_path:   string & !=""
	branch:          string & !=""
	lifecycle_state: #SessionLifecycleState
	created_at:      string & !=""
	updated_at:      string & !=""
	close_on_merge:  bool
}

#Tab: {
	id:         string & !=""
	session_id: string & !=""
	title:      string & !=""
	position:   int & >=0
}

#Pane: {
	id:                string & !=""
	session_id:        string & !=""
	tab_id:            string & !=""
	title:             string & !=""
	lifecycle_state:   #PaneLifecycleState
	runtime_id:        string & !=""
	working_directory: string & !=""
	agent_run_id?:     string & !=""
	left_column?:       int & >=0
	top_row?:           int & >=0
	width?:              int & >=0
	height?:             int & >=0
	window_width?:       int & >=0
	window_height?:      int & >=0
}

#AgentRun: {
	id:                   string & !=""
	session_id:           string & !=""
	pane_id:              string & !=""
	provider:             string & !=""
	provider_session_id?: string & !=""
	lifecycle_state:      #AgentLifecycleState
	started_at:           string & !=""
	updated_at:           string & !=""
	summary:              string
	terminal_only:        bool
}

#Checkpoint: {
	id:              string & !=""
	session_id:      string & !=""
	git_commit:      string & !=""
	label:           string
	lifecycle_state: #CheckpointLifecycleState
	created_at:      string & !=""
}

#GitState: {
	worktree_path:   string & !=""
	branch:          string & !=""
	head_sha:        string & !=""
	base_sha:        string & !=""
	dirty:           bool
	ahead:           int & >=0
	behind:          int & >=0
	staged_paths:    [...string]
	unstaged_paths:  [...string]
	untracked_paths: [...string]
}

#DeliveryState: {
	lifecycle_state:     #DeliveryLifecycleState
	remote:              string & !=""
	pull_request_number?: int & >0
	pull_request_url?:    string & !=""
	stack_parent_branch?: string & !=""
	message:              string
}

#SessionSnapshot: {
	schema_version:      "hobo.code.session-snapshot/v1"
	session:             #Session
	tabs:                [...#Tab]
	panes:               [...#Pane]
	agent_runs:          [...#AgentRun]
	checkpoints:         [...#Checkpoint]
	git_state:           #GitState
	delivery_state:      #DeliveryState
	focused_tab_id:      string & !=""
	focused_pane_id:     string & !=""
	attached_client_ids: [...string & !=""]
	revision:            int & >=0
	captured_at:         string & !=""
}

#CreateSessionCommand: {
	name:         string & !=""
	project_root: string & !=""
	branch:       string & !=""
	client_id:    string & !=""
}

#DetachSessionCommand: client_id: string & !=""
#ReattachSessionCommand: client_id: string & !=""
#FocusPaneCommand: pane_id: string & !=""
#StopSessionCommand: remove_worktree: bool
#CreateTabCommand: title: string & !=""
#CreatePaneCommand: {
	tab_id:  string & !=""
	title:   string & !=""
	command: [...string & !=""]
}
#SplitPaneCommand: {
	pane_id:   string & !=""
	direction: "horizontal" | "vertical"
	title:     string & !=""
	command:   [...string & !=""]
}
#ClosePaneCommand: pane_id: string & !=""
#SendInputCommand: {
	pane_id: string & !=""
	input:   string
}
#StartAgentCommand: {
	pane_id:  string & !=""
	provider: string & !=""
	command:  [...string & !=""]
	prompt:   string
}
#StopAgentCommand: agent_run_id: string & !=""
#CreateCheckpointCommand: label: string
#RestoreCheckpointCommand: checkpoint_id: string & !=""
#CommitCommand: message: string & !=""
#PushCommand: remote: string & !=""
#OpenPullRequestCommand: {
	title: string & !=""
	body:  string
	draft: bool
}
#StackPullRequestCommand: {
	parent_branch: string & !=""
	title:         string & !=""
	body:          string
}
#MergePullRequestCommand: pull_request_number: int & >0

#SessionCreatedEvent: snapshot: #SessionSnapshot
#ClientDetachedEvent: client_id: string & !=""
#ClientReattachedEvent: client_id: string & !=""
#PaneFocusedEvent: pane_id: string & !=""
#SessionChangedEvent: {
	change:   string & !=""
	snapshot: #SessionSnapshot
}

#SessionCommandEnvelope: {
	schema_version:    "hobo.code.session-command/v1"
	command_id:        string & !=""
	actor_id:          string & !=""
	session_id:        string & !=""
	expected_revision: int & >=0
	(create_session: #CreateSessionCommand) |
	(detach_session: #DetachSessionCommand) |
	(reattach_session: #ReattachSessionCommand) |
	(focus_pane: #FocusPaneCommand) |
	(stop_session: #StopSessionCommand) |
	(create_tab: #CreateTabCommand) |
	(create_pane: #CreatePaneCommand) |
	(split_pane: #SplitPaneCommand) |
	(close_pane: #ClosePaneCommand) |
	(send_input: #SendInputCommand) |
	(start_agent: #StartAgentCommand) |
	(stop_agent: #StopAgentCommand) |
	(create_checkpoint: #CreateCheckpointCommand) |
	(restore_checkpoint: #RestoreCheckpointCommand) |
	(commit: #CommitCommand) |
	(push: #PushCommand) |
	(open_pull_request: #OpenPullRequestCommand) |
	(stack_pull_request: #StackPullRequestCommand) |
	(merge_pull_request: #MergePullRequestCommand)
}

#SessionEventEnvelope: {
	schema_version: "hobo.code.session-event/v1"
	event_id:       string & !=""
	session_id:     string & !=""
	sequence:       int & >0
	occurred_at:    string & !=""
	causation_id:   string & !=""
	(session_created: #SessionCreatedEvent) |
	(client_detached: #ClientDetachedEvent) |
	(client_reattached: #ClientReattachedEvent) |
	(pane_focused: #PaneFocusedEvent) |
	(session_changed: #SessionChangedEvent)
}

#SessionCommandResult: {
	accepted: bool
	code:     string & !=""
	message:  string
	snapshot: #SessionSnapshot
	events:   [...#SessionEventEnvelope]
}

#IsolationBackend: {
	kind:        "rift" | "worktree"
	platform:    string & !=""
	cow_capable: bool
	reason:      string & !=""
}

#IsolationContext: {
	schema_version: "hobo.code.isolation/v1"
	run_id:         string & !=""
	branch:         string & !=""
	root_path:      string & !=""
	backend:        #IsolationBackend
	station_id?:    string
	durable_root:   string & !=""
	created_at:     string & !=""
	status:         "open" | "cleaned" | "failed"
}

#PromotionRequest: {
	run_id:          string & !=""
	isolation_root:  string & !=""
	target_project:  string & !=""
	gate_results:    [...string]
	squash_only:     true
}

#PromotionResult: {
	ok:            bool
	code:          string & !=""
	message:       string & !=""
	merged_branch?: string
	cleaned:       bool
}

#EvidenceTriple: {
	flag_key:               string & !=""
	scenario:               string & !=""
	playwright_script_path: string & !=""
	recording_mp4_path:     string & !=""
	screenshot_paths:       [...string]
	durable_root:           string & !=""
}

#AgentPaneState: {
	agent_id:        string & !=""
	semantic_state:  "blocked" | "working" | "done" | "idle"
	summary:         string
	highlight_buffer: string
}

#InferenceBudgetSnapshot: {
	provider:              string & !=""
	spend_usd:             number & >=0
	cap_usd:               number & >=0
	monetization_enabled:  false | true
	routing_policy:        string & !=""
}
