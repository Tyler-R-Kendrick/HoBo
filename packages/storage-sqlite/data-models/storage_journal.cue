package storage_sqlite

// CUE constraints for storage journal boundary records.

#PositionedEventWire: {
	global_position: =~"^(0|[1-9][0-9]*)$"
	event_envelope:  bytes
}

#StreamHeadWire: {
	stream_id:   string & !=""
	revision:    int & >=0
	owner_epoch: =~"^(0|[1-9][0-9]*)$"
	created_at:  string & !=""
	updated_at:  string & !=""
}

#SubscriptionCheckpointWire: {
	subscription_id: string & !=""
	partition_id:    string & !=""
	position:        =~"^(0|[1-9][0-9]*)$"
	fence_token:     =~"^[1-9][0-9]*$"
	updated_at:      string & !=""
}
