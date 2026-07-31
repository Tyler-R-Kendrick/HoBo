/-!
# Recurrence — axiomatized recurrence bound (controlled tier).
-/

namespace Recurrence

/-- Simple linear recurrence step. -/
def step (n : Nat) : Nat := n + 1

/-- Iterate `step` exactly `k` times starting from `n`. -/
def iterate : Nat → Nat → Nat
  | 0, n => n
  | k + 1, n => iterate k (step n)

/-- Recurrence.bound: iterating k steps never decreases the value. -/
theorem bound (k n : Nat) : n ≤ iterate k n := by
  induction k generalizing n with
  | zero =>
      simp [iterate]
  | succ k ih =>
      -- iterate (k+1) n = iterate k (n+1)
      simp [iterate, step]
      have h : n + 1 ≤ iterate k (n + 1) := ih (n + 1)
      exact Nat.le_trans (Nat.le_succ n) h

end Recurrence
