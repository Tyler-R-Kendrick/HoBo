package config_evidence

#ConfigKey: string & =~"^[A-Z][A-Z0-9_]*$"

#ConfigSensitivity: "secretless" | "secret" | "config"
#ConfigSourceKind: "binding" | "secret-ref" | "camp-env"

#ConfigSource: {
	kind:     #ConfigSourceKind
	ref:      string & !=""
	devOnly?: bool
}

#ConfigManifestEntry: {
	key:                    #ConfigKey
	type:                   "string" | "number" | "boolean"
	required:               bool
	sensitivity:            #ConfigSensitivity
	source:                 #ConfigSource
	defaultType?:           "string" | "number" | "boolean"
	productionDeployable?:  bool
}

// devOnly sources must not be production-deployable
#ConfigManifestEntry & { source: { devOnly: true } }: {
	productionDeployable: false
}

// Event records are closed — no value field permitted
#ConfigResolved: close({
	key:            string & !=""
	ref:            string & !=""
	source:         "bound-resource" | "secret-store" | "camp-env" | "dev-secret" | "static-secret-hatch"
	camp:           string & !=""
	eventId?:       string
	correlationId?: string
})

#SecretAccessed: close({
	ref:         string & !=""
	camp:        string & !=""
	source:      string & !=""
	accessorId?: string
	eventId?:    string
})

#SecretUnavailable: close({
	ref:     string & !=""
	camp:    string & !=""
	reason:  string & !=""
	eventId?: string
})
