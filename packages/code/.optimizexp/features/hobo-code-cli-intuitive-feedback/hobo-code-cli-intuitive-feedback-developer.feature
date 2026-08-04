@optimizexp @dx @persona:developer @interface:cli
Feature: hobo-code-cli-intuitive-feedback (developer)
  As developer
  I want a real product path I can exercise and capture
  So that review scores come from evidence, not template vibes

  Background:
    Given persona "developer" is active
    And feature "hobo-code-cli-intuitive-feedback" is under optimizexp review

  Scenario: Primary path works for developer
    Given I am on the critical path described by the feature seed
    When I run `pnpm --filter @hobo/code exec node --import tsx src/bin/hobo-code.ts help`
    Then I see product chrome or structured status for this surface
    And the next action is obvious without tribal knowledge
    And evidence is capturable for this scenario

  Scenario: Help or status remains usable for developer
    Given I am on the critical path described by the feature seed
    When I run `pnpm --filter @hobo/code exec node --import tsx src/bin/hobo-code.ts status`
    Then help lists verbs or usage or the surface documents next steps
    And evidence is capturable for this scenario

  Scenario: Failure is actionable for developer
    Given something goes wrong on this journey
    When I run `pnpm --filter @hobo/code exec node --import tsx src/bin/hobo-code.ts not-a-verb-zz`
    Then the error is non-blaming and actionable
    And evidence of what I saw is stored under evidence/
