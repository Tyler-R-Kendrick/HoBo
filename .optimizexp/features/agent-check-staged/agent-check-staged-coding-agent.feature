@optimizexp @dx @persona:coding-agent @interface:cli
Feature: agent-check-staged (coding agent)
  As coding agent
  I want a real product path I can exercise and capture
  So that review scores come from evidence, not template vibes

  Background:
    Given persona "coding-agent" is active
    And feature "agent-check-staged" is under optimizexp review

  Scenario: Primary path works for coding-agent
    Given I am on the critical path described by the feature seed
    When I run `pnpm run agent:check -- --staged`
    Then I see product chrome or structured status for this surface
    And the next action is obvious without tribal knowledge
    And evidence is capturable for this scenario

  Scenario: Help or status remains usable for coding-agent
    Given I am on the critical path described by the feature seed
    When I run `pnpm --help`
    Then help lists verbs or usage or the surface documents next steps
    And evidence is capturable for this scenario

  Scenario: Failure is actionable for coding-agent
    Given something goes wrong on this journey
    When I run `pnpm run not-a-real-script-zz`
    Then the error is non-blaming and actionable
    And evidence of what I saw is stored under evidence/
