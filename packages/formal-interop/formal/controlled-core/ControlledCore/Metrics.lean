/-!
# Metrics — axiomatized non-negativity of metric scores (controlled tier).
-/

namespace Metrics

/-- A score in abstract non-negative form (Nat millipercent). -/
structure Score where
  milli : Nat
  deriving Repr

def zero : Score := ⟨0⟩

def add (a b : Score) : Score := ⟨a.milli + b.milli⟩

/-- Metrics are non-negative (Nat). -/
theorem nonneg (s : Score) : s.milli ≥ 0 := Nat.zero_le s.milli

theorem add_nonneg (a b : Score) : (add a b).milli ≥ 0 := Nat.zero_le _

end Metrics
