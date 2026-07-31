@optimizexp @ax @dx @persona:product-platform-engineer @interface:cli
Feature: agent-tooling-setup (product platform engineer)
  As product platform engineer
  I want a real product path I can exercise and capture
  So that review scores come from evidence, not template vibes

  Background:
    Given persona "product-platform-engineer" is active
    And feature "agent-tooling-setup" is under optimizexp review

  Scenario: Primary path works for product-platform-engineer
    Given I am on the critical path described by the feature seed
    When I run `bash scripts/setup-agent-tools.sh --help`
    Then I see product chrome or structured status for this surface
    And the next action is obvious without tribal knowledge
    And evidence is capturable for this scenario

  Scenario: Help or status remains usable for product-platform-engineer
    Given I am on the critical path described by the feature seed
    When I run `bash scripts/setup-agent-tools.sh --help`
    Then help lists verbs or usage or the surface documents next steps
    And evidence is capturable for this scenario

  Scenario: Failure is actionable for product-platform-engineer
    Given something goes wrong on this journey
    When I run `bash --not-a-real-flag-zz`
    Then the error is non-blaming and actionable
    And evidence of what I saw is stored under evidence/
