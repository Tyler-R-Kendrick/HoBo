package stations

#StationIsolation: {
	tenant:       string & !=""
	residency:    string & !=""
	airgap:       bool
	trust_domain: string & !=""
}

#StationRecord: {
	schema_version: string & !=""
	id:             string & !=""
	name:           string & !=""
	isolation:      #StationIsolation
	data_dir:       string & !=""
	status:         "open" | "closed"
	active_rail_hash?: string
	bootstrap_rail_hash?: string
	created_at: string & !=""
	updated_at: string & !=""
	seq:        uint
}

#RailRecord: {
	id:                   string & !=""
	name:                 string & !=""
	version:              string & !=""
	content_hash:         =~"^sha256:[a-f0-9]{64}$"
	activation_status:    "draft" | "approved" | "active" | "retired"
	station_id:           string & !=""
	policy_pack_ref?:     string
	catalog_snapshot_pin?: string
	is_bootstrap:         bool
	published_at:         string & !=""
}

#StationCreatedEventData: {
	station_id:          string & !=""
	name:                string & !=""
	isolation:           #StationIsolation
	bootstrap_rail_hash: =~"^sha256:"
}

#RailActivatedEventData: {
	station_id:   string & !=""
	rail_id:      string & !=""
	content_hash: =~"^sha256:"
	is_bootstrap: bool
}
