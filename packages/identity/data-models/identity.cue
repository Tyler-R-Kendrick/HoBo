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

// First-class Connection aggregate (broker-owned). credential_ref is opaque.
#ConnectionRecord: {
  schemaVersion: string & != ""
  id: string & != ""
  alias: string & != ""
  provider: string & != ""
  flow: "oidc-federation" | "oauth2-xaa" | "oauth2-obo" | "device-code" | "api-key" | "app-install"
  status: "pending" | "active" | "needs-reauth" | "revoked" | "expired"
  subject: #PrincipalRef
  installationId?: string
  grantedScopes: [...string]
  requestedScopes: [...string]
  credentialRef: =~"^tokenref://|^secref://|^vault://" | ""
  tenant: string & != ""
  createdAt: string & != ""
  updatedAt: string & != ""
  seq: uint
}

#ConnectionCreatedEventData: {
  connectionId: string & != ""
  alias: string & != ""
  provider: string & != ""
  flow: string & != ""
  subject: #PrincipalRef
  createdBy: #PrincipalRef
  requestedScopes: [...string]
  status: string & != ""
}

#ConnectionAuthorizedEventData: {
  connectionId: string & != ""
  grantedScopes: [...string]
  installationId?: string
  subject: #PrincipalRef
  credentialRef: string & != ""
  status: string & != ""
}

#ConnectionTokenIssuedEventData: {
  connectionId: string & != ""
  grantId: string & != ""
  tokenRef: =~"^tokenref://"
  scopes: [...string]
  expiresAt: string & != ""
}

// ADR-0027 secretless-first audit + schema shapes (refs only).
#ConfigResolvedEventData: {
  name: string & != ""
  source: "bound-resource" | "provider-federation" | "camp-value" | "static-escape"
  valueRef?: string
  subject?: string
  redacted: true
}

#SecretAccessedEventData: {
  name: string & != ""
  source: "bound-resource" | "provider-federation" | "camp-value" | "static-escape"
  valueRef: string & != ""
  versionId?: string
  subject?: string
  grantId?: string
  redacted: true
  plaintextPresent: false
}

#ConfigFieldRecord: {
  name: string & != ""
  type: "string" | "boolean" | "int" | "json"
  required: bool
  sensitive: bool
  source: "bound-resource" | "provider-federation" | "camp-value" | "static-escape"
  ttl?: =~"^[1-7]d$"
  rotation?: "required" | "optional"
}
