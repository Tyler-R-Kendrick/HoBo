@optimizexp @ux @dx @persona:advanced-nix-devenv-developer @interface:cli
Feature: hobo-code hermetic + durable isolation (advanced nix devenv developer)
  As advanced nix devenv developer
  I want hermetic shell detection and pure sandbox vs durable layout
  So that hobo-code feels like a well-behaved nix terminal without monorepo Nix bloat

  Background:
    Given persona "advanced-nix-devenv-developer" is active
    And feature "hobo-code-hermetic-durable" is under optimizexp review

  Scenario: env detects devenv markers and durable layout for advanced-nix-devenv-developer
    Given I am on the critical path described by the feature seed
    When I exercise the surface as this persona would
    Then I receive clear status about what happened
    And the next action is obvious without tribal knowledge
    And evidence is capturable for this scenario

  Scenario: isolate keeps durable root outside sandbox for advanced-nix-devenv-developer
    Given something goes wrong on this journey
    When I observe the failure as this persona
    Then the error is non-blaming and actionable
    And I am not forced into repeated artificial hurdles
    And evidence of what I saw is stored under evidence/
