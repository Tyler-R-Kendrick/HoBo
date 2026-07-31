/-!
# MathlibContrast — fixture only (NOT on controlled path).

Documents the ecosystem/Mathlib-dependent drop for H1 prediction.
This file is intentionally NOT imported by ControlledCore.lean.
It records a dependent-lemma name for the multi-ITP harness contrast path
without importing Mathlib (so the package stays offline-buildable).
-/

namespace MathlibContrast

/-- Placeholder name referenced by MATHLIB_DEPENDENT_FIXTURE in the harness. -/
def dependent_lemma : True := True.intro

/-- Note: a real Mathlib-dependent lemma would `import Mathlib` and fail portability. -/
theorem note_no_mathlib_import : True := True.intro

end MathlibContrast
