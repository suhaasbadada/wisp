use crate::syntax::*;
use crate::DiagnosticCode;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};
use std::sync::Arc;
pub type Env<T> = BTreeMap<String, T>;
#[cfg(test)]
mod runtime_tests;
#[derive(Debug)]
pub enum Value {
    Int(i64),
    Bool(bool),
    String(String),
    Unit,
    Record(String, Vec<(String, Value)>),
    List(ListValue),
}

// Only checked construction establishes the cached combined aggregate height.
// No mutable access to the backing elements is exposed, even to the evaluator.
#[derive(Debug)]
pub struct ListValue {
    elements: Arc<[Value]>,
    height: usize,
}
impl ListValue {
    pub(crate) fn elements(&self) -> &[Value] {
        &self.elements
    }
}

fn type_height(ty: &Ty, rs: &Env<&Record>, span: Span) -> Result<usize> {
    fn visit(
        ty: &Ty,
        rs: &Env<&Record>,
        active: &mut BTreeSet<String>,
        done: &mut Env<usize>,
        depth: usize,
        span: Span,
    ) -> Result<usize> {
        if depth > 16 {
            return Err(err(
                DiagnosticCode::LimitTypeDepth,
                "container type depth exceeds 16",
                span,
            ));
        }
        let height = match ty {
            Ty::List(element) => 1 + visit(element, rs, active, done, depth + 1, span)?,
            Ty::Named(name) => {
                let r = rs.get(name).ok_or_else(|| {
                    err(
                        DiagnosticCode::NameUnknown,
                        format!("unknown type {name}"),
                        span,
                    )
                })?;
                if active.contains(name) {
                    return Err(err(
                        DiagnosticCode::TypeRecursive,
                        "recursive record type",
                        span,
                    ));
                }
                if let Some(height) = done.get(name) {
                    return Ok(*height);
                }
                active.insert(name.clone());
                let mut height = 1;
                for (_, child, child_span) in &r.fields {
                    height =
                        height.max(1 + visit(child, rs, active, done, depth + 1, *child_span)?);
                }
                active.remove(name);
                done.insert(name.clone(), height);
                height
            }
            _ => 0,
        };
        if height > 16 {
            return Err(err(
                DiagnosticCode::LimitTypeDepth,
                "container type depth exceeds 16",
                span,
            ));
        }
        Ok(height)
    }
    visit(ty, rs, &mut BTreeSet::new(), &mut Env::new(), 0, span)
}

#[cfg(test)]
mod aggregate_bounds_tests {
    use super::*;
    #[test]
    fn copy_depth_preflight_rejects_before_recursive_duplication() {
        let p = parse("").unwrap();
        let limits = Limits::default();
        let mut machine = Machine::new(&p, &limits);
        let mut value = Value::Unit;
        for _ in 0..17 {
            value = Value::Record("A".into(), vec![("x".into(), value)]);
        }
        let error = machine.copy(&value, Span::default()).unwrap_err();
        assert_eq!(error.code, DiagnosticCode::LimitValueDepth);
        assert_eq!(error.kind, "Limit");
        assert!(error.message.contains("value depth"));
        assert_eq!(machine.allocation, 0);
    }
    #[test]
    fn cumulative_copy_payload_is_reserved_before_duplicate() {
        let p = parse("").unwrap();
        let limits = Limits {
            allocation_bytes: 69,
            ..Limits::default()
        };
        let mut machine = Machine::new(&p, &limits);
        // Record header+names+field = 66; string payload = 4.
        let value = Value::Record("A".into(), vec![("s".into(), Value::String("abcd".into()))]);
        assert_eq!(
            machine.copy(&value, Span::default()).unwrap_err().kind,
            "Limit"
        );
        assert_eq!(machine.allocation, 70);
    }

    #[test]
    fn shared_list_copy_is_constant_cost_and_preserves_backing() {
        let p = parse("let xs = [String; \"payload\", \"more\"]; ").unwrap();
        check(&p).unwrap();
        let limits = Limits::default();
        let mut machine = Machine::new(&p, &limits);
        let mut env = Env::new();
        machine.stmt(&p.statements[0], &mut env).unwrap();
        let before = (machine.fuel, machine.allocation);
        let copied = machine.copy(&env["xs"], Span::default()).unwrap();
        assert_eq!(
            (machine.fuel - before.0, machine.allocation - before.1),
            (1, 16)
        );
        let (Value::List(a), Value::List(b)) = (&env["xs"], &copied) else {
            panic!()
        };
        assert!(Arc::ptr_eq(&a.elements, &b.elements));
        assert_eq!(a.height, 1);
        let before = machine.fuel;
        assert!(machine.equal(&env["xs"], &copied, Span::default()).unwrap());
        // List + both strings + both copies' actual UTF-8 payloads.
        assert_eq!(machine.fuel - before, 1 + 2 + 2 * (7 + 4));
    }

    #[test]
    fn nested_record_copy_shares_lists_and_preflights_cached_combined_height() {
        let p = parse("record R {xs:[Int]} let r = new R {xs:[Int;1]};").unwrap();
        check(&p).unwrap();
        let limits = Limits::default();
        let mut machine = Machine::new(&p, &limits);
        let mut env = Env::new();
        machine.stmt(&p.statements[0], &mut env).unwrap();
        let before = machine.allocation;
        let copied = machine.copy(&env["r"], Span::default()).unwrap();
        assert_eq!(machine.allocation - before, 32 + 1 + 32 + 2 + 16);
        let (Value::Record(_, a), Value::Record(_, b)) = (&env["r"], &copied) else {
            panic!()
        };
        let (Value::List(a), Value::List(b)) = (&a[0].1, &b[0].1) else {
            panic!()
        };
        assert!(Arc::ptr_eq(&a.elements, &b.elements));

        let mut value = copied;
        for _ in 0..14 {
            value = Value::Record("Outer".into(), vec![("x".into(), value)]);
        }
        assert_eq!(machine.value_height(&value, Span::default()).unwrap(), 16);
        machine.copy(&value, Span::default()).unwrap();
        value = Value::Record("TooDeep".into(), vec![("x".into(), value)]);
        let before = machine.allocation;
        assert_eq!(
            machine.copy(&value, Span::default()).unwrap_err().code,
            DiagnosticCode::LimitValueDepth
        );
        assert_eq!(machine.allocation, before);
    }

    #[test]
    fn list_constructor_reserves_slots_before_any_element_effects() {
        let p = parse("[Int; {print(1); 2}];").unwrap();
        check(&p).unwrap();
        let limits = Limits {
            allocation_bytes: 63,
            ..Limits::default()
        };
        let mut machine = Machine::new(&p, &limits);
        let d = machine.stmt(&p.statements[0], &mut Env::new()).unwrap_err();
        assert_eq!(d.code, DiagnosticCode::LimitAllocation);
        assert_eq!(machine.output, "");
        assert_eq!(machine.allocation, 16 + 32 + 16);
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct Limits {
    #[serde(deserialize_with = "portable_usize")]
    pub source_bytes: usize,
    pub fuel: u64,
    #[serde(deserialize_with = "portable_usize")]
    pub call_depth: usize,
    #[serde(deserialize_with = "portable_usize")]
    pub evaluation_depth: usize,
    #[serde(deserialize_with = "portable_usize")]
    pub output_bytes: usize,
    #[serde(deserialize_with = "portable_usize")]
    pub allocation_bytes: usize,
    pub cases: u64,
}
// Transport accepts u64 on every target, then effective ceilings are applied.
fn portable_usize<'de, D: serde::Deserializer<'de>>(d: D) -> std::result::Result<usize, D::Error> {
    let value = u64::deserialize(d)?;
    Ok(value.min(usize::MAX as u64) as usize)
}
impl Default for Limits {
    fn default() -> Self {
        Self {
            source_bytes: 65536,
            fuel: 100000,
            call_depth: 32,
            evaluation_depth: 128,
            output_bytes: 8192,
            allocation_bytes: 1048576,
            cases: 1000,
        }
    }
}
impl Limits {
    pub fn clamp(&mut self) {
        let d = Self::default();
        self.source_bytes = self.source_bytes.min(d.source_bytes);
        self.fuel = self.fuel.min(d.fuel);
        self.call_depth = self.call_depth.min(d.call_depth);
        self.evaluation_depth = self.evaluation_depth.min(d.evaluation_depth);
        self.output_bytes = self.output_bytes.min(d.output_bytes);
        self.allocation_bytes = self.allocation_bytes.min(d.allocation_bytes);
        self.cases = self.cases.min(d.cases);
    }
}
pub struct Facts {
    pub calls: BTreeMap<String, BTreeSet<String>>,
    pub impure: BTreeSet<String>,
}
fn scan(e: &Expr, calls: &mut BTreeSet<String>, impure: &mut bool) {
    if let ExprKind::Call(n, _) = &e.kind {
        calls.insert(n.clone());
    }
    if let ExprKind::Block(stmts, _) = &e.kind {
        if stmts.iter().any(|s| matches!(s, Stmt::Print(_))) {
            *impure = true;
        }
    }
    for c in children(e) {
        scan(c, calls, impure);
    }
}
pub fn dependencies(e: &Expr) -> BTreeSet<String> {
    let mut c = BTreeSet::new();
    scan(e, &mut c, &mut false);
    c
}
pub fn closure(
    roots: &BTreeSet<String>,
    calls: &BTreeMap<String, BTreeSet<String>>,
) -> BTreeSet<String> {
    let mut seen = BTreeSet::new();
    let mut todo: Vec<_> = roots.iter().cloned().collect();
    while let Some(n) = todo.pop() {
        if seen.insert(n.clone()) {
            if let Some(cs) = calls.get(&n) {
                todo.extend(cs.iter().cloned());
            }
        }
    }
    seen
}
pub fn check(p: &Program) -> Result<Facts> {
    let mut records = Env::new();
    for r in &p.records {
        if records.insert(r.name.clone(), r).is_some() {
            return Err(err(
                DiagnosticCode::NameDuplicate,
                "duplicate record",
                r.span,
            ));
        }
        let mut names = BTreeSet::new();
        for (n, _, span) in &r.fields {
            if !names.insert(n) {
                return Err(err(
                    DiagnosticCode::FieldDuplicate,
                    "duplicate record field",
                    *span,
                ));
            }
        }
    }
    for r in &p.records {
        type_height(&Ty::Named(r.name.clone()), &records, r.span)?;
    }
    let mut funcs = Env::new();
    let mut facts = Facts {
        calls: BTreeMap::new(),
        impure: BTreeSet::new(),
    };
    for f in &p.functions {
        for t in f
            .params
            .iter()
            .map(|(_, t)| t)
            .chain(std::iter::once(&f.ret))
        {
            type_height(t, &records, f.span)?;
        }
        if funcs.insert(f.name.clone(), f).is_some() {
            return Err(err(
                DiagnosticCode::NameDuplicate,
                "duplicate function",
                f.span,
            ));
        }
        let mut cs = BTreeSet::new();
        let mut imp = false;
        scan(&f.body, &mut cs, &mut imp);
        facts.calls.insert(f.name.clone(), cs);
        if imp {
            facts.impure.insert(f.name.clone());
        }
    }
    for f in &p.functions {
        let mut env = Env::new();
        for (n, t) in &f.params {
            if env.insert(n.clone(), t.clone()).is_some() {
                return Err(err(
                    DiagnosticCode::NameDuplicate,
                    "duplicate parameter",
                    f.span,
                ));
            }
        }
        let t = type_expr(&f.body, &mut env, &funcs, &records)?;
        if t != f.ret {
            return Err(err(
                DiagnosticCode::TypeMismatch,
                "function result does not match declared type",
                f.body.span,
            ));
        }
    }
    let mut env = Env::new();
    for s in &p.statements {
        type_stmt(s, &mut env, &funcs, &records)?;
    }
    for probe in &p.probes {
        let mut env = Env::new();
        env.insert(probe.var.clone(), Ty::Int);
        if type_expr(&probe.body, &mut env, &funcs, &records)? != Ty::Bool {
            return Err(err(
                DiagnosticCode::TypeMismatch,
                "probe must produce Bool",
                probe.span,
            ));
        }
        let mut direct = false;
        scan(&probe.body, &mut BTreeSet::new(), &mut direct);
        let deps = closure(&dependencies(&probe.body), &facts.calls);
        if direct || deps.iter().any(|n| facts.impure.contains(n)) {
            return Err(err(
                DiagnosticCode::ProbeImpure,
                "probe transitively contains print",
                probe.span,
            ));
        }
    }
    Ok(facts)
}
fn type_stmt(s: &Stmt, env: &mut Env<Ty>, fs: &Env<&Function>, rs: &Env<&Record>) -> Result<()> {
    let t = type_expr(stmt_expr(s), env, fs, rs)?;
    if let Stmt::Let(n, e) = s {
        if env.contains_key(n) {
            return Err(err(
                DiagnosticCode::NameDuplicate,
                "duplicate immutable binding",
                e.span,
            ));
        }
        env.insert(n.clone(), t);
    }
    Ok(())
}
fn type_expr(e: &Expr, env: &mut Env<Ty>, fs: &Env<&Function>, rs: &Env<&Record>) -> Result<Ty> {
    let bad = || {
        err(
            DiagnosticCode::TypeMismatch,
            "incompatible expression types",
            e.span,
        )
    };
    Ok(match &e.kind {
        ExprKind::Int(_) => Ty::Int,
        ExprKind::Bool(_) => Ty::Bool,
        ExprKind::String(_) => Ty::String,
        ExprKind::List(element, elements) => {
            let ty = Ty::List(Box::new(element.clone()));
            type_height(&ty, rs, e.span)?;
            for value in elements {
                if type_expr(value, env, fs, rs)? != *element {
                    return Err(bad());
                }
            }
            ty
        }
        ExprKind::Index(receiver, index) => {
            let Ty::List(element) = type_expr(receiver, env, fs, rs)? else {
                return Err(bad());
            };
            if type_expr(index, env, fs, rs)? != Ty::Int {
                return Err(bad());
            }
            *element
        }
        ExprKind::Var(n) => env
            .get(n)
            .ok_or_else(|| {
                err(
                    DiagnosticCode::NameUnknown,
                    format!("unknown variable {n}"),
                    e.span,
                )
            })?
            .clone(),
        ExprKind::Construct(n, fields) => {
            let r = rs.get(n).ok_or_else(|| {
                err(
                    DiagnosticCode::NameUnknown,
                    format!("unknown record {n}"),
                    e.span,
                )
            })?;
            let mut seen = BTreeSet::new();
            for (name, span, value) in fields {
                if !seen.insert(name) {
                    return Err(err(
                        DiagnosticCode::FieldDuplicate,
                        "duplicate initializer field",
                        *span,
                    ));
                }
                let (_, ty, _) = r.fields.iter().find(|(f, _, _)| f == name).ok_or_else(|| {
                    err(
                        DiagnosticCode::FieldUnknown,
                        format!("unknown field {name}"),
                        *span,
                    )
                })?;
                if type_expr(value, env, fs, rs)? != *ty {
                    return Err(err(
                        DiagnosticCode::TypeMismatch,
                        "field initializer type mismatch",
                        value.span,
                    ));
                }
            }
            if fields.len() != r.fields.len() {
                return Err(err(
                    DiagnosticCode::FieldMissing,
                    "missing record field",
                    e.span,
                ));
            }
            Ty::Named(n.clone())
        }
        ExprKind::Project(receiver, name, span) => {
            let receiver_ty = type_expr(receiver, env, fs, rs)?;
            if matches!(receiver_ty, Ty::List(_)) {
                if name == "length" {
                    return Ok(Ty::Int);
                }
                return Err(err(
                    DiagnosticCode::TypeMismatch,
                    "list only has length",
                    *span,
                ));
            }
            let Ty::Named(n) = receiver_ty else {
                return Err(err(
                    DiagnosticCode::TypeMismatch,
                    "projection requires record",
                    *span,
                ));
            };
            rs[&n]
                .fields
                .iter()
                .find(|(f, _, _)| f == name)
                .ok_or_else(|| {
                    err(
                        DiagnosticCode::FieldUnknown,
                        format!("unknown field {name}"),
                        *span,
                    )
                })?
                .1
                .clone()
        }
        ExprKind::Call(n, args) => {
            let f = fs.get(n).ok_or_else(|| {
                err(
                    DiagnosticCode::NameUnknown,
                    format!("unknown function {n}"),
                    e.span,
                )
            })?;
            if args.len() != f.params.len() {
                return Err(err(
                    DiagnosticCode::TypeMismatch,
                    "argument count mismatch",
                    e.span,
                ));
            }
            for (a, (_, t)) in args.iter().zip(&f.params) {
                if type_expr(a, env, fs, rs)? != *t {
                    return Err(bad());
                }
            }
            f.ret.clone()
        }
        ExprKind::Unary(op, a) => {
            let t = type_expr(a, env, fs, rs)?;
            let want = if op == "!" { Ty::Bool } else { Ty::Int };
            if t != want {
                return Err(bad());
            }
            want
        }
        ExprKind::Binary(op, a, b) => {
            let x = type_expr(a, env, fs, rs)?;
            let y = type_expr(b, env, fs, rs)?;
            if x != y {
                return Err(bad());
            }
            match op.as_str() {
                "&&" | "||" => {
                    if x != Ty::Bool {
                        return Err(bad());
                    }
                    Ty::Bool
                }
                "==" | "!=" => Ty::Bool,
                "<" | ">" | "<=" | ">=" => {
                    if x != Ty::Int {
                        return Err(bad());
                    }
                    Ty::Bool
                }
                _ => {
                    if x != Ty::Int {
                        return Err(bad());
                    }
                    Ty::Int
                }
            }
        }
        ExprKind::If(c, a, b) => {
            if type_expr(c, env, fs, rs)? != Ty::Bool {
                return Err(bad());
            }
            let x = type_expr(a, env, fs, rs)?;
            if x != type_expr(b, env, fs, rs)? {
                return Err(bad());
            }
            x
        }
        ExprKind::Block(stmts, tail) => {
            let mut scope = env.clone();
            for s in stmts {
                type_stmt(s, &mut scope, fs, rs)?;
            }
            if let Some(t) = tail {
                type_expr(t, &mut scope, fs, rs)?
            } else {
                Ty::Unit
            }
        }
    })
}
pub struct Machine<'a> {
    pub functions: Env<&'a Function>,
    records: Env<&'a Record>,
    pub limits: &'a Limits,
    pub fuel: u64,
    pub allocation: usize,
    pub output: String,
    depth: usize,
    evaluation_depth: usize,
}
// A jump owns its evaluated arguments, never a caller's lexical environment.
// Returning it unwinds branch/block evaluation before the next function body.
enum Step<'a> {
    Value(Value),
    Tail(&'a Function, Env<Value>),
}
impl<'a> Machine<'a> {
    pub fn new(p: &'a Program, limits: &'a Limits) -> Self {
        Self {
            functions: p.functions.iter().map(|f| (f.name.clone(), f)).collect(),
            records: p.records.iter().map(|r| (r.name.clone(), r)).collect(),
            limits,
            fuel: 0,
            allocation: 0,
            output: String::new(),
            depth: 0,
            evaluation_depth: 0,
        }
    }
    pub(crate) fn alloc(&mut self, n: usize, span: Span) -> Result<()> {
        self.allocation = self.allocation.saturating_add(n);
        if self.allocation > self.limits.allocation_bytes {
            Err(err(
                DiagnosticCode::LimitAllocation,
                "logical allocation limit exceeded",
                span,
            ))
        } else {
            Ok(())
        }
    }
    pub(crate) fn tick(&mut self, n: usize, span: Span) -> Result<()> {
        self.fuel = self.fuel.saturating_add(n as u64);
        if self.fuel > self.limits.fuel {
            return Err(err(DiagnosticCode::LimitFuel, "fuel exhausted", span));
        }
        Ok(())
    }
    // Preflight the entire copy before any recursive allocation. Logical sizes
    // are target-independent, not measurements of allocator/process memory.
    fn value_height(&mut self, value: &Value, span: Span) -> Result<usize> {
        let mut stack = vec![(value, 0usize)];
        let mut height = 0;
        while let Some((value, depth)) = stack.pop() {
            self.tick(1, span)?;
            match value {
                Value::List(list) => height = height.max(depth + list.height),
                Value::Record(_, fields) => {
                    height = height.max(depth + 1);
                    if height > 16 {
                        return Err(err(
                            DiagnosticCode::LimitValueDepth,
                            "container value depth exceeds 16",
                            span,
                        ));
                    }
                    stack.extend(fields.iter().map(|(_, value)| (value, depth + 1)));
                }
                _ => {}
            }
        }
        Ok(height)
    }
    fn copy(&mut self, v: &Value, span: Span) -> Result<Value> {
        let mut stack = vec![(v, 0usize)];
        let mut bytes: usize = 0;
        let mut work: usize = 0;
        while let Some((v, depth)) = stack.pop() {
            work = work.saturating_add(1);
            match v {
                Value::String(s) => {
                    bytes = bytes.saturating_add(s.len());
                    work = work.saturating_add(s.len());
                }
                Value::Record(n, fields) => {
                    if depth >= 16 {
                        return Err(err(
                            DiagnosticCode::LimitValueDepth,
                            "record value depth exceeds 16",
                            span,
                        ));
                    }
                    bytes = bytes.saturating_add(32 + n.len() + fields.len() * 32);
                    for (name, child) in fields {
                        bytes = bytes.saturating_add(name.len());
                        stack.push((child, depth + 1));
                    }
                }
                Value::List(list) => {
                    if depth.saturating_add(list.height) > 16 {
                        return Err(err(
                            DiagnosticCode::LimitValueDepth,
                            "container value depth exceeds 16",
                            span,
                        ));
                    }
                    bytes = bytes.saturating_add(16);
                }
                _ => {}
            }
        }
        self.tick(work, span)?;
        self.alloc(bytes, span)?;
        fn duplicate(v: &Value) -> Value {
            match v {
                Value::Int(n) => Value::Int(*n),
                Value::Bool(b) => Value::Bool(*b),
                Value::Unit => Value::Unit,
                Value::String(s) => Value::String(s.clone()),
                Value::List(list) => Value::List(ListValue {
                    elements: Arc::clone(&list.elements),
                    height: list.height,
                }),
                Value::Record(n, fs) => Value::Record(
                    n.clone(),
                    fs.iter().map(|(n, v)| (n.clone(), duplicate(v))).collect(),
                ),
            }
        }
        Ok(duplicate(v))
    }
    fn equal(&mut self, a: &Value, b: &Value, span: Span) -> Result<bool> {
        let mut stack = vec![(a, b)];
        while let Some((a, b)) = stack.pop() {
            self.tick(1, span)?;
            let same = match (a, b) {
                (Value::Int(a), Value::Int(b)) => a == b,
                (Value::Bool(a), Value::Bool(b)) => a == b,
                (Value::Unit, Value::Unit) => true,
                (Value::String(a), Value::String(b)) => {
                    self.tick(a.len().saturating_add(b.len()), span)?;
                    a == b
                }
                (Value::Record(a, af), Value::Record(b, bf)) => {
                    if a != b || af.len() != bf.len() {
                        false
                    } else {
                        // LIFO stack: reverse pushes to visit declaration order.
                        stack.extend(af.iter().zip(bf).rev().map(|((_, a), (_, b))| (a, b)));
                        true
                    }
                }
                (Value::List(a), Value::List(b)) => {
                    if a.elements.len() != b.elements.len() {
                        false
                    } else {
                        stack.extend(a.elements.iter().zip(b.elements.iter()).rev());
                        true
                    }
                }
                _ => false,
            };
            if !same {
                return Ok(false);
            }
        }
        Ok(true)
    }
    fn emit(&mut self, text: &str, span: Span) -> Result<()> {
        self.tick(text.len(), span)?;
        if self.output.len().saturating_add(text.len()) > self.limits.output_bytes {
            return Err(err(
                DiagnosticCode::LimitOutput,
                "output limit exceeded",
                span,
            ));
        }
        self.output.push_str(text);
        Ok(())
    }
    fn display(&mut self, value: &Value, nested: bool, span: Span) -> Result<()> {
        self.tick(1, span)?;
        match value {
            Value::Int(n) => self.emit(&n.to_string(), span),
            Value::Bool(b) => self.emit(if *b { "true" } else { "false" }, span),
            Value::Unit => self.emit("()", span),
            Value::String(s) if !nested => self.emit(s, span),
            Value::String(s) => {
                self.emit("\"", span)?;
                for c in s.chars() {
                    match c {
                        '\n' => self.emit("\\n", span)?,
                        '\r' => self.emit("\\r", span)?,
                        '\t' => self.emit("\\t", span)?,
                        '"' => self.emit("\\\"", span)?,
                        '\\' => self.emit("\\\\", span)?,
                        c if c.is_control() => self.emit(&format!("\\u{:04x}", c as u32), span)?,
                        c => self.emit(c.encode_utf8(&mut [0; 4]), span)?,
                    }
                }
                self.emit("\"", span)
            }
            Value::Record(n, fs) => {
                self.emit(n, span)?;
                self.emit(" {", span)?;
                for (i, (n, v)) in fs.iter().enumerate() {
                    self.emit(if i == 0 { " " } else { ", " }, span)?;
                    self.emit(n, span)?;
                    self.emit(": ", span)?;
                    self.display(v, true, span)?;
                }
                self.emit(if fs.is_empty() { "}" } else { " }" }, span)
            }
            Value::List(list) => {
                self.emit("[", span)?;
                for (i, value) in list.elements.iter().enumerate() {
                    if i != 0 {
                        self.emit(", ", span)?;
                    }
                    self.display(value, true, span)?;
                }
                self.emit("]", span)
            }
        }
    }
    pub fn stmt(&mut self, s: &Stmt, env: &mut Env<Value>) -> Result<()> {
        let v = self.eval(stmt_expr(s), env)?;
        match s {
            Stmt::Let(n, e) => {
                self.alloc(n.len() + 32, e.span)?;
                env.insert(n.clone(), v);
            }
            Stmt::Print(e) => {
                let start = self.output.len();
                if let Err(d) = self
                    .display(&v, false, e.span)
                    .and_then(|()| self.emit("\n", e.span))
                {
                    self.output.truncate(start);
                    return Err(d);
                }
            }
            Stmt::Eval(_) => {}
        }
        Ok(())
    }
    pub fn eval(&mut self, e: &Expr, env: &mut Env<Value>) -> Result<Value> {
        match self.eval_step(e, env, false)? {
            Step::Value(v) => Ok(v),
            Step::Tail(_, _) => unreachable!(),
        }
    }
    fn eval_step(&mut self, e: &Expr, env: &mut Env<Value>, tail: bool) -> Result<Step<'a>> {
        if self.evaluation_depth >= self.limits.evaluation_depth {
            return Err(err(
                DiagnosticCode::LimitEvaluationDepth,
                "evaluation stack depth exceeded",
                e.span,
            ));
        }
        self.evaluation_depth += 1;
        let result = self.eval_inner(e, env, tail);
        self.evaluation_depth -= 1;
        result
    }
    fn call(&mut self, mut f: &'a Function, mut local: Env<Value>) -> Result<Value> {
        self.depth += 1;
        let result = (|| loop {
            match self.eval_step(&f.body, &mut local, true)? {
                Step::Value(v) => return Ok(v),
                Step::Tail(next, args) => {
                    f = next;
                    local = args;
                }
            }
        })();
        self.depth -= 1;
        result
    }
    fn projection_root(e: &Expr) -> bool {
        match &e.kind {
            ExprKind::Var(_) => true,
            ExprKind::Project(receiver, _, _) => Self::projection_root(receiver),
            _ => false,
        }
    }
    // Evaluate a variable-rooted projection chain without duplicating ancestors.
    // It still consumes the same expression entries and evaluation stack slots.
    fn borrow_projection<'v>(&mut self, e: &Expr, env: &'v Env<Value>) -> Result<&'v Value> {
        if self.evaluation_depth >= self.limits.evaluation_depth {
            return Err(err(
                DiagnosticCode::LimitEvaluationDepth,
                "evaluation stack depth exceeded",
                e.span,
            ));
        }
        self.evaluation_depth += 1;
        let result = (|| {
            self.tick(1, e.span)?;
            self.alloc(16, e.span)?;
            match &e.kind {
                ExprKind::Var(n) => Ok(&env[n]),
                ExprKind::Project(receiver, name, _) => {
                    let Value::Record(_, fields) = self.borrow_projection(receiver, env)? else {
                        unreachable!()
                    };
                    Ok(&fields.iter().find(|(n, _)| n == name).unwrap().1)
                }
                _ => unreachable!(),
            }
        })();
        self.evaluation_depth -= 1;
        result
    }
    fn eval_inner(&mut self, e: &Expr, env: &mut Env<Value>, tail: bool) -> Result<Step<'a>> {
        self.tick(1, e.span)?;
        self.alloc(16, e.span)?;
        Ok(Step::Value(match &e.kind {
            ExprKind::Int(n) => Value::Int(*n),
            ExprKind::Bool(b) => Value::Bool(*b),
            ExprKind::String(s) => {
                self.tick(s.len(), e.span)?;
                self.alloc(s.len(), e.span)?;
                Value::String(s.clone())
            }
            ExprKind::Var(n) => self.copy(&env[n], e.span)?,
            ExprKind::List(_, elements) => {
                if elements.len() > 1024 {
                    return Err(err(
                        DiagnosticCode::LimitListElements,
                        "list exceeds 1024 elements",
                        e.span,
                    ));
                }
                self.alloc(32 + 16 * elements.len(), e.span)?;
                let mut values = Vec::with_capacity(elements.len());
                let mut height = 1;
                for element in elements {
                    let value = self.eval(element, env)?;
                    height = height.max(1 + self.value_height(&value, e.span)?);
                    if height > 16 {
                        return Err(err(
                            DiagnosticCode::LimitValueDepth,
                            "container value depth exceeds 16",
                            e.span,
                        ));
                    }
                    values.push(value);
                }
                Value::List(ListValue {
                    elements: values.into(),
                    height,
                })
            }
            ExprKind::Index(receiver, index) => {
                // Receiver is evaluated first and owns a metered shared handle;
                // index effects may now safely borrow the environment mutably.
                let Value::List(list) = self.eval(receiver, env)? else {
                    unreachable!()
                };
                let Value::Int(index) = self.eval(index, env)? else {
                    unreachable!()
                };
                let index = usize::try_from(index)
                    .ok()
                    .filter(|i| *i < list.elements.len())
                    .ok_or_else(|| {
                        err(
                            DiagnosticCode::IndexBounds,
                            "list index out of bounds",
                            e.span,
                        )
                    })?;
                self.copy(&list.elements[index], e.span)?
            }
            ExprKind::Construct(n, fields) => {
                let r = self.records[n];
                // Height is already checked statically; construction moves children.
                self.alloc(
                    32 + n.len()
                        + r.fields.len() * 32
                        + r.fields.iter().map(|(n, _, _)| n.len()).sum::<usize>(),
                    e.span,
                )?;
                let mut values: Vec<Option<Value>> = (0..r.fields.len()).map(|_| None).collect();
                for (name, _, value) in fields {
                    let index = r.fields.iter().position(|(n, _, _)| n == name).unwrap();
                    values[index] = Some(self.eval(value, env)?);
                }
                // Runtime value depth is independent of syntax/call depth and
                // checked before building the enclosing recursive value.
                for value in &values {
                    if self.value_height(value.as_ref().unwrap(), e.span)? >= 16 {
                        return Err(err(
                            DiagnosticCode::LimitValueDepth,
                            "container value depth exceeds 16",
                            e.span,
                        ));
                    }
                }
                Value::Record(
                    n.clone(),
                    r.fields
                        .iter()
                        .enumerate()
                        .map(|(i, (name, _, _))| (name.clone(), values[i].take().unwrap()))
                        .collect(),
                )
            }
            ExprKind::Project(receiver, name, _) => {
                if Self::projection_root(receiver) {
                    match self.borrow_projection(receiver, env)? {
                        Value::List(list) => Value::Int(list.elements.len() as i64),
                        Value::Record(_, fields) => {
                            self.copy(&fields.iter().find(|(n, _)| n == name).unwrap().1, e.span)?
                        }
                        _ => unreachable!(),
                    }
                } else {
                    match self.eval(receiver, env)? {
                        Value::List(list) => Value::Int(list.elements.len() as i64),
                        // Computed receivers are owned: move the selected payload.
                        Value::Record(_, fields) => {
                            fields.into_iter().find(|(n, _)| n == name).unwrap().1
                        }
                        _ => unreachable!(),
                    }
                }
            }
            ExprKind::Call(n, args) => {
                if !tail && self.depth >= self.limits.call_depth {
                    return Err(err(
                        DiagnosticCode::LimitCallDepth,
                        "call depth exceeded",
                        e.span,
                    ));
                }
                let f = self.functions[n];
                let mut local = Env::new();
                for (a, (n, _)) in args.iter().zip(&f.params) {
                    let v = self.eval(a, env)?;
                    self.alloc(n.len() + 32, a.span)?;
                    local.insert(n.clone(), v);
                }
                if tail {
                    return Ok(Step::Tail(f, local));
                }
                self.call(f, local)?
            }
            ExprKind::Unary(op, a) => {
                match (self.eval(a, env)?, op.as_str()) {
                    (Value::Bool(b), "!") => Value::Bool(!b),
                    (Value::Int(n), "-") => Value::Int(n.checked_neg().ok_or_else(|| {
                        err(DiagnosticCode::IntOverflow, "integer overflow", e.span)
                    })?),
                    _ => unreachable!(),
                }
            }
            ExprKind::Binary(op, a, b) => {
                let x = self.eval(a, env)?;
                if op == "&&" && matches!(x, Value::Bool(false)) {
                    return Ok(Step::Value(x));
                }
                if op == "||" && matches!(x, Value::Bool(true)) {
                    return Ok(Step::Value(x));
                }
                let y = self.eval(b, env)?;
                match op.as_str() {
                    "==" => Value::Bool(self.equal(&x, &y, e.span)?),
                    "!=" => Value::Bool(!self.equal(&x, &y, e.span)?),
                    "&&" | "||" => y,
                    _ => {
                        let (Value::Int(a), Value::Int(b)) = (x, y) else {
                            unreachable!()
                        };
                        match op.as_str() {
                            "<" => Value::Bool(a < b),
                            ">" => Value::Bool(a > b),
                            "<=" => Value::Bool(a <= b),
                            ">=" => Value::Bool(a >= b),
                            _ => {
                                let n = match op.as_str() {
                                    "+" => a.checked_add(b),
                                    "-" => a.checked_sub(b),
                                    "*" => a.checked_mul(b),
                                    "/" => a.checked_div(b),
                                    "%" => a.checked_rem(b),
                                    _ => unreachable!(),
                                };
                                Value::Int(n.ok_or_else(|| {
                                    let code = if b == 0 && matches!(op.as_str(), "/" | "%") {
                                        DiagnosticCode::DivZero
                                    } else {
                                        DiagnosticCode::IntOverflow
                                    };
                                    err(code, "integer overflow or division by zero", e.span)
                                })?)
                            }
                        }
                    }
                }
            }
            ExprKind::If(c, a, b) => {
                if matches!(self.eval(c, env)?, Value::Bool(true)) {
                    return self.eval_step(a, env, tail);
                } else {
                    return self.eval_step(b, env, tail);
                }
            }
            ExprKind::Block(stmts, block_tail) => {
                let result = (|| {
                    for s in stmts {
                        self.stmt(s, env)?;
                    }
                    if let Some(t) = block_tail {
                        self.eval_step(t, env, tail)
                    } else {
                        Ok(Step::Value(Value::Unit))
                    }
                })();
                // Checked immutable bindings never shadow inherited names.
                // Cleanup is required on jumps and errors as well as values.
                for s in stmts {
                    if let Stmt::Let(n, _) = s {
                        env.remove(n);
                    }
                }
                return result;
            }
        }))
    }
}
