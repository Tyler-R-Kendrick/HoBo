@optimizexp @dx @persona:developer @interface:cli
Feature: hobo-code commands and feedback are intuitive: clear usage, honest success/fail, (developer)
  As developer
  I want hobo-code commands and feedback are intuitive: clear usage, honest success/fail, next steps
  So that harms, friction, and uncertainty stay low on my critical path

  # Generated for persona "developer". Agent should refine steps to match
  # .optimizexp/personas/developer.md vocabulary and failure modes.
  # Scenario names are stable evidence keys (slugified).

  Background:
    Given persona "developer" is active
    And feature "hobo-code-cli-intuitive-feedback" is under optimizexp review

  Scenario: hobo-code commands and feedback are intuitive: clear usage, honest success/fail, works for developer
    Given I am on the critical path described by the feature seed
    When I exercise the surface as this persona would
    Then I receive clear status about what happened
    And the next action is obvious without tribal knowledge
    And evidence is capturable for this scenario

  Scenario: hobo-code commands and feedback are intuitive: clear usage, honest success/fail, failure is understandable for developer
    Given something goes wrong on this journey
    When I observe the failure as this persona
    Then the error is non-blaming and actionable
    And I am not forced into repeated artificial hurdles
    And evidence of what I saw is stored under evidence/
