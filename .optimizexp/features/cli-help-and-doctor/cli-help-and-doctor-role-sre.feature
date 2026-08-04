@optimizexp @dx @ax @persona:role-sre @interface:cli
Feature: cli-help-and-doctor (role sre)
  As role sre
  I want real hobo help/doctor output I can exercise and capture
  So that review scores come from evidence, not template vibes

  Background:
    Given persona "role-sre" is active
    And feature "cli-help-and-doctor" is under optimizexp review

  Scenario: hobo --help lists the doctor verb for role-sre
    When I run the hobo CLI with arguments "--help"
    Then the exit code is 0
    And stdout contains "Canonical verbs:"
    And stdout contains "doctor"
    And stdout contains "Report environment and portability hazards"
    And evidence is capturable for this scenario

  # KD-4 resolved: packages/hobo builds again; the composed CLI serves the
  # real doctor report. Asserts the hermetic offline path (no live cloud).
  Scenario: hobo doctor returns the real report for role-sre
    When I run the composed hobo CLI with arguments "doctor --offline --json"
    Then the exit code is 0
    And the stdout is a JSON envelope with the standard shape
    And the JSON envelope on stdout has "verb" equal to "doctor"
    And evidence is capturable for this scenario
