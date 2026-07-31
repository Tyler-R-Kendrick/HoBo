@optimizexp @ux @dx @persona:cost-conscious-open-source-dev @interface:cli
Feature: Zero dollar free-local cost savings (cost conscious open source dev)
  As cost-conscious-open-source-dev
  I want budget visibility, $0 free/local recipes, savings, and cheapest-capable routing
  So that I can run hobo-code without paying for tokens

  Background:
    Given persona "cost-conscious-open-source-dev" is active
    And feature "hobo-code-cost-zero" is under optimizexp review

  Scenario: Cost shows savings and zero dollar path for cost-conscious-open-source-dev
    Given I am on the critical path described by the feature seed
    When I exercise the surface as this persona would
    Then I receive clear status about what happened
    And the next action is obvious without tribal knowledge
    And evidence is capturable for this scenario

  Scenario: Cost JSON exposes freeLocal routing and token tools for cost-conscious-open-source-dev
    Given I am on the critical path described by the feature seed
    When I observe cost JSON as this persona
    Then cost free local and savings are machine-readable
    And evidence is capturable for this scenario

  Scenario: Help and models name zero dollar path for cost-conscious-open-source-dev
    Given I am on the critical path described by the feature seed
    When I read cost help as this persona
    Then help names cost and free local
    And evidence is capturable for this scenario
