//! Checked, structured function/record boundaries. Never executes a Machine.
use super::*;

pub const INTERFACE_CONTRACT_VERSION: u32 = 1;

fn ty(t: &Ty) -> Json {
    match t {
        Ty::Int => json!({"kind":"Int"}),
        Ty::Bool => json!({"kind":"Bool"}),
        Ty::String => json!({"kind":"String"}),
        Ty::Unit => json!({"kind":"Unit"}),
        Ty::Named(name) => json!({"kind":"Record","name":name}),
    }
}

pub(super) fn execute(r: Request, mut limits: Limits) -> Json {
    limits.clamp();
    let revision = hash(&r.source);
    let fail = |d| {
        let mut report = diagnostic_report(d, &revision, &limits);
        report["interface"] = json!({"contract_version":INTERFACE_CONTRACT_VERSION,"phase":"preflight","new_execution":false});
        report
    };
    if r.focus.is_some() || r.budget.is_some() || r.ghost.is_some() || r.artifact.is_some() {
        return fail(err(
            DiagnosticCode::RequestInvalid,
            "describe accepts only source and limits",
            Span::default(),
        ));
    }
    if r.source.len() > limits.source_bytes {
        return fail(err(
            DiagnosticCode::LimitSource,
            "source byte limit exceeded",
            Span::default(),
        ));
    }
    let p = match parse(&r.source).and_then(|p| {
        check(&p)?;
        Ok(p)
    }) {
        Ok(p) => p,
        Err(d) => return fail(d),
    };
    let mut functions: Vec<_> = p.functions.iter().map(|f| json!({
        "name":f.name,"parameters":f.params.iter().map(|(name,t)|json!({"name":name,"type":ty(t)})).collect::<Vec<_>>(),
        "return_type":ty(&f.ret)
    })).collect();
    functions.sort_by(|a, b| a["name"].as_str().cmp(&b["name"].as_str()));
    let mut records: Vec<_> = p.records.iter().map(|r| json!({
        "name":r.name,"fields":r.fields.iter().map(|(name,t,_)|json!({"name":name,"type":ty(t)})).collect::<Vec<_>>()
    })).collect();
    records.sort_by(|a, b| a["name"].as_str().cmp(&b["name"].as_str()));
    json!({"compiler":COMPILER,"revision":revision,"limits":limits,"status":"Ready","output":"","probes":[],"diagnostics":[],
        "interface":{"contract_version":INTERFACE_CONTRACT_VERSION,"phase":"described","new_execution":false,
            "functions":functions,"records":records,
            "encodings":{"Int":"canonical_signed_i64_string","Bool":"JSON_boolean","String":"JSON_string","Unit":"JSON_null","Record":"exact_field_object"},
            "scope":"all checked global functions and nominal records; not an authorization allowlist, suite verification or property-specific relevance claim"}})
}
