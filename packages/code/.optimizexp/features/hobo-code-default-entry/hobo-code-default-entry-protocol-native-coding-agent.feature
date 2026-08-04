@optimizexp @dx @ax @persona:protocol-native-coding-agent @interface:tui
Feature: Cold-start bare TTY hobo-code chat discoverability: `hobo-code` (protocol native coding agent)
  As protocol native coding agent
  I want a real product path I can exercise and capture
  So that review scores come from evidence, not template vibes

  Background:
    Given persona "protocol-native-coding-agent" is active
    And feature "hobo-code-default-entry" is under optimizexp review

  Scenario: Cold-start bare TTY shows product discoverability for protocol-native-coding-agent
    Given I am on the critical path described by the feature seed
    When I start bare TTY `hobo-code`
    Then stdout or session chrome mentions hobo-code or product discoverability
    And I do not only see stock third-party agent branding
    And evidence is capturable for this scenario

  Scenario: In-session slash or verbs path is discoverable for protocol-native-coding-agent
    Given I am on the critical path described by the feature seed
    When I run slash command `/verbs` or one-shot `hobo-code help`
    Then I see product verbs or slash command map
    And evidence is capturable for this scenario

  Scenario: Help one-shot lists verbs for protocol-native-coding-agent
    Given I am on the critical path described by the feature seed
    When I run `hobo-code help`
    Then help lists verbs or usage
    And the next action is obvious without tribal knowledge
    And evidence is capturable for this scenario
