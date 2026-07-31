@optimizexp @ax @dx @persona:protocol-native-coding-agent @interface:cli
Feature: Protocol-native agent readiness (protocol native coding agent)
  As protocol-native-coding-agent
  I want human-free auth, no-elicitation iterate, self-improve lessons, and MCP/ACP inventory
  So that I operate hobo-code unattended without browser or TTY prompts

  Background:
    Given persona "protocol-native-coding-agent" is active
    And feature "hobo-code-agent-native" is under optimizexp review

  Scenario: Agent inventory shows MCP ACP and unattended contract for protocol-native-coding-agent
    Given I am on the critical path described by the feature seed
    When I exercise the surface as this persona would
    Then I receive clear status about what happened
    And the next action is obvious without tribal knowledge
    And evidence is capturable for this scenario

  Scenario: Agent JSON exposes human-free auth and tools for protocol-native-coding-agent
    Given I am on the critical path described by the feature seed
    When I observe agent JSON as this persona
    Then I receive clear status about what happened
    And evidence is capturable for this scenario

  Scenario: Auth login agent is human-free for protocol-native-coding-agent
    Given I am on the critical path described by the feature seed
    When I run auth login agent as this persona
    Then I receive clear status about what happened
    And evidence is capturable for this scenario

  Scenario: Agent help names protocols for protocol-native-coding-agent
    Given I am on the critical path described by the feature seed
    When I read agent help as this persona
    Then I receive clear status about what happened
    And evidence is capturable for this scenario
