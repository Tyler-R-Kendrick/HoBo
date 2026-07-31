@optimizexp @dx @ax @persona:role-sre @interface:cli
Feature: narrow-local-validation (role sre)
  As role sre
  I want a real product path I can exercise and capture
  So that review scores come from evidence, not template vibes

  Background:
    Given persona "role-sre" is active
    And feature "narrow-local-validation" is under optimizexp review

  Scenario: Primary path works for role-sre
    Given I am on the critical path described by the feature seed
    When I run `pnpm run agent:check -- --staged`
    Then I see product chrome or structured status for this surface
    And the next action is obvious without tribal knowledge
    And evidence is capturable for this scenario

  Scenario: Help or status remains usable for role-sre
    Given I am on the critical path described by the feature seed
    When I run `pnpm --help`
    Then help lists verbs or usage or the surface documents next steps
    And evidence is capturable for this scenario

  Scenario: Failure is actionable for role-sre
    Given something goes wrong on this journey
    When I run `pnpm run not-a-real-script-zz`
    Then the error is non-blaming and actionable
    And evidence of what I saw is stored under evidence/
