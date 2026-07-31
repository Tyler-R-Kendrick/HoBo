@optimizexp @dx @ax @persona:product-platform-engineer @interface:mcp
Feature: Draft experience proofs are navigable (product platform engineer)
  As product platform engineer
  I want A platform engineer or agent locates experience proofs under src/draft/exp-proofs/ for HoBo and understands classification (ux/dx/ax/…) without guessing.
  So that harms, friction, and uncertainty stay low on my critical path

  # Generated for persona "product-platform-engineer". Agent should refine steps to match
  # .optimizexp/personas/product-platform-engineer.md vocabulary and failure modes.
  # Scenario names are stable evidence keys (slugified).

  Background:
    Given persona "product-platform-engineer" is active
    And feature "draft-experience-proof-navigation" is under optimizexp review

  Scenario: Draft experience proofs are navigable works for product-platform-engineer
    Given I am on the critical path described by the feature seed
    When I exercise the surface as this persona would
    Then I receive clear status about what happened
    And the next action is obvious without tribal knowledge
    And evidence is capturable for this scenario

  Scenario: Draft experience proofs are navigable failure is understandable for product-platform-engineer
    Given something goes wrong on this journey
    When I observe the failure as this persona
    Then the error is non-blaming and actionable
    And I am not forced into repeated artificial hurdles
    And evidence of what I saw is stored under evidence/
