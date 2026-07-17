package hobo

// CUE constraints for S3-02 @hobo/identity draft POC records.

#PrincipalRef: {
  kind: "user" | "agent" | "service" | "workload"
  id: string & != ""
}

#CodeVersion: {
  digest: =~"^sha256:[a-f0-9]{64}$"
  version: string & != ""
}

#ScopeEntry: {
  port: string & != ""
  resource: string & != ""
  verbs: [...string] & != []
}

#AttestationBinding: {
  runId: string & != ""
  tenant: string & != ""
  parentPrincipal: #PrincipalRef
  codeVersion: #CodeVersion
  componentImageDigest: =~"^sha256:[a-f0-9]{64}$"
}

#JwtSvidRecord: {
  identityId: string & != ""
  subject: =~"^spiffe://yard/"
  svidRef: =~"^tokenref://identity/svid/"
  scope: [...#ScopeEntry] & != []
  expiresAt: string & != ""
  signerKid: string & != ""
}

#IdentityIssuedEventData: {
  identityId: string & != ""
  subject: =~"^spiffe://yard/"
  svidRef: =~"^tokenref://identity/svid/"
  scope: [...#ScopeEntry] & != []
  expiresAt: string & != ""
}

#IdentityRotatedEventData: {
  identityId: string & != ""
  previousIdentityId: string & != ""
  subject: =~"^spiffe://yard/"
  svidRef: =~"^tokenref://identity/svid/"
  expiresAt: string & != ""
}

#IdentityServiceEvidence: {
  issue: string & != ""
  summary: string & != ""
  eventFamilies: [...string] & != []
}

// Token-broker constraints (S2-04).

#TokenScope: {
  port: string & != ""
  resource: string & != ""
  action: string & != ""
}

#VaultedCredentialRef: {
  reference: =~"^tokenref://"
}

#TokenGrantRecord: {
  grantId: string & != ""
  svidSubject: =~"^spiffe://yard/"
  svidIdentityId: string & != ""
  scope: #TokenScope
  deployId: string & != ""
  audience: string & != ""
  issuedAt: string & != ""
  expiresAt: string & != ""
  tokenRef: =~"^tokenref://broker/grant/"
  vaultReference: =~"^tokenref://"
  credentialSource: "oidc-federation" | "vault-static-key"
  providerTokenRef?: =~"^tokenref://provider/"
}

// S3-03 keyless token exchange constraints (one per new protobuf message).

#OidcFederationAssertion: {
  issuer: string & != ""
  subject: =~"^spiffe://yard/"
  audience: string & != ""
  scope: #TokenScope
  issuedAt: string & != ""
  expiresAt: string & != ""
}

#ProviderStsExchangeRequest: {
  oidcToken: =~"^hobo-oidc\\."
  audience: string & != ""
  subject: =~"^spiffe://yard/"
  scope: #TokenScope
  now: string & != ""
}

#ExchangedProviderCredential: {
  tokenRef: =~"^tokenref://provider/"
  flow: "oidc-federation"
  provider: string & != ""
  audience: string & != ""
  scope: #TokenScope
  issuedAt: string & != ""
  expiresAt: string & != ""
  expiresInSeconds: uint & >0
  narrowed: true
}

#TokenGrantedEventData: {
  grantId: string & != ""
  svidSubject: =~"^spiffe://yard/"
  svidIdentityId: string & != ""
  tokenRef: =~"^tokenref://broker/grant/"
  scope: #TokenScope
  expiresAt: string & != ""
}

#TokenUsedEventData: {
  grantId: string & != ""
  svidSubject: =~"^spiffe://yard/"
  tokenRef: =~"^tokenref://broker/grant/"
  scope: #TokenScope
}

#TokenRevokedEventData: {
  grantId: string & != ""
  svidSubject: =~"^spiffe://yard/"
  tokenRef: =~"^tokenref://broker/grant/"
  reason: string & != ""
}
