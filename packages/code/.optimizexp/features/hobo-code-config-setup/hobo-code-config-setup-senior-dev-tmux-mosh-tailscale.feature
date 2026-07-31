@optimizexp @ux @dx @persona:senior-dev-tmux-mosh-tailscale @interface:cli
Feature: Config setup inventory for remote-attach stack (senior dev tmux mosh tailscale)
  As senior-dev-tmux-mosh-tailscale
  I want hobo-code config to list attach-related knobs (tmux PATH, HOBO_HOME, tenant/project)
  So that remote dev-terminal setup is discoverable without platform admin verbs

  Background:
    Given persona "senior-dev-tmux-mosh-tailscale" is active
    And feature "hobo-code-config-setup" is under optimizexp review

  Scenario: Config shows remote/core knobs for senior-dev-tmux-mosh-tailscale
    Given I am on the critical path described by the feature seed
    When I exercise the surface as this persona would
    Then I receive clear status about what happened
    And the next action is obvious without tribal knowledge
    And evidence is capturable for this scenario

  Scenario: Config help lists setup for senior-dev-tmux-mosh-tailscale
    Given I am on the critical path described by the feature seed
    When I read config help as this persona
    Then I receive clear status about what happened
    And evidence is capturable for this scenario
