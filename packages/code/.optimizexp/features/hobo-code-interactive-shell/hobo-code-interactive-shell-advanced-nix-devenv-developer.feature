@optimizexp @ux @dx @persona:advanced-nix-devenv-developer @interface:tui
Feature: HoBo interactive shell craft (advanced-nix-devenv-developer)
  As advanced-nix-devenv-developer
  I want bare hobo-code to be an inhabited HoBo product shell
  So that I never see stock Pi as the product frame

  Background:
    Given persona "advanced-nix-devenv-developer" is active
    And feature "hobo-code-interactive-shell" is under optimizexp review

  Scenario: Shell frame claims HoBo identity with Bo present for advanced-nix-devenv-developer
    Given I am on the critical path described by the feature seed
    When I render the InteractiveShell initial frame
    Then the frame identifies engine hobo-shell
    And branding is confined to the about surface not sprayed on frames
    And the frame includes a prompt affordance
    And evidence is capturable for this scenario

  Scenario: Slash palette lists primary journeys for advanced-nix-devenv-developer
    Given I am on the critical path described by the feature seed
    When I open the InteractiveShell slash palette
    Then I see guide config cost and tasks entries
    And evidence is capturable for this scenario

  Scenario: Tab focus shows tasks and status panes for advanced-nix-devenv-developer
    Given I am on the critical path described by the feature seed
    When I cycle InteractiveShell focus with Tab
    Then I see tasks then status content
    And evidence is capturable for this scenario

  Scenario: One-shot help still orients outside the shell for advanced-nix-devenv-developer
    Given I am on the critical path described by the feature seed
    When I run `hobo-code help`
    Then help groups Start here and plain-by-default orientation
    And evidence is capturable for this scenario
