@optimizexp @dx @persona:coding-agent @interface:cli
Feature: Staged agent check is narrow and actionable after a skill edit (coding agent)
  As coding agent
  I want Staged agent check is narrow and actionable after a skill edit
  So that harms, friction, and uncertainty stay low on my critical path

  # Generated for persona "coding-agent". Agent should refine steps to match
  # .optimizexp/personas/coding-agent.md vocabulary and failure modes.
  # Scenario names are stable evidence keys (slugified).

  Background:
    Given persona "coding-agent" is active
    And feature "agent-check-staged" is under optimizexp review

  Scenario: Staged agent check is narrow and actionable after a skill edit works for coding-agent
    Given I am on the critical path described by the feature seed
    When I exercise the surface as this persona would
    Then I receive clear status about what happened
    And the next action is obvious without tribal knowledge
    And evidence is capturable for this scenario

  Scenario: Staged agent check is narrow and actionable after a skill edit failure is understandable for coding-agent
    Given something goes wrong on this journey
    When I observe the failure as this persona
    Then the error is non-blaming and actionable
    And I am not forced into repeated artificial hurdles
    And evidence of what I saw is stored under evidence/
