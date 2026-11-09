# Wisp shipping trial

Root cause: `slabs` truncates integer division, so positive excess weights below
500 grams were charged for zero additional slabs. The public starter run failed
at 1001 grams. Changed only `quote`'s body: add 499 to positive excess weight
before passing it to unchanged `slabs`, rounding up commenced 500-gram slabs.
The zero-weight branch, remote surcharge, signatures, helper and probes remain
unchanged. The arithmetic stays within i64 for the specified 0..100000 domain.

Commands/checks actually run:

- `git status --short`: initially clean.
- `target/debug/wisp run evaluation/tasks/shipping/starter.wisp`: exit 1,
  Fail at input 1001; report retained in scratch.
- `target/debug/wisp check evaluation/tasks/shipping/starter.wisp`: exit 0,
  checked metadata used for guarded edit.
- `python3 evaluation/work/wisp-shipping/validate.py`: successful. Runs documented
  `wisp edit`, `check`, `run`, and typed `call --args-file -` with JSON transport.
  Guarded preparation Ready; exact prefix/suffix preservation asserted;
  check Ready; original probes Clear (31 and 21 cases). 1204 typed calls passed
  against an independently expressed quotient/remainder oracle: 602 weights,
  both remote states, every 500-gram boundary from 1000 through 100000 and its
  in-domain neighbors, zero and additional small/end-domain values.
- The scratch validation was run twice; the second candidate removes outer
  replacement whitespace so bytes outside the parsed function body are unchanged.

Final source: `evaluation/submissions/wisp/shipping.wisp`.
Self-authored scratch and reports: `evaluation/work/wisp-shipping/`.
Limitations: finite public tests only, not a proof or hidden acceptance result;
no grade inspected, no outside-domain behavior promised. No performance or token
usage measurements. No language-core changes or host IO in submitted Wisp.
