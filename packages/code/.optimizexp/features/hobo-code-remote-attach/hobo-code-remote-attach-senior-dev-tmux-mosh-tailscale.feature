@optimizexp @ux @dx @persona:senior-dev-tmux-mosh-tailscale @interface:cli
Feature: Dev-terminal attach tmux mosh Tailscale (senior dev tmux mosh tailscale)
  As senior-dev-tmux-mosh-tailscale
  I want tmux-like attach, named endpoints, optional mosh, and Tailscale overlay mode
  So that hobo-code matches my remote terminal setup without control-plane bloat

  Background:
    Given persona "senior-dev-tmux-mosh-tailscale" is active
    And feature "hobo-code-remote-attach" is under optimizexp review

  Scenario: Attach shows named endpoint and reattach path for senior-dev-tmux-mosh-tailscale
    Given I am on the critical path described by the feature seed
    When I exercise the surface as this persona would
    Then I receive clear status about what happened
    And the next action is obvious without tribal knowledge
    And evidence is capturable for this scenario

  Scenario: Attach JSON exposes compare and overlay mode for senior-dev-tmux-mosh-tailscale
    Given I am on the critical path described by the feature seed
    When I observe attach JSON as this persona
    Then attach compare and registration are machine-readable
    And evidence is capturable for this scenario

  Scenario: Help lists remote terminal differentiators for senior-dev-tmux-mosh-tailscale
    Given I am on the critical path described by the feature seed
    When I read attach help as this persona
    Then help names tmux mosh and Tailscale
    And evidence is capturable for this scenario
