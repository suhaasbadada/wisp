# List value differences

Accepted live reviews and downloaded, script-free readable HTML share the same
transport-only projection. Complete List results are compared by ordered JSON
index: `/result/value/0`, then nested record keys or further indices. Indices
do not establish business row identity, moves, causes, financial authority or
policy correctness. Native comparisons and owner-required values remain unchanged.
Raw Int decimal strings are quoted without conversion to JavaScript numbers.

Added and removed index paths show `absent` on the missing side. There is no
synthetic `/length` property. Explicit empty/nonempty List and Record presence
markers distinguish container-kind changes from an absent parent. No supported
differences for two empty lists is not universal equivalence.

Each comparison permits 2048 visited nodes across both sides, 16 combined
Record/List container levels (including empty containers), 32 fields per record,
1024 elements per list and 8192 UTF-16 units per pointer path. Thus two legal
1024-element native lists need not fit this UI node budget. Dense ordinary JSON
arrays are supported; holes, extra properties, custom prototypes, accessors,
numbers, other non-JSON shapes and non-scalar Unicode fail closed. All values
are validated before row omission; an unsupported tail cannot become “no change.”

At most 64 differences and 120 KiB row text appear per comparison, with 512
Unicode-scalar string prefixes and a 256 KiB generated-text budget per panel.
Limited means incomplete UI, not native Unknown. Full accepted native JSON is
retained in live evidence and exported HTML, including omitted or truncated
values. Error/Unknown observations show unavailable comparisons without inferred
entries. Text and pointer keys are literal DOM text, never executable HTML.

Use [manual List JSON fields](List-scenario-builder.md) or raw scenario JSON for
List arguments and required results. The builder never captures observed values
as requirements. This bounded presentation and manual authoring do not
complete every List UI feature or change language evaluation, interfaces or limits.
