@optimizexp @ux @dx @persona:advanced-cli-native-vim-engineer @interface:cli
Feature: Config setup inventory for editor-vim stack (advanced cli native vim engineer)
  As advanced-cli-native-vim-engineer
  I want hobo-code config --stack editor-vim to list EDITOR, nvim/tmux PATH, and hobo-code.nvim
  So that CLI-native setup does not assume a GUI IDE

  Background:
    Given persona "advanced-cli-native-vim-engineer" is active
    And feature "hobo-code-config-setup" is under optimizexp review

  Scenario: Config shows editor-vim stack for advanced-cli-native-vim-engineer
    Given I am on the critical path described by the feature seed
    When I exercise the surface as this persona would
    Then I receive clear status about what happened
    And the next action is obvious without tribal knowledge
    And evidence is capturable for this scenario

  Scenario: Config help names stacks for advanced-cli-native-vim-engineer
    Given I am on the critical path described by the feature seed
    When I read config help as this persona
    Then I receive clear status about what happened
    And evidence is capturable for this scenario

  Scenario: Unknown stack fails with hints for advanced-cli-native-vim-engineer
    Given something goes wrong on this journey
    When I observe the failure as this persona
    Then the error is non-blaming and actionable
    And evidence of what I saw is stored under evidence/
