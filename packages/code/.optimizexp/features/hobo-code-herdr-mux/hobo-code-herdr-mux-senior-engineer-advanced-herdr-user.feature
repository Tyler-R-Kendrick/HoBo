@optimizexp @dx @ux @persona:senior-engineer-advanced-herdr-user @interface:cli
Feature: hobo-code-herdr-mux (senior engineer advanced herdr user)
  As senior engineer advanced herdr user
  I want a real product path I can exercise and capture
  So that review scores come from evidence, not template vibes

  Background:
    Given persona "senior-engineer-advanced-herdr-user" is active
    And feature "hobo-code-herdr-mux" is under optimizexp review

  Scenario: Resident session controls are discoverable for senior-engineer-advanced-herdr-user
    Given I am on the critical path described by the feature seed
    When I run `pnpm --filter @hobo/code exec node --import tsx src/bin/hobo-code.ts session --help`
    Then I see resident session, tab, pane, agent, checkpoint, delivery, and browser controls
    And detach and reattach are explicit without tribal knowledge
    And evidence is capturable for this scenario

  Scenario: Failure is actionable for senior-engineer-advanced-herdr-user
    Given something goes wrong on this journey
    When I run `hobo-code session show missing-session`
    Then the error is non-blaming and actionable
    And evidence of what I saw is stored under evidence/

  Scenario: Browser control stays local and usable for senior-engineer-advanced-herdr-user
    Given the loopback session control server is running with its bearer token
    When I open its authenticated browser URL
    Then I can create, list, reattach, detach, stop, focus, and prompt resident sessions
    And the page explains remote access through Station forwarding without binding publicly
    And evidence is capturable for this scenario
