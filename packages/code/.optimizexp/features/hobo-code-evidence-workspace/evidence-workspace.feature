@optimizexp @evidence @replay @persona:senior-engineer @interface:web
Feature: Development evidence stays beside the running application
  As a senior engineer supervising coding agents
  I want one factual report, overlay, and replay timeline
  So I can inspect progress and request changes without trusting a prose claim

  Scenario: Current development state is readable as a live and portable report
    Given a resident hobo-code session is running
    When I open its evidence report
    Then session and Git facts are distinguished from missing evidence
    And the portable export has no live mutation controls

  Scenario: The application overlay keeps privileged controls isolated
    Given the control plane and development app use separate origins
    When I open the HoBo evidence desk
    Then I can capture, annotate, inspect the report, replay, and request an edit
    And the development app receives no control credential

  Scenario: Agent debug replay is observable and read-only by default
    Given browser, terminal, agent, Git, test, annotation, and approval tracks
    When I inspect a resident session replay
    Then hidden reasoning and secrets are absent
    And continuing work requires a new checkpoint-backed session
