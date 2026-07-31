@optimizexp @dx @persona:product-coding-agent @interface:mcp
Feature: Design system contract is agent-followable (product coding agent)
  As product coding agent
  I want A designer or agent edits UI using the DESIGN.md contract; design lint (or equivalent) fails closed on contrast/token breaks with file references.
  So that harms, friction, and uncertainty stay low on my critical path

  # Generated for persona "product-coding-agent". Agent should refine steps to match
  # .optimizexp/personas/product-coding-agent.md vocabulary and failure modes.
  # Scenario names are stable evidence keys (slugified).

  Background:
    Given persona "product-coding-agent" is active
    And feature "design-system-contract" is under optimizexp review

  Scenario: Design system contract is agent-followable works for product-coding-agent
    Given I am on the critical path described by the feature seed
    When I exercise the surface as this persona would
    Then I receive clear status about what happened
    And the next action is obvious without tribal knowledge
    And evidence is capturable for this scenario

  Scenario: Design system contract is agent-followable failure is understandable for product-coding-agent
    Given something goes wrong on this journey
    When I observe the failure as this persona
    Then the error is non-blaming and actionable
    And I am not forced into repeated artificial hurdles
    And evidence of what I saw is stored under evidence/
