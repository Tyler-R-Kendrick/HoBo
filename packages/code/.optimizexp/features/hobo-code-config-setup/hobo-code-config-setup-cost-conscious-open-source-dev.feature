@optimizexp @ux @dx @persona:cost-conscious-open-source-dev @interface:cli
Feature: Config setup inventory for cost-budget stack (cost conscious open source dev)
  As cost-conscious-open-source-dev
  I want hobo-code config --stack cost-budget to audit mon=0, budget, free-local models
  So that I can verify $0 readiness without grepping source or leaking keys

  Background:
    Given persona "cost-conscious-open-source-dev" is active
    And feature "hobo-code-config-setup" is under optimizexp review

  Scenario: Config shows cost-budget stack for cost-conscious-open-source-dev
    Given I am on the critical path described by the feature seed
    When I exercise the surface as this persona would
    Then I receive clear status about what happened
    And the next action is obvious without tribal knowledge
    And evidence is capturable for this scenario

  Scenario: Config JSON never leaks secrets for cost-conscious-open-source-dev
    Given I am on the critical path described by the feature seed
    When I observe config JSON as this persona
    Then I receive clear status about what happened
    And evidence is capturable for this scenario

  Scenario: Unknown stack fails with hints for cost-conscious-open-source-dev
    Given something goes wrong on this journey
    When I observe the failure as this persona
    Then the error is non-blaming and actionable
    And I am not forced into repeated artificial hurdles
    And evidence of what I saw is stored under evidence/
