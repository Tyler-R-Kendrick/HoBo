@optimizexp @dx @persona:role-platform-engineers @interface:web
Feature: Draft experience proofs are navigable (role platform engineers)
  As role platform engineers
  I want A platform engineer or agent locates experience proofs under src/draft/exp-proofs/ for HoBo and understands classification (ux/dx/ax/…) without guessing.
  So that harms, friction, and uncertainty stay low on my critical path

  # Generated for persona "role-platform-engineers". Agent should refine steps to match
  # .optimizexp/personas/role-platform-engineers.md vocabulary and failure modes.
  # Scenario names are stable evidence keys (slugified).

  Background:
    Given persona "role-platform-engineers" is active
    And feature "draft-experience-proof-navigation" is under optimizexp review

  Scenario: Draft experience proofs are navigable works for role-platform-engineers
    Given I am on the critical path described by the feature seed
    When I exercise the surface as this persona would
    Then I receive clear status about what happened
    And the next action is obvious without tribal knowledge
    And evidence is capturable for this scenario

  Scenario: Draft experience proofs are navigable failure is understandable for role-platform-engineers
    Given something goes wrong on this journey
    When I observe the failure as this persona
    Then the error is non-blaming and actionable
    And I am not forced into repeated artificial hurdles
    And evidence of what I saw is stored under evidence/
