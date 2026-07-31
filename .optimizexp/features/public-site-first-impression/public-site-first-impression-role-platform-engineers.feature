@optimizexp @ux @persona:role-platform-engineers @interface:cli
Feature: public-site-first-impression (role platform engineers)
  As role platform engineers
  I want a real product path I can exercise and capture
  So that review scores come from evidence, not template vibes

  Background:
    Given persona "role-platform-engineers" is active
    And feature "public-site-first-impression" is under optimizexp review

  Scenario: Primary path works for role-platform-engineers
    Given I am on the critical path described by the feature seed
    When I run `pnpm run docs:site-nav`
    Then I see product chrome or structured status for this surface
    And the next action is obvious without tribal knowledge
    And evidence is capturable for this scenario

  Scenario: Help or status remains usable for role-platform-engineers
    Given I am on the critical path described by the feature seed
    When I run `pnpm --help`
    Then help lists verbs or usage or the surface documents next steps
    And evidence is capturable for this scenario

  Scenario: Failure is actionable for role-platform-engineers
    Given something goes wrong on this journey
    When I run `pnpm run not-a-real-script-zz`
    Then the error is non-blaming and actionable
    And evidence of what I saw is stored under evidence/
