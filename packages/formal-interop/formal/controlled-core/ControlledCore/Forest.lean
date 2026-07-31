/-!
# Forest — axiomatized well-founded forest structure (controlled tier).

No Mathlib imports. Names disambiguated from repo Microsoft Trace.
-/

namespace Forest

/-- A forest is a finite collection of trees, modeled as a size. -/
structure Forest where
  size : Nat
  deriving Repr

/-- Empty forest. -/
def empty : Forest := ⟨0⟩

/-- Join two forests. -/
def join (a b : Forest) : Forest := ⟨a.size + b.size⟩

/-- Well-formedness: size is a natural (always true; recorded as theorem). -/
theorem wf (f : Forest) : f.size ≥ 0 := Nat.zero_le f.size

/-- Join is commutative on size. -/
theorem join_size_comm (a b : Forest) :
    (join a b).size = (join b a).size := by
  simp [join, Nat.add_comm]

end Forest
