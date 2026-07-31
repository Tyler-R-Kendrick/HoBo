@optimizexp @ux @dx @persona:cursor-power-user @interface:cli
Feature: Cursor power-user guide map (cursor power user)
  As cursor-power-user
  I want a plain-English map from Cursor Agent/Composer/Background/BugBot to hobo-code
  So that I can use the CLI without losing my Cursor mental model

  Background:
    Given persona "cursor-power-user" is active
    And feature "hobo-code-cursor-guide" is under optimizexp review

  Scenario: Guide cursor shows Agent Composer Background BugBot map for cursor-power-user
    Given I am on the critical path described by the feature seed
    When I exercise the surface as this persona would
    Then I receive clear status about what happened
    And the next action is obvious without tribal knowledge
    And evidence is capturable for this scenario

  Scenario: Guide cursor JSON exposes map statuses for cursor-power-user
    Given I am on the critical path described by the feature seed
    When I observe cursor guide JSON as this persona
    Then cursor map is machine-readable
    And evidence is capturable for this scenario

  Scenario: Help points Cursor users to guide cursor for cursor-power-user
    Given I am on the critical path described by the feature seed
    When I read cursor guide help as this persona
    Then help names Cursor and guide cursor
    And evidence is capturable for this scenario
