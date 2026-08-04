@optimizexp @dx @ux @persona:cost-conscious-open-source-dev @interface:cli
Feature: hobo-code-config-setup (cost conscious open source dev)
  As cost conscious open source dev
  I want a real product path I can exercise and capture
  So that review scores come from evidence, not template vibes

  Background:
    Given persona "cost-conscious-open-source-dev" is active
    And feature "hobo-code-config-setup" is under optimizexp review

  Scenario: Primary path works for cost-conscious-open-source-dev
    Given I am on the critical path described by the feature seed
    When I run `pnpm --filter @hobo/code exec node --import tsx src/bin/hobo-code.ts config`
    Then I see product chrome or structured status for this surface
    And the next action is obvious without tribal knowledge
    And evidence is capturable for this scenario

  Scenario: Help or status remains usable for cost-conscious-open-source-dev
    Given I am on the critical path described by the feature seed
    When I run `pnpm --help`
    Then help lists verbs or usage or the surface documents next steps
    And evidence is capturable for this scenario

  Scenario: Failure is actionable for cost-conscious-open-source-dev
    Given something goes wrong on this journey
    When I run `pnpm run not-a-real-script-zz`
    Then the error is non-blaming and actionable
    And evidence of what I saw is stored under evidence/
