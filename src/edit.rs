//! Pure, revision-guarded preparation. This module never evaluates a program.
use crate::*;

pub const EDIT_CONTRACT_VERSION: u32 = 1;
pub const REPLACEMENT_BYTES: usize = 65_536;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Change {
    expected_revision: String,
    expected_body_hash: String,
    replacement: String,
}

fn canonical_hash(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

fn failure(d: Diagnostic, revision: &str, limits: &Limits) -> Json {
    let mut report = diagnostic_report(d, revision, limits);
    report.as_object_mut().unwrap().remove("graph");
    report["new_execution"] = json!(false);
    report
}

fn request_failure(code: DiagnosticCode, message: &str, revision: &str, limits: &Limits) -> Json {
    failure(err(code, message, Span::default()), revision, limits)
}

fn rejected(d: Diagnostic, document: &str, source: &str, revision: &str, limits: &Limits) -> Json {
    // Root spans belong to the base document. Nested diagnostics own their
    // explicitly tagged document; never let shifted candidate spans escape.
    let mut root = err(
        if d.kind == "Limit" {
            d.code
        } else if document == "replacement" {
            DiagnosticCode::EditReplacement
        } else {
            DiagnosticCode::EditCandidate
        },
        if d.kind == "Limit" {
            d.message.clone()
        } else {
            format!("{document} rejected")
        },
        Span::default(),
    );
    root.path = Some("/change/replacement".into());
    let mut report = failure(root, revision, limits);
    let detail = json!({"document":document,"revision":hash(source),"diagnostics":[d]});
    report["edit"] = json!({"version":EDIT_CONTRACT_VERSION});
    if document == "candidate" {
        report["edit"]["rejected_candidate"] = detail;
        report["edit"]["rejected_candidate"]["source"] = json!(source);
    } else {
        report["edit"]["cause"] = detail;
    }
    report
}

fn text(source: &str, span: Span) -> &str {
    &source[span.start..span.end]
}

/// Audit indexed declarations and specifications rather than sets: duplicate
/// probes are meaningful and must retain their order and multiplicity.
fn preserved(
    base: &Program,
    candidate: &Program,
    source: &str,
    next: &str,
    target: &str,
    body: Span,
    insertion: Span,
) -> bool {
    if source[..body.start] != next[..insertion.start]
        || source[body.end..] != next[insertion.end..]
        || base.records.len() != candidate.records.len()
        || base.functions.len() != candidate.functions.len()
        || base.probes.len() != candidate.probes.len()
        || base.statements.len() != candidate.statements.len()
    {
        return false;
    }
    if !base
        .records
        .iter()
        .zip(&candidate.records)
        .all(|(a, b)| text(source, a.span) == text(next, b.span))
    {
        return false;
    }
    for (a, b) in base.functions.iter().zip(&candidate.functions) {
        if a.name != b.name || signature(a) != signature(b) {
            return false;
        }
        if a.name != target && text(source, a.span) != text(next, b.span) {
            return false;
        }
        // The original header bytes are part of the immutable prefix. Outer
        // replacement whitespace may extend the candidate's parsed header.
        if a.name == target
            && !text(
                next,
                Span {
                    start: b.span.start,
                    end: b.body.span.start,
                },
            )
            .starts_with(text(
                source,
                Span {
                    start: a.span.start,
                    end: a.body.span.start,
                },
            ))
        {
            return false;
        }
    }
    if !base
        .statements
        .iter()
        .zip(&candidate.statements)
        .all(|(a, b)| {
            std::mem::discriminant(a) == std::mem::discriminant(b)
                && text(source, stmt_expr(a).span) == text(next, stmt_expr(b).span)
        })
    {
        return false;
    }
    base.probes.iter().zip(&candidate.probes).all(|(a, b)| {
        a.var == b.var
            && a.lo == b.lo
            && a.hi == b.hi
            && text(source, a.span) == text(next, b.span)
            && predicate_key(a, source) == predicate_key(b, next)
    })
}

pub(super) fn execute(r: Request, mut limits: Limits) -> Json {
    limits.clamp();
    let revision = hash(&r.source);
    let invalid =
        |message| request_failure(DiagnosticCode::EditRequest, message, &revision, &limits);
    if r.budget.is_some() || r.ghost.is_some() || r.artifact.is_some() {
        return invalid("edit accepts only source, focus, change and limits");
    }
    let change: Change =
        match r.change.as_ref().map(|raw| {
            serde_json::from_str::<wire::Object<Change>>(raw.get()).map(|wire::Object(c)| c)
        }) {
            Some(Ok(c)) => c,
            _ => return invalid("edit requires strict change with three string fields"),
        };
    let Some(target) = r.focus.as_deref().filter(|s| !s.is_empty()) else {
        return invalid("edit requires an explicit global function focus");
    };
    if !canonical_hash(&change.expected_revision) || !canonical_hash(&change.expected_body_hash) {
        return invalid("edit guards require 64 lowercase hexadecimal characters");
    }
    if r.source.len() > limits.source_bytes {
        return failure(
            err(
                DiagnosticCode::LimitSource,
                "source byte limit exceeded",
                Span {
                    start: 0,
                    end: r.source.len(),
                },
            ),
            &revision,
            &limits,
        );
    }
    let base = match parse(&r.source) {
        Ok(p) => p,
        Err(d) => return failure(d, &revision, &limits),
    };
    if let Err(d) = check(&base) {
        return failure(d, &revision, &limits);
    }
    if change.expected_revision != revision {
        return request_failure(
            DiagnosticCode::EditConflict,
            "baseline revision does not match",
            &revision,
            &limits,
        );
    }
    let matches: Vec<_> = base.functions.iter().filter(|f| f.name == target).collect();
    let [function] = matches.as_slice() else {
        return request_failure(
            DiagnosticCode::EditTarget,
            "target is not a unique global function",
            &revision,
            &limits,
        );
    };
    let body = function.body.span;
    let body_hash = hash(text(&r.source, body));
    if change.expected_body_hash != body_hash {
        return request_failure(
            DiagnosticCode::EditConflict,
            "baseline body hash does not match",
            &revision,
            &limits,
        );
    }
    let replacement = &change.replacement;
    if replacement.len() > REPLACEMENT_BYTES {
        return rejected(
            err(
                DiagnosticCode::LimitSource,
                "replacement byte limit exceeded",
                Span::default(),
            ),
            "replacement",
            replacement,
            &revision,
            &limits,
        );
    }
    if let Err(d) = parse_block(replacement) {
        return rejected(d, "replacement", replacement, &revision, &limits);
    }
    let size = r
        .source
        .len()
        .checked_sub(body.end - body.start)
        .and_then(|n| n.checked_add(replacement.len()));
    if size.is_none_or(|n| n > limits.source_bytes) {
        // Preflight happens before allocation, so there is no rejected source or
        // candidate revision to expose. The limit belongs to candidate assembly.
        let d = err(
            DiagnosticCode::LimitSource,
            "combined candidate source byte limit exceeded",
            Span::default(),
        );
        let mut root = d.clone();
        root.path = Some("/change/replacement".into());
        let mut report = failure(root, &revision, &limits);
        report["edit"] = json!({"version":EDIT_CONTRACT_VERSION,"cause":{"document":"candidate","phase":"size_preflight","diagnostics":[d]}});
        return report;
    }
    let mut next = String::with_capacity(size.unwrap());
    next.push_str(&r.source[..body.start]);
    next.push_str(replacement);
    next.push_str(&r.source[body.end..]);
    let insertion = Span {
        start: body.start,
        end: body.start + replacement.len(),
    };
    let candidate = match parse(&next) {
        Ok(p) => p,
        Err(d) => return rejected(d, "candidate", &next, &revision, &limits),
    };
    if let Err(d) = check(&candidate) {
        return rejected(d, "candidate", &next, &revision, &limits);
    }
    if !preserved(&base, &candidate, &r.source, &next, target, body, insertion) {
        return rejected(
            err(
                DiagnosticCode::EditCandidate,
                "preservation audit rejected candidate",
                Span::default(),
            ),
            "candidate",
            &next,
            &revision,
            &limits,
        );
    }
    let Some(updated) = candidate.functions.iter().find(|f| f.name == target) else {
        return rejected(
            err(
                DiagnosticCode::EditCandidate,
                "candidate target missing",
                Span::default(),
            ),
            "candidate",
            &next,
            &revision,
            &limits,
        );
    };
    let probe_audit: Vec<_> = base.probes.iter().enumerate().map(|(index,p)| json!({"index":index,"predicate_key":predicate_key(p,&r.source),"text_preserved":true,"domain_preserved":true})).collect();
    json!({"compiler":COMPILER,"revision":revision,"limits":limits,"status":"Ready","new_execution":false,"output":"","probes":[],"diagnostics":[],
        "edit":{"version":EDIT_CONTRACT_VERSION,"state":"prepared","target":target,"base_revision":revision,"candidate_revision":hash(&next),"base_body_hash":body_hash,"candidate_body_hash":hash(text(&next,updated.body.span)),"base_body_span":body,"candidate_body_span":updated.body.span,"insertion_range":insertion,"source":next,
            "preservation":{"checked":true,"prefix":true,"suffix":true,"signature":true,"records":true,"other_functions":true,"top_level_statements":true,"probes":probe_audit}}})
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn preservation_mismatch_rejects_without_accepting_or_panicking() {
        let source = "fn f(n: Int) -> Int { n } probe n in 1..=2 { f(n)==n }";
        let base = parse(source).unwrap();
        let body = base.functions[0].body.span;
        let mut candidate = parse(source).unwrap();
        candidate.probes[0].hi = 3;
        assert!(!preserved(
            &base, &candidate, source, source, "f", body, body
        ));
        let mut candidate = parse(source).unwrap();
        candidate.functions[0].ret = Ty::Bool;
        assert!(!preserved(
            &base, &candidate, source, source, "f", body, body
        ));
        let mut candidate = parse(source).unwrap();
        candidate.probes.push(candidate.probes[0].clone());
        assert!(!preserved(
            &base, &candidate, source, source, "f", body, body
        ));
        let report = rejected(
            err(
                DiagnosticCode::EditCandidate,
                "preservation audit rejected candidate",
                Span::default(),
            ),
            "candidate",
            source,
            &hash(source),
            &Limits::default(),
        );
        assert_eq!(report["status"], "Error");
        assert!(report["edit"]["state"].is_null());
        assert!(report["edit"]["source"].is_null());
        assert_eq!(
            report["edit"]["rejected_candidate"]["document"],
            "candidate"
        );
    }
}
