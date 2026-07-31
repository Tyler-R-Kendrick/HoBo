@optimizexp @ux @dx @persona:ai-automation-engineer-pi-flue @interface:cli
Feature: Config setup inventory for harness-pi-flue stack (ai automation engineer pi flue)
  As ai-automation-engineer-pi-flue
  I want hobo-code config to surface MCP, AGENTS.md/skills, model, and secure sandbox knobs
  So that Pi/Flue dual-harness setup is auditable in one place

  Background:
    Given persona "ai-automation-engineer-pi-flue" is active
    And feature "hobo-code-config-setup" is under optimizexp review

  Scenario: Config shows harness knobs for ai-automation-engineer-pi-flue
    Given I am on the critical path described by the feature seed
    When I exercise the surface as this persona would
    Then I receive clear status about what happened
    And the next action is obvious without tribal knowledge
    And evidence is capturable for this scenario

  Scenario: Config JSON exposes byStack harness-pi-flue for ai-automation-engineer-pi-flue
    Given I am on the critical path described by the feature seed
    When I observe config JSON as this persona
    Then I receive clear status about what happened
    And evidence is capturable for this scenario
