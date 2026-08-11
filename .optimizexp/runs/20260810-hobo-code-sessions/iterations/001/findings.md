# Iteration 001 findings

The resident session implementation removes the measured one-shot-session gap. Real tmux, runtime restart, browser, and installed-binary checks passed.

No S/M harm reduction remains in the scoped resident-session path. Direct remote use intentionally relies on SSH forwarding through an authenticated Station machine; automating Station credential provisioning is outside this session control boundary.
