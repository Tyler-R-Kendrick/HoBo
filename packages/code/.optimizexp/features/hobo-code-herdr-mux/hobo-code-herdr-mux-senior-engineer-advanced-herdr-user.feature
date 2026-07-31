@optimizexp @dx @ux @persona:senior-engineer-advanced-herdr-user @interface:cli
Feature: hobo-code-herdr-mux (senior engineer advanced herdr user)
  As senior engineer advanced herdr user
  I want a real product path I can exercise and capture
  So that review scores come from evidence, not template vibes

  Background:
    Given persona "senior-engineer-advanced-herdr-user" is active
    And feature "hobo-code-herdr-mux" is under optimizexp review

  Scenario: Primary path works for senior-engineer-advanced-herdr-user
    Given I am on the critical path described by the feature seed
    When I run `pnpm --filter @hobo/code exec node --import tsx src/bin/hobo-code.ts status`
    Then I see product chrome or structured status for this surface
    And the next action is obvious without tribal knowledge
    And evidence is capturable for this scenario

  Scenario: Help or status remains usable for senior-engineer-advanced-herdr-user
    Given I am on the critical path described by the feature seed
    When I run `pnpm --help`
    Then help lists verbs or usage or the surface documents next steps
    And evidence is capturable for this scenario

  Scenario: Failure is actionable for senior-engineer-advanced-herdr-user
    Given something goes wrong on this journey
    When I run `pnpm run not-a-real-script-zz`
    Then the error is non-blaming and actionable
    And evidence of what I saw is stored under evidence/
