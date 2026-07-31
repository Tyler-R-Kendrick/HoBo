@optimizexp @ux @dx @persona:sota-frontier-ai-native-tui-designer @interface:tui
Feature: HoBo interactive shell craft (sota TUI designer)
  As sota-frontier-ai-native-tui-designer
  I want bare hobo-code to be an inhabited HoBo product shell
  So that I never see stock Pi as the product frame

  Scenario: Shell frame claims HoBo identity with Bo present
    Given the InteractiveShell pure renderer
    When I render the initial shell frame
    Then the frame identifies engine hobo-shell
    And the frame claims not stock Pi
    And the frame is not stock Pi product chrome
