@optimizexp @dx @ax @persona:product-coding-agent @interface:cli
Feature: cli-product hobo-code CLI help, JSON envelope, and failure honesty
  As product coding agent
  I want the real `hobo-code` binary to expose verbs, examples, and machine envelopes
  So that I can drive it unattended and parse failures deterministically

  Background:
    Given persona "product-coding-agent" is active
    And feature "cli-product" is under optimizexp review

  Scenario: hobo-code --help lists its verbs
    When I run the hobo-code CLI with arguments "--help"
    Then the exit code is 0
    And stdout contains "dispatch"
    And stdout contains "guide"
    And stdout contains "harness"
    And stdout contains "scaffold"
    And evidence is capturable for this scenario

  Scenario: hobo-code auth --help shows usage and flags
    When I run the hobo-code CLI with arguments "auth --help"
    Then the exit code is 0
    And stdout contains "hobo-code auth login"
    And stdout contains "--agent"
    And stdout contains "--tenant"
    And evidence is capturable for this scenario

  Scenario: hobo-code cost --help shows usage and examples
    When I run the hobo-code CLI with arguments "cost --help"
    Then the exit code is 0
    And stdout contains "hobo-code cost"
    And stdout contains "--json"
    And stdout contains "$0"
    And evidence is capturable for this scenario

  Scenario: hobo-code --json emits the standard envelope shape
    When I run the hobo-code CLI with arguments "status --json"
    Then the exit code is 0
    And the stdout is a JSON envelope with the standard shape
    And the JSON envelope on stdout has "ok" equal to "true"
    And the JSON envelope on stdout has "code" equal to "HOBO_CODE_STATUS"
    And evidence is capturable for this scenario

  Scenario: unknown hobo-code verb fails non-zero with remediation
    When I run the hobo-code CLI with arguments "notaverb-zz --json"
    Then the exit code is 1
    And the JSON envelope on stdout has "ok" equal to "false"
    And the JSON envelope on stdout has "code" equal to "HOBO_CODE_UNKNOWN_VERB"
    And the JSON envelope on stdout has a non-empty "remediation" array
    And evidence is capturable for this scenario

  Scenario: unknown hobo-code flag is rejected with a non-zero exit
    When I run the hobo-code CLI with arguments "status --bogusflag-zz --json"
    Then the exit code is 1
    And the JSON envelope on stdout has "ok" equal to "false"
    And the JSON envelope on stdout has "code" equal to "HOBO_CODE_UNKNOWN_FLAG"
    And evidence is capturable for this scenario
