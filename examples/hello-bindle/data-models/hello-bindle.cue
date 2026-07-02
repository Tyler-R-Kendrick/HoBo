package hello_bindle

#HelloBindleManifestFixture: {
	schema:        "hobo.manifest/v1"
	manifest_hash: string & =~"^sha256:[0-9a-f]{64}$"
}
