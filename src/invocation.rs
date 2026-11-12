//! Host data decoding, not a second language implementation. Only literal ASTs
//! enter the shared evaluator; neither JSON keys nor strings become source.
use super::*;
use serde::de::{MapAccess, Visitor};
use serde_json::value::RawValue;
use std::fmt;

pub const ARGUMENT_BYTES: usize = 65_536;
pub const INPUT_VALIDATION_CONTRACT_VERSION: u32 = 1;

pub(super) fn validation_preflight(target: &str) -> Json {
    json!({"contract_version":INPUT_VALIDATION_CONTRACT_VERSION,"phase":"preflight","new_execution":false,"target":target})
}

fn input(code: DiagnosticCode, message: impl Into<String>, path: &str) -> Diagnostic {
    let mut d = err(code, message, Span::default());
    d.path = Some(path.into());
    d
}
fn pointer(parent: &str, field: &str) -> String {
    format!("{parent}/{}", field.replace('~', "~0").replace('/', "~1"))
}

// A vector deliberately retains duplicate keys. Children remain raw until their
// declared types are known; JSON numbers never pass through floating point.
struct Fields(Vec<(String, Box<RawValue>)>);
impl<'de> Deserialize<'de> for Fields {
    fn deserialize<D: serde::Deserializer<'de>>(d: D) -> std::result::Result<Self, D::Error> {
        struct FieldsVisitor;
        impl<'de> Visitor<'de> for FieldsVisitor {
            type Value = Fields;
            fn expecting(&self, f: &mut fmt::Formatter) -> fmt::Result {
                f.write_str("a record object")
            }
            fn visit_map<M: MapAccess<'de>>(
                self,
                mut map: M,
            ) -> std::result::Result<Fields, M::Error> {
                let mut fields = Vec::new();
                while let Some(pair) = map.next_entry()? {
                    fields.push(pair);
                }
                Ok(Fields(fields))
            }
        }
        d.deserialize_map(FieldsVisitor)
    }
}

pub(super) fn literal(
    raw: &RawValue,
    ty: &Ty,
    p: &Program,
    path: &str,
    depth: usize,
) -> Result<Expr> {
    if depth + usize::from(matches!(ty, Ty::Named(_) | Ty::List(_))) > 16 {
        let mut d = err(
            DiagnosticCode::LimitInputDepth,
            "input container depth exceeds 16",
            Span::default(),
        );
        d.path = Some(path.into());
        return Err(d);
    }
    let bad = || input(DiagnosticCode::InputType, format!("expected {ty}"), path);
    let kind = match ty {
        Ty::Int => {
            let s: String = serde_json::from_str(raw.get()).map_err(|_| bad())?;
            let n: i64 = s.parse().map_err(|_| {
                input(
                    DiagnosticCode::InputIntCanonical,
                    "expected canonical i64 decimal string",
                    path,
                )
            })?;
            if n.to_string() != s {
                return Err(input(
                    DiagnosticCode::InputIntCanonical,
                    "expected canonical i64 decimal string",
                    path,
                ));
            }
            ExprKind::Int(n)
        }
        Ty::Bool => ExprKind::Bool(serde_json::from_str(raw.get()).map_err(|_| bad())?),
        Ty::String => ExprKind::String(serde_json::from_str(raw.get()).map_err(|_| bad())?),
        Ty::List(element) => {
            let elements: Vec<Box<RawValue>> =
                serde_json::from_str(raw.get()).map_err(|_| bad())?;
            if elements.len() > 1024 {
                return Err(input(
                    DiagnosticCode::LimitListElements,
                    "list exceeds 1024 elements",
                    path,
                ));
            }
            ExprKind::List(
                (**element).clone(),
                elements
                    .iter()
                    .enumerate()
                    .map(|(i, raw)| {
                        literal(raw, element, p, &pointer(path, &i.to_string()), depth + 1)
                    })
                    .collect::<Result<Vec<_>>>()?,
            )
        }
        Ty::Named(name) => {
            let Fields(fields) = serde_json::from_str(raw.get()).map_err(|_| bad())?;
            let record = p.records.iter().find(|r| r.name == *name).unwrap();
            let mut seen = BTreeSet::new();
            for (key, _) in &fields {
                let child = pointer(path, key);
                if !seen.insert(key) {
                    return Err(input(
                        DiagnosticCode::InputFieldDuplicate,
                        "duplicate field",
                        &child,
                    ));
                }
                if !record.fields.iter().any(|(n, _, _)| n == key) {
                    return Err(input(
                        DiagnosticCode::InputFieldUnknown,
                        "unknown field",
                        &child,
                    ));
                }
            }
            let mut values = Vec::new();
            for (key, ty, _) in &record.fields {
                let child = pointer(path, key);
                let raw = fields.iter().find(|(n, _)| n == key).ok_or_else(|| {
                    input(DiagnosticCode::InputFieldMissing, "missing field", &child)
                })?;
                values.push((
                    key.clone(),
                    Span::default(),
                    literal(&raw.1, ty, p, &child, depth + 1)?,
                ));
            }
            ExprKind::Construct(name.clone(), values)
        }
        Ty::Unit => return Err(bad()), // Unit cannot be declared as a parameter.
    };
    Ok(Expr {
        kind,
        span: Span::default(),
    })
}

pub(super) fn arguments(raw: &str, f: &Function, p: &Program) -> Result<Vec<Expr>> {
    if raw.len() > ARGUMENT_BYTES {
        let mut d = err(
            DiagnosticCode::LimitInputBytes,
            "raw arguments exceed 65536 bytes",
            Span::default(),
        );
        d.path = Some("/args".into());
        return Err(d);
    }
    json_depth(raw, "/args", 17)?;
    // RawValue's parser has a fixed JSON nesting ceiling too. Typed decoding
    // below independently limits record depth; unsupported values never recurse.
    let args: Vec<Box<RawValue>> = serde_json::from_str(raw).map_err(|_| {
        input(
            DiagnosticCode::InputType,
            "args must be a JSON array",
            "/args",
        )
    })?;
    if args.len() != f.params.len() {
        return Err(input(
            DiagnosticCode::InputArity,
            "argument count mismatch",
            "/args",
        ));
    }
    args.iter()
        .zip(&f.params)
        .enumerate()
        .map(|(i, (raw, (_, ty)))| literal(raw, ty, p, &format!("/args/{i}"), 0))
        .collect()
}

pub(super) fn json_depth(raw: &str, path: &str, ceiling: usize) -> Result<()> {
    // Bound nesting independently of serde and the expected type, without
    // allocating or recursively visiting untrusted JSON. Quotes/escapes are
    // handled here only for depth counting; serde remains the syntax decoder.
    let (mut depth, mut quoted, mut escaped) = (0usize, false, false);
    for b in raw.bytes() {
        if quoted {
            if escaped {
                escaped = false;
            } else if b == b'\\' {
                escaped = true;
            } else if b == b'"' {
                quoted = false;
            }
        } else if b == b'"' {
            quoted = true;
        } else if b == b'[' || b == b'{' {
            depth += 1;
            if depth > ceiling {
                let mut d = err(
                    DiagnosticCode::LimitInputDepth,
                    if path == "/args" {
                        "argument JSON nesting exceeds 17".into()
                    } else {
                        format!("input JSON nesting exceeds {ceiling}")
                    },
                    Span::default(),
                );
                d.path = Some(path.into());
                return Err(d);
            }
        } else if b == b']' || b == b'}' {
            depth = depth.saturating_sub(1);
        }
    }
    Ok(())
}

// Every chunk is metered before appending. No unbounded serialized string or
// aggregate is constructed, including during JSON escaping. Metadata is outside
// the output ceiling; only this encoded VALUE shares it with captured print.
fn encode(machine: &mut Machine<'_>, value: &Value) -> Result<String> {
    fn emit(m: &mut Machine<'_>, out: &mut String, s: &str) -> Result<()> {
        m.tick(s.len(), Span::default())?;
        if m.output
            .len()
            .saturating_add(out.len())
            .saturating_add(s.len())
            > m.limits.output_bytes
        {
            return Err(err(
                DiagnosticCode::LimitOutput,
                "output limit exceeded encoding call result",
                Span::default(),
            ));
        }
        m.alloc(s.len(), Span::default())?;
        out.push_str(s);
        Ok(())
    }
    fn string(m: &mut Machine<'_>, out: &mut String, s: &str) -> Result<()> {
        emit(m, out, "\"")?;
        for c in s.chars() {
            match c {
                '"' => emit(m, out, "\\\"")?,
                '\\' => emit(m, out, "\\\\")?,
                '\n' => emit(m, out, "\\n")?,
                '\r' => emit(m, out, "\\r")?,
                '\t' => emit(m, out, "\\t")?,
                '\u{8}' => emit(m, out, "\\b")?,
                '\u{c}' => emit(m, out, "\\f")?,
                c if (c as u32) < 32 => emit(m, out, &format!("\\u{:04x}", c as u32))?,
                c => emit(m, out, c.encode_utf8(&mut [0; 4]))?,
            }
        }
        emit(m, out, "\"")
    }
    fn walk(m: &mut Machine<'_>, out: &mut String, v: &Value, depth: usize) -> Result<()> {
        m.tick(1, Span::default())?;
        match v {
            Value::Int(n) => string(m, out, &n.to_string()),
            Value::Bool(b) => emit(m, out, if *b { "true" } else { "false" }),
            Value::String(s) => string(m, out, s),
            Value::Unit => emit(m, out, "null"),
            Value::List(list) => {
                if depth >= 16 {
                    return Err(err(
                        DiagnosticCode::LimitValueDepth,
                        "container value depth exceeds 16",
                        Span::default(),
                    ));
                }
                emit(m, out, "[")?;
                for (i, value) in list.elements().iter().enumerate() {
                    if i != 0 {
                        emit(m, out, ",")?;
                    }
                    walk(m, out, value, depth + 1)?;
                }
                emit(m, out, "]")
            }
            Value::Record(_, fields) => {
                if depth >= 16 {
                    return Err(err(
                        DiagnosticCode::LimitValueDepth,
                        "record value depth exceeds 16",
                        Span::default(),
                    ));
                }
                emit(m, out, "{")?;
                for (i, (key, value)) in fields.iter().enumerate() {
                    if i != 0 {
                        emit(m, out, ",")?;
                    }
                    string(m, out, key)?;
                    emit(m, out, ":")?;
                    walk(m, out, value, depth + 1)?;
                }
                emit(m, out, "}")
            }
        }
    }
    let mut out = String::new();
    walk(machine, &mut out, value, 0)?;
    Ok(out)
}

pub(super) fn execute(r: Request, mut limits: Limits) -> Json {
    limits.clamp();
    let revision = hash(&r.source);
    let target = r.function.as_deref().unwrap_or("");
    let validate_only = r.op == "validate-call";
    let fail = |d| {
        let mut report = diagnostic_report(d, &revision, &limits);
        if validate_only {
            report["input_validation"] = validation_preflight(target);
        } else {
            report["invocation"] = json!({"target":target,"new_execution":false});
        }
        report
    };
    if r.source.len() > limits.source_bytes {
        return fail(err(
            DiagnosticCode::LimitSource,
            "source byte limit exceeded",
            Span::default(),
        ));
    }
    let p = match parse(&r.source) {
        Ok(p) => p,
        Err(d) => return fail(d),
    };
    let facts = match check(&p) {
        Ok(f) => f,
        Err(d) => return fail(d),
    };
    let meta = metadata(&p, &facts, &r.source, &limits);
    let mut report = json!({"compiler":COMPILER,"revision":revision,"limits":limits,"syntax_limits":syntax_limits(),"status":"Ready","output":"","diagnostics":[],"probes":[],"graph":meta.graph,"agent_view":agent_view(&p,&facts,&r.source,r.focus.as_deref().or(Some(target)),r.budget.unwrap_or(4096).min(65536) as usize),"invocation":{"target":target,"new_execution":false}});
    if validate_only {
        report.as_object_mut().unwrap().remove("invocation");
        report["input_validation"] = validation_preflight(target);
    }
    let prepared: Result<(&Function, Vec<Expr>, &str)> = (|| {
        let f = p
            .functions
            .iter()
            .find(|f| f.name == target)
            .ok_or_else(|| {
                input(
                    DiagnosticCode::InputTarget,
                    "unknown global function",
                    "/function",
                )
            })?;
        let raw = r.args.as_ref().map_or("[]", |raw| raw.get());
        let args = arguments(raw, f, &p)?;
        Ok((f, args, raw))
    })();
    let (f, args, raw) = match prepared {
        Ok(v) => v,
        Err(d) => {
            report["status"] = json!(if d.kind == "Limit" {
                "Unknown"
            } else {
                "Error"
            });
            report["diagnostics"] = json!([d]);
            return report;
        }
    };
    // Host shape validation ends before execution identity or Machine creation.
    // Hash the retained RawValue bytes, never a normalized JSON value.
    if validate_only {
        report["input_validation"] = json!({"contract_version":INPUT_VALIDATION_CONTRACT_VERSION,"phase":"validated","new_execution":false,"target":target,"argument_count":args.len(),"argument_hash":hash(raw)});
        return report;
    }
    let key =
        hash(&json!([COMPILER, "call", limits, target, raw, meta.hashes[target]]).to_string());
    report["invocation"] = json!({"target":target,"new_execution":true,"execution_key":key});
    let mut machine = Machine::new(&p, &limits);
    let expression = Expr {
        kind: ExprKind::Call(target.into(), args),
        span: Span::default(),
    };
    let execution = machine
        .eval(&expression, &mut Env::new())
        .and_then(|v| encode(&mut machine, &v));
    match execution {
        Ok(encoded) => {
            report["status"] = json!("Complete");
            report["result"] = json!({"type":f.ret.to_string()});
            // Kept private until the final serializer inserts this raw value.
            report["__encoded_call_value"] = json!(encoded);
        }
        Err(d) => {
            report["status"] = json!(if d.kind == "Limit" {
                "Unknown"
            } else {
                "Error"
            });
            report["diagnostics"] = json!([d]);
        }
    }
    report["output"] = json!(machine.output);
    report["usage"] = json!({"fuel":machine.fuel,"logical_allocation_bytes":machine.allocation,"attempted_cases":0});
    report
}

// serde_json::Value sorts object keys by default. Use RawValue at the transport
// boundary to retain language declaration order without changing legacy JSON or
// adding a dependency/altering hashes via preserve_order.
pub(super) fn serialize_report(mut report: Json) -> String {
    let Some(encoded) = report
        .as_object_mut()
        .and_then(|r| r.remove("__encoded_call_value"))
    else {
        return report.to_string();
    };
    #[derive(Serialize)]
    struct TypedResult<'a> {
        #[serde(rename = "type")]
        ty: &'a str,
        value: &'a RawValue,
    }
    #[derive(Serialize)]
    struct Report<'a> {
        #[serde(flatten)]
        rest: Json,
        result: TypedResult<'a>,
    }
    let result = report.as_object_mut().unwrap().remove("result").unwrap();
    let raw = RawValue::from_string(encoded.as_str().unwrap().into()).expect("metered valid JSON");
    serde_json::to_string(&Report {
        rest: report,
        result: TypedResult {
            ty: result["type"].as_str().unwrap(),
            value: &raw,
        },
    })
    .unwrap()
}
