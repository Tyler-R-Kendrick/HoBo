@optimizexp @dx @persona:product-platform-engineer @interface:mcp
Feature: Design system contract is agent-followable (product platform engineer)
  As product platform engineer
  I want A designer or agent edits UI using the DESIGN.md contract; design lint (or equivalent) fails closed on contrast/token breaks with file references.
  So that harms, friction, and uncertainty stay low on my critical path

  # Generated for persona "product-platform-engineer". Agent should refine steps to match
  # .optimizexp/personas/product-platform-engineer.md vocabulary and failure modes.
  # Scenario names are stable evidence keys (slugified).

  Background:
    Given persona "product-platform-engineer" is active
    And feature "design-system-contract" is under optimizexp review

  Scenario: Design system contract is agent-followable works for product-platform-engineer
    Given I am on the critical path described by the feature seed
    When I exercise the surface as this persona would
    Then I receive clear status about what happened
    And the next action is obvious without tribal knowledge
    And evidence is capturable for this scenario

  Scenario: Design system contract is agent-followable failure is understandable for product-platform-engineer
    Given something goes wrong on this journey
    When I observe the failure as this persona
    Then the error is non-blaming and actionable
    And I am not forced into repeated artificial hurdles
    And evidence of what I saw is stored under evidence/
