@ux @dx @tui @lazygit @persona:terminal-power-user @interface:tui
Feature: Resident Git workbench
  HoBo Code users can inspect and deliver repository changes without leaving
  the same resident workspace that contains their terminal panes.

  Background:
    Given hobo-code session serve exposes the resident session control surface

  Scenario: Git stays adjacent to terminal tabs
    Then the surface exposes a Git tab beside resident terminal tabs
    And the Git tab exposes Status, Files, Branches, Commits, Stash, and Preview panels

  Scenario: Keyboard review and staging follows the lazygit mental model
    Then keys 1 through 5 focus Git panels
    And arrows or j and k move the Git selection
    And Space stages or unstages the selected whole file

  Scenario: Core repository operations stay in the workbench
    Then files can be discarded or ignored
    And branches and stashes can be managed
    And repository sync and commit revert are available

  Scenario: Delivery stays on HoBo approval rails
    Then commits contain staged changes only
    And commit shows the exact staged effect before approval

  Scenario: Tmux attachment includes a native Git window
    Then attaching ensures a native Git tmux window
    And the native Git window exposes all five panels at 80 by 24
    And native delivery actions require typed approval

  Scenario: Narrow terminals keep the workflow reachable
    Then the diff appears before the Git side panels on a narrow viewport
    And every delivery action remains keyboard reachable
