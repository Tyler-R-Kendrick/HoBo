@optimizexp @dx @persona:role-developers @interface:web
Feature: Draft experience proofs are navigable (role developers)
  As role developers
  I want A platform engineer or agent locates experience proofs under src/draft/exp-proofs/ for HoBo and understands classification (ux/dx/ax/…) without guessing.
  So that harms, friction, and uncertainty stay low on my critical path

  # Generated for persona "role-developers". Agent should refine steps to match
  # .optimizexp/personas/role-developers.md vocabulary and failure modes.
  # Scenario names are stable evidence keys (slugified).

  Background:
    Given persona "role-developers" is active
    And feature "draft-experience-proof-navigation" is under optimizexp review

  Scenario: Draft experience proofs are navigable works for role-developers
    Given I am on the critical path described by the feature seed
    When I exercise the surface as this persona would
    Then I receive clear status about what happened
    And the next action is obvious without tribal knowledge
    And evidence is capturable for this scenario

  Scenario: Draft experience proofs are navigable failure is understandable for role-developers
    Given something goes wrong on this journey
    When I observe the failure as this persona
    Then the error is non-blaming and actionable
    And I am not forced into repeated artificial hurdles
    And evidence of what I saw is stored under evidence/
