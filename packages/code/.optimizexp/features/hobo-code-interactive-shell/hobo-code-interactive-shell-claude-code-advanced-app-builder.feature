@optimizexp @ux @dx @persona:claude-code-advanced-app-builder @interface:tui
Feature: HoBo interactive shell craft (claude-code-advanced-app-builder)
  As claude-code-advanced-app-builder
  I want bare hobo-code to be an inhabited HoBo product shell
  So that I never see stock Pi as the product frame

  Background:
    Given persona "claude-code-advanced-app-builder" is active
    And feature "hobo-code-interactive-shell" is under optimizexp review

  Scenario: Shell frame claims HoBo identity with Bo present for claude-code-advanced-app-builder
    Given I am on the critical path described by the feature seed
    When I render the InteractiveShell initial frame
    Then the frame identifies engine hobo-shell
    And branding is confined to the about surface not sprayed on frames
    And the frame includes a prompt affordance
    And evidence is capturable for this scenario

  Scenario: Slash palette lists primary journeys for claude-code-advanced-app-builder
    Given I am on the critical path described by the feature seed
    When I open the InteractiveShell slash palette
    Then I see guide config cost and tasks entries
    And evidence is capturable for this scenario

  Scenario: Tab focus shows tasks and status panes for claude-code-advanced-app-builder
    Given I am on the critical path described by the feature seed
    When I cycle InteractiveShell focus with Tab
    Then I see tasks then status content
    And evidence is capturable for this scenario

  Scenario: One-shot help still orients outside the shell for claude-code-advanced-app-builder
    Given I am on the critical path described by the feature seed
    When I run `hobo-code help`
    Then help groups Start here and plain-by-default orientation
    And evidence is capturable for this scenario
