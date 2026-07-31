@optimizexp @dx @persona:role-finops @interface:web
Feature: CLI help and doctor path (role finops)
  As role finops
  I want A developer or agent runs the HoBo CLI help/doctor (or equivalent) and gets actionable status without live cloud credentials.
  So that harms, friction, and uncertainty stay low on my critical path

  # Generated for persona "role-finops". Agent should refine steps to match
  # .optimizexp/personas/role-finops.md vocabulary and failure modes.
  # Scenario names are stable evidence keys (slugified).

  Background:
    Given persona "role-finops" is active
    And feature "cli-help-and-doctor" is under optimizexp review

  Scenario: CLI help and doctor path works for role-finops
    Given I am on the critical path described by the feature seed
    When I exercise the surface as this persona would
    Then I receive clear status about what happened
    And the next action is obvious without tribal knowledge
    And evidence is capturable for this scenario

  Scenario: CLI help and doctor path failure is understandable for role-finops
    Given something goes wrong on this journey
    When I observe the failure as this persona
    Then the error is non-blaming and actionable
    And I am not forced into repeated artificial hurdles
    And evidence of what I saw is stored under evidence/
