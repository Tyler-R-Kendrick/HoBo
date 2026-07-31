@optimizexp @ux @persona:product-end-user @interface:mcp
Feature: Public site first impression (product end user)
  As product end user
  I want A visitor lands on the HoBo public site and can understand what the product is, navigate primary docs, and leave with a clear next step within two minutes.
  So that harms, friction, and uncertainty stay low on my critical path

  # Generated for persona "product-end-user". Agent should refine steps to match
  # .optimizexp/personas/product-end-user.md vocabulary and failure modes.
  # Scenario names are stable evidence keys (slugified).

  Background:
    Given persona "product-end-user" is active
    And feature "public-site-first-impression" is under optimizexp review

  Scenario: Public site first impression works for product-end-user
    Given I am on the critical path described by the feature seed
    When I exercise the surface as this persona would
    Then I receive clear status about what happened
    And the next action is obvious without tribal knowledge
    And evidence is capturable for this scenario

  Scenario: Public site first impression failure is understandable for product-end-user
    Given something goes wrong on this journey
    When I observe the failure as this persona
    Then the error is non-blaming and actionable
    And I am not forced into repeated artificial hurdles
    And evidence of what I saw is stored under evidence/
