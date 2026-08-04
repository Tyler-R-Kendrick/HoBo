@optimizexp @dx @ux @persona:github-copilot-cli-advanced-user @interface:cli
Feature: hobo-code-ghcp-parity (github copilot cli advanced user)
  As github copilot cli advanced user
  I want a real product path I can exercise and capture
  So that review scores come from evidence, not template vibes

  Background:
    Given persona "github-copilot-cli-advanced-user" is active
    And feature "hobo-code-ghcp-parity" is under optimizexp review

  Scenario: Primary path works for github-copilot-cli-advanced-user
    Given I am on the critical path described by the feature seed
    When I run `pnpm --filter @hobo/code exec node --import tsx src/bin/hobo-code.ts auth status`
    Then I see product chrome or structured status for this surface
    And the next action is obvious without tribal knowledge
    And evidence is capturable for this scenario

  Scenario: Help or status remains usable for github-copilot-cli-advanced-user
    Given I am on the critical path described by the feature seed
    When I run `pnpm --filter @hobo/code exec node --import tsx src/bin/hobo-code.ts models`
    Then help lists verbs or usage or the surface documents next steps
    And evidence is capturable for this scenario

  Scenario: Failure is actionable for github-copilot-cli-advanced-user
    Given something goes wrong on this journey
    When I run `pnpm --filter @hobo/code exec node --import tsx src/bin/hobo-code.ts auth login --complete WRONG-CODE`
    Then the error is non-blaming and actionable
    And evidence of what I saw is stored under evidence/
