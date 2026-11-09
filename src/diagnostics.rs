//! Stable machine contract, independent of language/compiler identity.
use serde::Serialize;

pub const DIAGNOSTIC_CONTRACT_VERSION: u32 = 1;

macro_rules! codes {
    ($($name:ident => ($wire:literal, $kind:literal, $meaning:literal)),+ $(,)?) => {
        #[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
        pub enum DiagnosticCode {
            $(#[serde(rename = $wire)] $name),+
        }
        impl DiagnosticCode {
            pub const ALL: &'static [Self] = &[$(Self::$name),+];
            pub const fn wire(self) -> &'static str {
                match self { $(Self::$name => $wire),+ }
            }
            pub const fn kind(self) -> &'static str {
                match self { $(Self::$name => $kind),+ }
            }
            pub const fn meaning(self) -> &'static str {
                match self { $(Self::$name => $meaning),+ }
            }
        }
    };
}
codes! {
    ReviewRequest => ("E_REVIEW_REQUEST", "Request", "Invalid review fields or strict suite schema."),
    ReviewTarget => ("E_REVIEW_TARGET", "Input", "Missing or incompatible review target boundary."),
    ReviewExpectation => ("E_REVIEW_EXPECTATION", "Input", "Invalid typed candidate expectation."),
    LimitReviewBytes => ("E_LIMIT_REVIEW_BYTES", "Limit", "Raw suite exceeds 65536 bytes."),
    LimitReviewCases => ("E_LIMIT_REVIEW_CASES", "Limit", "Review suite exceeds sixteen cases."),
    RequestInvalid => ("E_REQUEST_INVALID", "Request", "Invalid request schema, limits, or operation-specific fields."),
    EditRequest => ("E_EDIT_REQUEST", "Request", "Invalid edit fields, explicit focus, change schema or canonical hash guards."),
    EditConflict => ("E_EDIT_CONFLICT", "Request", "Edit revision or exact body hash guard does not match the checked baseline."),
    EditTarget => ("E_EDIT_TARGET", "Request", "Edit target is not a unique global function in the checked baseline."),
    EditReplacement => ("E_EDIT_REPLACEMENT", "Input", "Replacement is not one standalone block with only outer whitespace."),
    EditCandidate => ("E_EDIT_CANDIDATE", "Input", "Combined candidate failed checking or preservation audit; not accepted source."),
    OperationUnknown => ("E_OPERATION_UNKNOWN", "Request", "Unsupported dispatch operation."),
    ContextSelector => ("E_CONTEXT_SELECTOR", "Request", "Invalid canonical probe selector or selected probe does not exist."),
    TransportLimit => ("E_TRANSPORT_LIMIT", "Request", "Raw request exceeds the fixed transport byte ceiling."),
    Syntax => ("E_SYNTAX", "Syntax", "Invalid language token, literal or grammar."),
    NameUnknown => ("E_NAME_UNKNOWN", "Type", "Unknown variable, function, record or declared type."),
    NameDuplicate => ("E_NAME_DUPLICATE", "Type", "Duplicate declaration, parameter or immutable binding."),
    TypeMismatch => ("E_TYPE_MISMATCH", "Type", "Incompatible expression, argument, result or projection type."),
    FieldUnknown => ("E_FIELD_UNKNOWN", "Type", "Unknown record field in language source."),
    FieldMissing => ("E_FIELD_MISSING", "Type", "Missing record initializer field."),
    FieldDuplicate => ("E_FIELD_DUPLICATE", "Type", "Duplicate record declaration or initializer field."),
    TypeRecursive => ("E_TYPE_RECURSIVE", "Type", "Recursive record type."),
    ProbeImpure => ("E_PROBE_IMPURE", "Purity", "Probe directly or transitively contains print."),
    IntOverflow => ("E_INT_OVERFLOW", "Runtime", "Signed i64 arithmetic overflow, including minimum divided or remainder by minus one."),
    DivZero => ("E_DIV_ZERO", "Runtime", "Division or remainder by zero."),
    ProbeDomain => ("E_PROBE_DOMAIN", "Runtime", "Reversed or empty probe domain."),
    ReplaySpecification => ("E_REPLAY_SPECIFICATION", "Replay", "Historical predicate or domain no longer matches."),
    ReplayReceipt => ("E_REPLAY_RECEIPT", "Replay", "Invalid witness identity or historical input."),
    ArtifactCompatibility => ("E_ARTIFACT_COMPATIBILITY", "Artifact", "Unsupported artifact format, version or exact compiler."),
    ArtifactInvalid => ("E_ARTIFACT_INVALID", "Artifact", "Missing artifact data or invalid archived limits, source revision or witness identity."),
    ArtifactReproduction => ("E_ARTIFACT_REPRODUCTION", "Artifact", "Exact historical first failure could not be reproduced by bounded execution."),
    InputTarget => ("E_INPUT_TARGET", "Input", "Unknown global invocation target."),
    InputArity => ("E_INPUT_ARITY", "Input", "Invocation argument count mismatch."),
    InputType => ("E_INPUT_TYPE", "Input", "Argument JSON does not have its required language type or root array shape."),
    InputIntCanonical => ("E_INPUT_INT_CANONICAL", "Input", "Int string is not canonical signed i64 decimal."),
    InputFieldMissing => ("E_INPUT_FIELD_MISSING", "Input", "Missing typed input record field."),
    InputFieldUnknown => ("E_INPUT_FIELD_UNKNOWN", "Input", "Unknown typed input record field."),
    InputFieldDuplicate => ("E_INPUT_FIELD_DUPLICATE", "Input", "Duplicate typed input record field after JSON unescaping."),
    LimitSource => ("E_LIMIT_SOURCE", "Limit", "Source UTF-8 byte budget exceeded."),
    LimitTokens => ("E_LIMIT_TOKENS", "Limit", "Fixed token ceiling exceeded."),
    LimitSyntaxDepth => ("E_LIMIT_SYNTAX_DEPTH", "Limit", "Fixed syntax, AST, operator or projection depth ceiling exceeded."),
    LimitRecordFields => ("E_LIMIT_RECORD_FIELDS", "Limit", "Fixed record declaration or initializer field ceiling exceeded."),
    LimitTypeDepth => ("E_LIMIT_TYPE_DEPTH", "Limit", "Fixed record type depth ceiling exceeded."),
    LimitValueDepth => ("E_LIMIT_VALUE_DEPTH", "Limit", "Fixed runtime record value depth ceiling exceeded."),
    LimitCallDepth => ("E_LIMIT_CALL_DEPTH", "Limit", "Function call depth budget exceeded."),
    LimitEvaluationDepth => ("E_LIMIT_EVALUATION_DEPTH", "Limit", "Combined evaluation stack depth budget exceeded."),
    LimitFuel => ("E_LIMIT_FUEL", "Limit", "Execution fuel budget exhausted."),
    LimitOutput => ("E_LIMIT_OUTPUT", "Limit", "Captured print and encoded call value byte budget exceeded; metadata excluded."),
    LimitAllocation => ("E_LIMIT_ALLOCATION", "Limit", "Cumulative logical allocation budget exceeded; not actual memory usage."),
    LimitCases => ("E_LIMIT_CASES", "Limit", "Attempted probe case budget exceeded."),
    LimitInputBytes => ("E_LIMIT_INPUT_BYTES", "Limit", "Raw argument value byte ceiling exceeded."),
    LimitInputDepth => ("E_LIMIT_INPUT_DEPTH", "Limit", "Input JSON container or typed record nesting ceiling exceeded."),
    ExecutionBlocked => ("E_EXECUTION_BLOCKED", "Limit", "Probe not executed after interrupted top-level execution."),
    FocusUnknown => ("E_FOCUS_UNKNOWN", "Request", "Native focus command found no matching function."),
    ArchiveSelection => ("E_ARCHIVE_SELECTION", "Request", "Native archive command selected no failed ghost.")
}
