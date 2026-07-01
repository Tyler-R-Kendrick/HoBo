package hobo

// Initial S2-08 capability ports and manifest bundle invariants.
#EquivalenceClass: {
  class: "web/service" | "kv" | "objectStore"
  port: "compute" | "kv" | "objectStore"
  resourceClass: =~"^cloudflare:"
  providerService: string & !=""
  features: [...string] & [_, ...string]
}

#PublishedManifest: {
  index: schema: "hobo.capability-manifest-index/v1"
  capabilities: schema: "hobo.capabilities/v1"
  auth: {
    schema: "hobo.provider-auth/v1"
    staticSecrets: false
  }
  cost: {
    schema: "hobo.cost/v1"
    currency: "USD"
    facts: [...{sku: string, unit: string}] & [_, ..._]
  }
}
