use crate::syntax::*;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};
pub type Env<T> = BTreeMap<String, T>;
#[derive(Clone, Debug, PartialEq)]
pub enum Value {
    Int(i64),
    Bool(bool),
    String(String),
    Unit,
}
impl Value {
    pub fn text(&self) -> String {
        match self {
            Self::Int(n) => n.to_string(),
            Self::Bool(b) => b.to_string(),
            Self::String(s) => s.clone(),
            Self::Unit => "()".into(),
        }
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct Limits {
    pub source_bytes: usize,
    pub fuel: u64,
    pub call_depth: usize,
    pub output_bytes: usize,
    pub allocation_bytes: usize,
    pub cases: u64,
}
impl Default for Limits {
    fn default() -> Self {
        Self {
            source_bytes: 65536,
            fuel: 100000,
            call_depth: 32,
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
    let mut funcs = Env::new();
    let mut facts = Facts {
        calls: BTreeMap::new(),
        impure: BTreeSet::new(),
    };
    for f in &p.functions {
        if funcs.insert(f.name.clone(), f).is_some() {
            return Err(err("Type", "duplicate function", f.span));
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
            if env.insert(n.clone(), *t).is_some() {
                return Err(err("Type", "duplicate parameter", f.span));
            }
        }
        let t = type_expr(&f.body, &mut env, &funcs)?;
        if t != f.ret {
            return Err(err(
                "Type",
                "function result does not match declared type",
                f.body.span,
            ));
        }
    }
    let mut env = Env::new();
    for s in &p.statements {
        type_stmt(s, &mut env, &funcs)?;
    }
    for probe in &p.probes {
        let mut env = Env::new();
        env.insert(probe.var.clone(), Ty::Int);
        if type_expr(&probe.body, &mut env, &funcs)? != Ty::Bool {
            return Err(err("Type", "probe must produce Bool", probe.span));
        }
        let mut direct = false;
        scan(&probe.body, &mut BTreeSet::new(), &mut direct);
        let deps = closure(&dependencies(&probe.body), &facts.calls);
        if direct || deps.iter().any(|n| facts.impure.contains(n)) {
            return Err(err(
                "Purity",
                "probe transitively contains print",
                probe.span,
            ));
        }
    }
    Ok(facts)
}
fn type_stmt(s: &Stmt, env: &mut Env<Ty>, fs: &Env<&Function>) -> Result<()> {
    let t = type_expr(stmt_expr(s), env, fs)?;
    if let Stmt::Let(n, e) = s {
        if env.contains_key(n) {
            return Err(err("Type", "duplicate immutable binding", e.span));
        }
        env.insert(n.clone(), t);
    }
    Ok(())
}
fn type_expr(e: &Expr, env: &mut Env<Ty>, fs: &Env<&Function>) -> Result<Ty> {
    let bad = || err("Type", "incompatible expression types", e.span);
    Ok(match &e.kind {
        ExprKind::Int(_) => Ty::Int,
        ExprKind::Bool(_) => Ty::Bool,
        ExprKind::String(_) => Ty::String,
        ExprKind::Var(n) => *env
            .get(n)
            .ok_or_else(|| err("Type", format!("unknown variable {n}"), e.span))?,
        ExprKind::Call(n, args) => {
            let f = fs
                .get(n)
                .ok_or_else(|| err("Type", format!("unknown function {n}"), e.span))?;
            if args.len() != f.params.len() {
                return Err(err("Type", "argument count mismatch", e.span));
            }
            for (a, (_, t)) in args.iter().zip(&f.params) {
                if type_expr(a, env, fs)? != *t {
                    return Err(bad());
                }
            }
            f.ret
        }
        ExprKind::Unary(op, a) => {
            let t = type_expr(a, env, fs)?;
            let want = if op == "!" { Ty::Bool } else { Ty::Int };
            if t != want {
                return Err(bad());
            }
            want
        }
        ExprKind::Binary(op, a, b) => {
            let x = type_expr(a, env, fs)?;
            let y = type_expr(b, env, fs)?;
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
            if type_expr(c, env, fs)? != Ty::Bool {
                return Err(bad());
            }
            let x = type_expr(a, env, fs)?;
            if x != type_expr(b, env, fs)? {
                return Err(bad());
            }
            x
        }
        ExprKind::Block(stmts, tail) => {
            let mut scope = env.clone();
            for s in stmts {
                type_stmt(s, &mut scope, fs)?;
            }
            if let Some(t) = tail {
                type_expr(t, &mut scope, fs)?
            } else {
                Ty::Unit
            }
        }
    })
}
pub struct Machine<'a> {
    pub functions: Env<&'a Function>,
    pub limits: &'a Limits,
    pub fuel: u64,
    pub allocation: usize,
    pub output: String,
    depth: usize,
}
impl<'a> Machine<'a> {
    pub fn new(p: &'a Program, limits: &'a Limits) -> Self {
        Self {
            functions: p.functions.iter().map(|f| (f.name.clone(), f)).collect(),
            limits,
            fuel: 0,
            allocation: 0,
            output: String::new(),
            depth: 0,
        }
    }
    fn alloc(&mut self, n: usize, span: Span) -> Result<()> {
        self.allocation = self.allocation.saturating_add(n);
        if self.allocation > self.limits.allocation_bytes {
            Err(err("Limit", "logical allocation limit exceeded", span))
        } else {
            Ok(())
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
                let t = v.text();
                if self.output.len().saturating_add(t.len() + 1) > self.limits.output_bytes {
                    return Err(err("Limit", "output limit exceeded", e.span));
                }
                self.output.push_str(&t);
                self.output.push('\n');
            }
            Stmt::Eval(_) => {}
        }
        Ok(())
    }
    pub fn eval(&mut self, e: &Expr, env: &mut Env<Value>) -> Result<Value> {
        self.fuel += 1;
        if self.fuel > self.limits.fuel {
            return Err(err("Limit", "fuel exhausted", e.span));
        }
        self.alloc(16, e.span)?;
        Ok(match &e.kind {
            ExprKind::Int(n) => Value::Int(*n),
            ExprKind::Bool(b) => Value::Bool(*b),
            ExprKind::String(s) => {
                self.alloc(s.len(), e.span)?;
                Value::String(s.clone())
            }
            ExprKind::Var(n) => {
                let v = env[n].clone();
                if let Value::String(s) = &v {
                    self.alloc(s.len(), e.span)?;
                }
                v
            }
            ExprKind::Call(n, args) => {
                if self.depth >= self.limits.call_depth {
                    return Err(err("Limit", "call depth exceeded", e.span));
                }
                let f = self.functions[n];
                let mut local = Env::new();
                for (a, (n, _)) in args.iter().zip(&f.params) {
                    let v = self.eval(a, env)?;
                    local.insert(n.clone(), v);
                }
                self.depth += 1;
                let result = self.eval(&f.body, &mut local);
                self.depth -= 1;
                result?
            }
            ExprKind::Unary(op, a) => match (self.eval(a, env)?, op.as_str()) {
                (Value::Bool(b), "!") => Value::Bool(!b),
                (Value::Int(n), "-") => Value::Int(
                    n.checked_neg()
                        .ok_or_else(|| err("Runtime", "integer overflow", e.span))?,
                ),
                _ => unreachable!(),
            },
            ExprKind::Binary(op, a, b) => {
                let x = self.eval(a, env)?;
                if op == "&&" && x == Value::Bool(false) {
                    return Ok(x);
                }
                if op == "||" && x == Value::Bool(true) {
                    return Ok(x);
                }
                let y = self.eval(b, env)?;
                match op.as_str() {
                    "==" => Value::Bool(x == y),
                    "!=" => Value::Bool(x != y),
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
                                    err("Runtime", "integer overflow or division by zero", e.span)
                                })?)
                            }
                        }
                    }
                }
            }
            ExprKind::If(c, a, b) => {
                if self.eval(c, env)? == Value::Bool(true) {
                    self.eval(a, env)?
                } else {
                    self.eval(b, env)?
                }
            }
            ExprKind::Block(stmts, tail) => {
                self.alloc(
                    env.len().saturating_mul(64)
                        + env
                            .values()
                            .map(|v| if let Value::String(s) = v { s.len() } else { 0 })
                            .sum::<usize>(),
                    e.span,
                )?;
                let mut local = env.clone();
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
