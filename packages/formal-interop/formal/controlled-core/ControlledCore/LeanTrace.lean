/-!
# LeanTrace — axiomatized composition of formal traces (controlled tier).

Named LeanTrace to avoid collision with Microsoft Trace in the HoBo monorepo.
No Mathlib imports.
-/

namespace LeanTrace

/-- A trace step count. -/
structure Trace where
  steps : Nat
  deriving Repr

def empty : Trace := ⟨0⟩

def compose (a b : Trace) : Trace := ⟨a.steps + b.steps⟩

/-- Composition preserves non-negative step counts. -/
theorem compose_nonneg (a b : Trace) : (compose a b).steps ≥ 0 :=
  Nat.zero_le _

/-- compose is the primary export used by the multi-ITP harness (LeanTrace.compose). -/
theorem compose_steps_add (a b : Trace) :
    (compose a b).steps = a.steps + b.steps := rfl

end LeanTrace
