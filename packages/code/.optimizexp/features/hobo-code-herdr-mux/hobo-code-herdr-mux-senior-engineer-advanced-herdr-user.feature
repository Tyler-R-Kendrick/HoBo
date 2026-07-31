@optimizexp @ux @dx @persona:senior-engineer-advanced-herdr-user @interface:cli
Feature: Herdr multiplexer panes detach highlight-copy session persistence (senior engineer advanced herdr user)
  As senior engineer advanced herdr user
  I want Herdr-style multi-pane status, detachable sessions, highlight-to-copy, and durable handback
  So that hobo-code feels like a designer-aware harness multiplexer, not a single-stream agent CLI

  Background:
    Given persona "senior-engineer-advanced-herdr-user" is active
    And feature "hobo-code-herdr-mux" is under optimizexp review

  Scenario: Status shows herdr capability footer and pane mux for senior-engineer-advanced-herdr-user
    Given I am on the critical path described by the feature seed
    When I exercise the surface as this persona would
    Then I receive clear status about what happened
    And the next action is obvious without tribal knowledge
    And evidence is capturable for this scenario

  Scenario: Status and session JSON expose herdr flags and persistence for senior-engineer-advanced-herdr-user
    Given I am on the critical path described by the feature seed
    When I observe herdr JSON surfaces as this persona
    Then herdr capabilities and persistence are machine-readable
    And evidence is capturable for this scenario

  Scenario: Help lists herdr differentiators for senior-engineer-advanced-herdr-user
    Given I am on the critical path described by the feature seed
    When I read herdr help as this persona
    Then help names herdr mux highlight-copy and persistence
    And evidence is capturable for this scenario
