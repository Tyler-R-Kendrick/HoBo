// Constraints for proof.proto. The definition is *named* `#ProofIdentity`
// because that is the message `proof.proto` declares: an anonymous record
// beside a proto type constrains nothing the guard — or a reader — can tie back
// to it. `convex-swaghaus-bindle` already does it this way.
//
// The definition is then embedded at top level so the concrete `slug`/`layer`
// shape this file has always presented is unchanged.

package proof

#ProofIdentity: {
	slug:  string & !=""
	layer: "exp"
}

#ProofIdentity
