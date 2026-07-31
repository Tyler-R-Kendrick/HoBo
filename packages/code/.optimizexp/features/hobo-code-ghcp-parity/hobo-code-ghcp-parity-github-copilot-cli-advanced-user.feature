@optimizexp @ux @dx @persona:github-copilot-cli-advanced-user @interface:cli
Feature: GHCP parity: animated title, enterprise auth, BYOK open models, built-in sandbox (github copilot cli advanced user)
  As github copilot cli advanced user
  I want GHCP parity: animated title, enterprise auth, BYOK open models, built-in sandbox for advanced Copilot CLI users
  So that harms, friction, and uncertainty stay low on my critical path

  # Generated for persona "github-copilot-cli-advanced-user". Agent should refine steps to match
  # .optimizexp/personas/github-copilot-cli-advanced-user.md vocabulary and failure modes.
  # Scenario names are stable evidence keys (slugified).

  Background:
    Given persona "github-copilot-cli-advanced-user" is active
    And feature "hobo-code-ghcp-parity" is under optimizexp review

  Scenario: GHCP parity: animated title, enterprise auth, BYOK open models, built-in sandbox works for github-copilot-cli-advanced-user
    Given I am on the critical path described by the feature seed
    When I exercise the surface as this persona would
    Then I receive clear status about what happened
    And the next action is obvious without tribal knowledge
    And evidence is capturable for this scenario

  Scenario: GHCP parity: animated title, enterprise auth, BYOK open models, built-in sandbox failure is understandable for github-copilot-cli-advanced-user
    Given something goes wrong on this journey
    When I observe the failure as this persona
    Then the error is non-blaming and actionable
    And I am not forced into repeated artificial hurdles
    And evidence of what I saw is stored under evidence/
