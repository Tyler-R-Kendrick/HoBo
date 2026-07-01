package data_models

#PullRequestGate: {
	requiredChecks: [...string] & list.MinItems & {
		"build", "typecheck", "lint", "unit", "conformance", ...
	}
	blocksPullRequest: true
}

#OidcFederation: {
	mode: "oidc-federation"
	audience: string & !=""
	forbidsStoredSecrets: true
}

#CloudRole: {
	allowedActions: [...=~"^deployments:(create|read|delete)$")]
	// forbidden prefixes enforced in validate layer: iam:, billing:, secrets:, resources:admin
}

#TeardownPolicy: {
	always: true
	orphanSweeper: {
		enabled: true
		maxAgeMinutes: int & <=60
		selector: string & !=""
	}
}

#QuarantinePolicy: {
	continueOnError: true
	blocksPullRequest: false
}

#E2eLane: {
	gatedBy: [...string] & list.MinItems
	auth: #OidcFederation
	teardown: #TeardownPolicy
	quarantine: #QuarantinePolicy
}

#CiFabricContract: {
	schema: "hobo.ciFabric/v1"
	pullRequestGate: #PullRequestGate
	e2e: #E2eLane
}

#E2eLifecycleEvent: {
	type: "e2e.FixtureDeployed" | "e2e.LiveUrlAsserted" | "e2e.FixtureTornDown" | "e2e.OrphanSwept"
	fixture: string & !=""
	runId: string & !=""
}
