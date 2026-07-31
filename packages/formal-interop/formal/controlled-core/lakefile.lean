import Lake
open Lake DSL

package «controlled-core» where
  -- Axiomatized controlled formal package (no Mathlib dependency).
  leanOptions := #[
    ⟨`autoImplicit, false⟩
  ]

@[default_target]
lean_lib ControlledCore where
  globs := #[.submodules `ControlledCore]
