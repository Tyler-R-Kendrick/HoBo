package architecture_evidence

#ReplayMode: "live" | "replay"
#HexDigest: string & =~"^[0-9a-f]{64}$"

#SeqVectorEntry: {
#	stream_id: string & !=""
#	seq:       int & >=0
#}

#ReplayReport: {
#	run_id:        string & !=""
#	seq_vector:    [...#SeqVectorEntry]
#	read_set_hash: #HexDigest
#	state_digest:  #HexDigest
#	mode:          #ReplayMode
#	seed:          string & !=""
#}

#ReplayDivergence: {
#	run_id:                     string & !=""
#	live_state_digest:          #HexDigest
#	replay_state_digest:        #HexDigest
#	live_order:                 [...string]
#	replay_order:               [...string]
#	first_divergent_event_key:  string & !=""
#} & {
#	if live_state_digest == replay_state_digest {
#		_conflict: "divergence requires differing digests"
#	}
#}

