// CUE constraints for every protobuf type in jurisdiction.proto, so the
// architecture guard can confirm the legal-geography shapes are bounded at
// parse time.

package core

#JurisdictionRecord: {
	id:   "eu" | "eea" | "us" | "us-gov" | "uk" | "ch" | "ca" | "au" | "in" | "jp" | "br" | "global"
	name: string & !=""
	legal_basis: [...string & !=""]
}

#RegionJurisdictionMappingRecord: {
	region: string & !=""
	jurisdictions: [...#JurisdictionRecord.id]
}

#ResidencyConstraintRecord: {
	classifications: [...("public" | "internal" | "pii" | "phi" | "pci" | "secret")]
	allowed_jurisdictions: [...#JurisdictionRecord.id]
	denied_jurisdictions: [...#JurisdictionRecord.id]
}

#ResidencyEvaluationRecord: {
	ok:     bool
	code:   "" | "region-unmapped" | "jurisdiction-denied" | "jurisdiction-not-allowed"
	region: string & !=""
	region_jurisdictions: [...#JurisdictionRecord.id]
	remediation?: string
}
