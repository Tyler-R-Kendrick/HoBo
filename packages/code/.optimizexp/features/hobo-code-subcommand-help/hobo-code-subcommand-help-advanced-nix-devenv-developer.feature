@optimizexp @dx @ux @persona:advanced-nix-devenv-developer @interface:cli
Feature: hobo-code-subcommand-help (advanced nix devenv developer)
  As advanced nix devenv developer
  I want a real product path I can exercise and capture
  So that review scores come from evidence, not template vibes

  Background:
    Given persona "advanced-nix-devenv-developer" is active
    And feature "hobo-code-subcommand-help" is under optimizexp review

  Scenario: Primary path works for advanced-nix-devenv-developer
    Given I am on the critical path described by the feature seed
    When I run `hobo-code help`
    Then I see product chrome or structured status for this surface
    And the next action is obvious without tribal knowledge
    And evidence is capturable for this scenario

  Scenario: Help or status remains usable for advanced-nix-devenv-developer
    Given I am on the critical path described by the feature seed
    When I run `hobo-code help`
    Then help lists verbs or usage or the surface documents next steps
    And evidence is capturable for this scenario

  Scenario: Failure is actionable for advanced-nix-devenv-developer
    Given something goes wrong on this journey
    When I run `hobo-code not-a-real-verb-zz`
    Then the error is non-blaming and actionable
    And evidence of what I saw is stored under evidence/
