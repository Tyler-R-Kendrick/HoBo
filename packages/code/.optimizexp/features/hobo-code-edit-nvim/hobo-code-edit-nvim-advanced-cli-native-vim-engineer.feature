@optimizexp @ux @dx @persona:advanced-cli-native-vim-engineer @interface:cli
Feature: CLI-native vim neovim managed pane bridge (advanced cli native vim engineer)
  As advanced-cli-native-vim-engineer
  I want hobo-code edit to open neovim in a managed harness pane with a real bridge
  So that editing feels like part of the terminal harness not a detached GUI

  Background:
    Given persona "advanced-cli-native-vim-engineer" is active
    And feature "hobo-code-edit-nvim" is under optimizexp review

  Scenario: Edit shows nvim bridge and managed pane for advanced-cli-native-vim-engineer
    Given I am on the critical path described by the feature seed
    When I exercise the surface as this persona would
    Then I receive clear status about what happened
    And the next action is obvious without tribal knowledge
    And evidence is capturable for this scenario

  Scenario: Edit JSON exposes bridges and extension for advanced-cli-native-vim-engineer
    Given I am on the critical path described by the feature seed
    When I observe edit JSON as this persona
    Then editor bridge contract is machine-readable
    And evidence is capturable for this scenario

  Scenario: Help names edit and neovim for advanced-cli-native-vim-engineer
    Given I am on the critical path described by the feature seed
    When I read edit help as this persona
    Then help names edit and nvim
    And evidence is capturable for this scenario
