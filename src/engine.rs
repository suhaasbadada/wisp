use crate::syntax::*;
use crate::DiagnosticCode;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};
pub type Env<T> = BTreeMap<String, T>;
#[derive(Debug)]
pub enum Value {
    Int(i64),
    Bool(bool),
    String(String),
    Unit,
    Record(String, Vec<(String, Value)>),
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
    // Memoized DAG heights avoid expanding shared record types as trees.
    fn height(
        n: &str,
        rs: &Env<&Record>,
        active: &mut BTreeSet<String>,
        done: &mut Env<usize>,
    ) -> Result<usize> {
        if let Some(d) = done.get(n) {
            return Ok(*d);
        }
        let r = rs[n];
        if !active.insert(n.into()) {
            return Err(err(
                DiagnosticCode::TypeRecursive,
                "recursive record type",
                r.span,
            ));
        }
        if active.len() > 16 {
            return Err(err(
                DiagnosticCode::LimitTypeDepth,
                "record type depth exceeds 16",
                r.span,
            ));
        }
        let mut depth = 1;
        for (_, t, span) in &r.fields {
            if let Ty::Named(child) = t {
                if !rs.contains_key(child) {
                    return Err(err(
                        DiagnosticCode::NameUnknown,
                        format!("unknown type {child}"),
                        *span,
                    ));
                }
                depth = depth.max(1 + height(child, rs, active, done)?);
            }
        }
        if depth > 16 {
            return Err(err(
                DiagnosticCode::LimitTypeDepth,
                "record type depth exceeds 16",
                r.span,
            ));
        }
        active.remove(n);
        done.insert(n.into(), depth);
        Ok(depth)
    }
    let mut done = Env::new();
    for r in &p.records {
        height(&r.name, &records, &mut BTreeSet::new(), &mut done)?;
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
            if let Ty::Named(n) = t {
                if !records.contains_key(n) {
                    return Err(err(
                        DiagnosticCode::NameUnknown,
                        format!("unknown type {n}"),
                        f.span,
                    ));
                }
            }
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
            let Ty::Named(n) = type_expr(receiver, env, fs, rs)? else {
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
    fn copy(&mut self, v: &Value, span: Span) -> Result<Value> {
        let mut stack = vec![(v, 0)];
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
        if self.evaluation_depth >= self.limits.evaluation_depth {
            return Err(err(
                DiagnosticCode::LimitEvaluationDepth,
                "evaluation stack depth exceeded",
                e.span,
            ));
        }
        self.evaluation_depth += 1;
        let result = self.eval_inner(e, env);
        self.evaluation_depth -= 1;
        result
    }
    fn eval_inner(&mut self, e: &Expr, env: &mut Env<Value>) -> Result<Value> {
        self.tick(1, e.span)?;
        self.alloc(16, e.span)?;
        Ok(match &e.kind {
            ExprKind::Int(n) => Value::Int(*n),
            ExprKind::Bool(b) => Value::Bool(*b),
            ExprKind::String(s) => {
                self.tick(s.len(), e.span)?;
                self.alloc(s.len(), e.span)?;
                Value::String(s.clone())
            }
            ExprKind::Var(n) => self.copy(&env[n], e.span)?,
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
                let mut stack: Vec<_> = values.iter().map(|v| (v.as_ref().unwrap(), 1)).collect();
                while let Some((value, depth)) = stack.pop() {
                    self.tick(1, e.span)?;
                    if let Value::Record(_, children) = value {
                        if depth >= 16 {
                            return Err(err(
                                DiagnosticCode::LimitValueDepth,
                                "record value depth exceeds 16",
                                e.span,
                            ));
                        }
                        stack.extend(children.iter().map(|(_, v)| (v, depth + 1)));
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
                let Value::Record(_, fields) = self.eval(receiver, env)? else {
                    unreachable!()
                };
                self.copy(&fields.iter().find(|(n, _)| n == name).unwrap().1, e.span)?
            }
            ExprKind::Call(n, args) => {
                if self.depth >= self.limits.call_depth {
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
                self.depth += 1;
                let result = self.eval(&f.body, &mut local);
                self.depth -= 1;
                result?
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
                    return Ok(x);
                }
                if op == "||" && matches!(x, Value::Bool(true)) {
                    return Ok(x);
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
                    self.eval(a, env)?
                } else {
                    self.eval(b, env)?
                }
            }
            ExprKind::Block(stmts, tail) => {
                self.alloc(
                    env.len().saturating_mul(64) + env.keys().map(String::len).sum::<usize>(),
                    e.span,
                )?;
                let mut local = Env::new();
                for (n, v) in env.iter() {
                    local.insert(n.clone(), self.copy(v, e.span)?);
                }
                for s in stmts {
                    self.stmt(s, &mut local)?;
                }
                if let Some(t) = tail {
                    self.eval(t, &mut local)?
                } else {
                    Value::Unit
                }
            }
        })
    }
}
