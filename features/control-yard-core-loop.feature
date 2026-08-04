# HIGHBALL core loop — acceptance for the waybill desk, driven HEADLESS.
# Every step runs the real @hobo/control-yard engine (deriveWaybills,
# isHighball, waybillForZone, createYardEngine, deriveYardVisualState) against
# the committed deterministic scenarios in packages/pixel-village/src/scenarios/
# — no browser, no Phaser, no control-api. The Playwright suite
# (packages/pixel-village/test/e2e/*.spec.ts) proves the same loop is VISIBLE;
# this proves it is CORRECT.
Feature: Control-yard core loop
  As the operator of a HoBo Station
  I want the yard to offer exactly the real work that exists, and nothing else
  So that reading the board and stamping a waybill is the whole job

  Scenario: A fresh station offers exactly one waybill
    Given the "first-run" scenario at tick 0
    Then exactly 1 waybill is offered
    And the top waybill is "station.open"
    And the top waybill has blast radius "station"
    And the board is not Highball

  Scenario: Opening the station retires the first-run waybill
    Given the "first-run" scenario at tick 20
    Then no "station.open" waybill is offered
    And Bo stands at the "bootstrapDesk"

  Scenario: Stamping the doctor.fix waybill clears the hazard and returns the board to Highball
    Given the "incident-storm" scenario at tick 40
    Then exactly 1 waybill is offered
    And the top waybill is "doctor.fix"
    And the top waybill confirms with the "doctorSnapshot" op
    And the top waybill has blast radius "read-only"
    And a hazard is showing
    When the operator stamps the top waybill
    And the flagged cause is fixed
    Then no hazard is showing
    And exactly 0 waybills are offered
    And the board is Highball

  Scenario: Spiking a waybill only hides it until the projection moves on
    Given the "incident-storm" scenario at tick 40
    When the operator spikes the top waybill
    Then exactly 0 waybills are offered
    When the projection advances to tick 50
    Then at least 1 waybill is offered

  Scenario: A quiet yard is already Highball
    Given the "quiet-yard" scenario at tick 10
    Then exactly 0 waybills are offered
    And the board is Highball
    And Bo stands at the "activeRailTrack"

  Scenario: Waybills are derived from reality, never invented
    Given the "deploy-saga" scenario at tick 20
    Then exactly 1 waybill is offered
    And the top waybill is "rail.activate"
    And the board is not Highball

  Scenario: Every zone with real work routes to that work
    Given the "incident-storm" scenario at tick 50
    Then the "errorBunker" zone opens a "doctor.fix" waybill
    And the "bootstrapDesk" zone opens the top waybill
    And the "costBooth" zone opens no waybill
