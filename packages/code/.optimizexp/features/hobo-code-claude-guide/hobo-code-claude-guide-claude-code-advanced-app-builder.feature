@optimizexp @dx @ux @persona:claude-code-advanced-app-builder @interface:cli
Feature: hobo-code-claude-guide (claude code advanced app builder)
  As claude code advanced app builder
  I want a real product path I can exercise and capture
  So that review scores come from evidence, not template vibes

  Background:
    Given persona "claude-code-advanced-app-builder" is active
    And feature "hobo-code-claude-guide" is under optimizexp review

  Scenario: Primary path works for claude-code-advanced-app-builder
    Given I am on the critical path described by the feature seed
    When I run `pnpm --filter @hobo/code exec node --import tsx src/bin/hobo-code.ts guide`
    Then I see product chrome or structured status for this surface
    And the next action is obvious without tribal knowledge
    And evidence is capturable for this scenario

  Scenario: Help or status remains usable for claude-code-advanced-app-builder
    Given I am on the critical path described by the feature seed
    When I run `pnpm --help`
    Then help lists verbs or usage or the surface documents next steps
    And evidence is capturable for this scenario

  Scenario: Failure is actionable for claude-code-advanced-app-builder
    Given something goes wrong on this journey
    When I run `pnpm run not-a-real-script-zz`
    Then the error is non-blaming and actionable
    And evidence of what I saw is stored under evidence/
