@optimizexp @ux @dx @persona:new-gen-ai-native-grok-build-user @interface:cli
Feature: Grok Build parity click tasks workflows (new gen ai native grok build user)
  As new-gen-ai-native-grok-build-user
  I want clickable TUI language, a tasks board, and workflow discoverability like Grok Build
  So that hobo-code meets my AI-native expectations without control-plane bloat

  Background:
    Given persona "new-gen-ai-native-grok-build-user" is active
    And feature "hobo-code-grok-build-parity" is under optimizexp review

  Scenario: Tasks board shows grok-build legend for new-gen-ai-native-grok-build-user
    Given I am on the critical path described by the feature seed
    When I exercise the surface as this persona would
    Then I receive clear status about what happened
    And the next action is obvious without tribal knowledge
    And evidence is capturable for this scenario

  Scenario: Tasks JSON exposes clickable workflows compare for new-gen-ai-native-grok-build-user
    Given I am on the critical path described by the feature seed
    When I observe tasks JSON as this persona
    Then grok build parity card is machine-readable
    And evidence is capturable for this scenario

  Scenario: Help lists Grok Build differentiators for new-gen-ai-native-grok-build-user
    Given I am on the critical path described by the feature seed
    When I read grok build help as this persona
    Then help names Grok Build tasks and workflows
    And evidence is capturable for this scenario
