@optimizexp @ux @dx @persona:sota-frontier-ai-native-tui-designer @interface:tui
Feature: AI-native TUI craft for GUI-native humans (sota frontier ai native tui designer)
  As sota-frontier-ai-native-tui-designer
  I want bare TTY and help/status chrome to feel inhabited, kind, and hierarchical
  So that GUI-native users never feel stupid in the first ten seconds

  Background:
    Given persona "sota-frontier-ai-native-tui-designer" is active
    And feature "hobo-code-tui-craft" is under optimizexp review

  Scenario: Help hierarchy is plain and scannable for sota-frontier-ai-native-tui-designer
    Given I am on the critical path described by the feature seed
    When I run `hobo-code help`
    Then help lists verbs with human roles not only glyphs
    And First run or orientation guidance is visible without --dense
    And evidence is capturable for this scenario

  Scenario: Status chrome shows calm hierarchy for sota-frontier-ai-native-tui-designer
    Given I am on the critical path described by the feature seed
    When I run `hobo-code status`
    Then I see product chrome or structured status for this surface
    And the next action is obvious without tribal knowledge
    And evidence is capturable for this scenario

  Scenario: Brand discoverability language rejects stock-agent identity for sota-frontier-ai-native-tui-designer
    Given I am on the critical path described by the feature seed
    When I run `hobo-code help`
    Then output or product language orients to hobo-code not only third-party agent defaults
    And evidence is capturable for this scenario

  Scenario: Failure is kind and specific for sota-frontier-ai-native-tui-designer
    Given something goes wrong on this journey
    When I run `hobo-code not-a-real-verb-zz`
    Then the error is non-blaming and actionable
    And evidence of what I saw is stored under evidence/

  Scenario: Idle shell writes nothing without motion for sota-frontier-ai-native-tui-designer
    Given I am on the critical path described by the feature seed
    When I run `HOBO_CODE_REDUCED_MOTION=1 HOBO_CODE_ENGINE=none hobo-code`
    Then the shell paints once and idle rest spans request no repaints
    And reduced motion renders the static rest frame not an animation
    And evidence is capturable for this scenario

  Scenario: Animation stays within the flicker budget for sota-frontier-ai-native-tui-designer
    Given I am on the critical path described by the feature seed
    When I run `HOBO_CODE_ENGINE=none hobo-code`
    Then repaints happen only when the sprite frame changes with no full-screen erases
    And a real TUI recording backs the claim with firstOutputUnderMs and maxSilentGapUnderMs budgets
    And evidence of what I saw is stored under evidence/
