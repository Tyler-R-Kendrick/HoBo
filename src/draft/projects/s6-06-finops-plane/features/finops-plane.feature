Feature: FinOps plane plan-time estimates

  Persona: application developer

  Scenario: hobo plan returns projected cost from provider cost.json
    Given a capability manifest cost.json and a deployment plan usage profile
    When the FinOps plane estimates plan cost
    Then the estimate lands within ±20% of the recorded actual spend fixture

Feature: FinOps plane budget gates

  Persona: FinOps lead

  Scenario: Hard budget breach blocks deploy
    Given a camp hard budget below the projected plan cost
    When the deploy gate evaluates the plan estimate against policy
    Then the gate denies the deployment

Feature: FinOps plane showback

  Persona: platform engineer

  Scenario: Showback reconciles against recorded spend
    Given meter.UsageRecorded events in the event log
    When showback aggregates tenant, camp, and bindle actuals
    Then the showback total matches the MeteringView total cost
