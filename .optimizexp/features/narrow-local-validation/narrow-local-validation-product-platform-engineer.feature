@optimizexp @dx @ax @persona:product-platform-engineer @interface:mcp
Feature: Narrow local validation after a small change (product platform engineer)
  As product platform engineer
  I want After a one-package or staged edit in HoBo, the developer runs a narrow validation command (`pnpm run agent:check -- --staged`) and gets a clear gate list or fix-forward error without a full monorepo 
  So that harms, friction, and uncertainty stay low on my critical path

  # Generated for persona "product-platform-engineer". Agent should refine steps to match
  # .optimizexp/personas/product-platform-engineer.md vocabulary and failure modes.
  # Scenario names are stable evidence keys (slugified).

  Background:
    Given persona "product-platform-engineer" is active
    And feature "narrow-local-validation" is under optimizexp review

  Scenario: Narrow local validation after a small change works for product-platform-engineer
    Given I am on the critical path described by the feature seed
    When I exercise the surface as this persona would
    Then I receive clear status about what happened
    And the next action is obvious without tribal knowledge
    And evidence is capturable for this scenario

  Scenario: Narrow local validation after a small change failure is understandable for product-platform-engineer
    Given something goes wrong on this journey
    When I observe the failure as this persona
    Then the error is non-blaming and actionable
    And I am not forced into repeated artificial hurdles
    And evidence of what I saw is stored under evidence/
