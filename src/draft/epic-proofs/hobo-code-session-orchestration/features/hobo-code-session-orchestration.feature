Feature: HoBo Code resident session command boundary

  Scenario: Every lifecycle operation uses one versioned command boundary
    Given the HoBo Code resident session command suite
    Then all 19 resident session lifecycle commands are accepted
    And detach and reattach remain explicit session operations
