@optimizexp @ux @dx @persona:claude-code-advanced-app-builder @interface:cli
Feature: Claude Code plain English guide (claude code advanced app builder)
  As claude-code-advanced-app-builder
  I want a plain-English map from Claude Code SOTA features to hobo-code
  So that I can build apps without traditional developer tribal knowledge

  Background:
    Given persona "claude-code-advanced-app-builder" is active
    And feature "hobo-code-claude-guide" is under optimizexp review

  Scenario: Guide shows Claude Code map and happy path for claude-code-advanced-app-builder
    Given I am on the critical path described by the feature seed
    When I exercise the surface as this persona would
    Then I receive clear status about what happened
    And the next action is obvious without tribal knowledge
    And evidence is capturable for this scenario

  Scenario: Guide JSON exposes map statuses and residual for claude-code-advanced-app-builder
    Given I am on the critical path described by the feature seed
    When I observe guide JSON as this persona
    Then claude code map is machine-readable
    And evidence is capturable for this scenario

  Scenario: Help points Claude Code builders to guide for claude-code-advanced-app-builder
    Given I am on the critical path described by the feature seed
    When I read claude guide help as this persona
    Then help names Claude Code and guide
    And evidence is capturable for this scenario
