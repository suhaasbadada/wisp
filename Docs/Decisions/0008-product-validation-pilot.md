# ADR 0008: validate workflows before expanding features

Accepted 2026-11-09. Freeze language/runtime/identity contracts and evaluate three maintenance tasks against strict TypeScript/BigInt instead of adding speculative features. Preregistered inputs `ef02699` and submission lock `0cd894d` precede scoring. Preserve failures; never rewrite specifications for better results.

Scope: deterministic acceptance harness, six fresh configured-agent sessions, public evidence and reproducible CI replay. Exact one-body boundaries protect specifications in both arms. Rust remains Wisp's only implementation; TypeScript is an external comparison arm. No Docker, paid APIs, core host access, solver, new syntax or automatic repair.

This is a workflow pilot, not a representative benchmark. Same configured identity does not verify exposed model/settings. Access restrictions are instructional, telemetry unavailable, and logs self-reported. Backend grader counts/bytes/time are not comparative agent cost.

Decision: five accepted submissions and one preserved Wisp boundary failure; no superiority claim. Clarify parsed body vs insertion ranges without changing behavior. Record instrumentation correction separately. Require independent tasks, repeated/randomized attempts, verified telemetry, isolated holdouts and repository-scale baselines before comparative claims. See [Evaluation](../Evaluation.md).
