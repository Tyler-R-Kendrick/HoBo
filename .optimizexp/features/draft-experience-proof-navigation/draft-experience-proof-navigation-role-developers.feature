@optimizexp @dx @ax @persona:role-developers @interface:cli
Feature: draft-experience-proof-navigation (role developers)
  As role developers
  I want a real product path I can exercise and capture
  So that review scores come from evidence, not template vibes

  Background:
    Given persona "role-developers" is active
    And feature "draft-experience-proof-navigation" is under optimizexp review

  Scenario: Primary path works for role-developers
    Given I am on the critical path described by the feature seed
    When I run `bash -lc 'test -f src/draft/exp-proofs/_classification.md && ls src/draft/exp-proofs && head -n 40 src/draft/exp-proofs/_classification.md'`
    Then I see product chrome or structured status for this surface
    And the next action is obvious without tribal knowledge
    And evidence is capturable for this scenario

  Scenario: Help or status remains usable for role-developers
    Given I am on the critical path described by the feature seed
    When I run `bash --help`
    Then help lists verbs or usage or the surface documents next steps
    And evidence is capturable for this scenario

  Scenario: Failure is actionable for role-developers
    Given something goes wrong on this journey
    When I run `bash --not-a-real-flag-zz`
    Then the error is non-blaming and actionable
    And evidence of what I saw is stored under evidence/
