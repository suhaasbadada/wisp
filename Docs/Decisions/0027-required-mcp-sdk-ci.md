# ADR 0027: Require pinned SDK interoperability in CI

Status: implemented; clean hash-locked installation, exact workflow shell step,
full local checks and independent review passed. Exact-head Linux CI/publication
pending.

The bridge's standard-library tests were required in CI, but official SDK checks
were local-only. Make the three existing SDK modes and historical internal triage
required steps in the existing read-only `verify` job. Keep its required job name
and permissions unchanged; deployment remains trusted-main Pages only.

Use Python 3.12 in a separate test virtual environment. Pin the SDK and all
transitive packages, require distribution hashes, install wheels only and check
dependency consistency. Retain structured reports and installed versions with
existing project evidence, including on failure; limit the SDK step to five
minutes. Runtime server dependencies and Rust semantics are unchanged.

This checks one real client/runner configuration against the exact CI revision,
not universal compatibility, dependency authenticity, reproducible wheel builds,
model reasoning quality, live deployment acceptance or language superiority.
Version/hash updates need deliberate review; no automatic dependency adoption.
