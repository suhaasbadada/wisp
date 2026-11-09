use serde::Serialize;

#[derive(Clone, Copy, Debug, Default, Serialize)]
pub struct Span {
    pub start: usize,
    pub end: usize,
}
#[derive(Clone, Debug, Serialize)]
pub struct Diagnostic {
    pub kind: String,
    pub message: String,
    pub span: Span,
}
pub type Result<T> = std::result::Result<T, Diagnostic>;
pub fn err(kind: &str, message: impl Into<String>, span: Span) -> Diagnostic {
    Diagnostic {
        kind: kind.into(),
        message: message.into(),
        span,
    }
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
pub enum Ty {
    Int,
    Bool,
    String,
    Unit,
}
#[derive(Clone, Debug)]
pub enum ExprKind {
    Int(i64),
    Bool(bool),
    String(String),
    Var(String),
    Call(String, Vec<Expr>),
    Unary(String, Box<Expr>),
    Binary(String, Box<Expr>, Box<Expr>),
    Block(Vec<Stmt>, Option<Box<Expr>>),
    If(Box<Expr>, Box<Expr>, Box<Expr>),
}
#[derive(Clone, Debug)]
pub struct Expr {
    pub kind: ExprKind,
    pub span: Span,
}
#[derive(Clone, Debug)]
pub enum Stmt {
    Let(String, Expr),
    Print(Expr),
    Eval(Expr),
}
#[derive(Clone, Debug)]
pub struct Function {
    pub name: String,
    pub params: Vec<(String, Ty)>,
    pub ret: Ty,
    pub body: Expr,
    pub span: Span,
}
#[derive(Clone, Debug)]
pub struct Probe {
    pub var: String,
    pub lo: i64,
    pub hi: i64,
    pub body: Expr,
    pub span: Span,
}
pub struct Program {
    pub functions: Vec<Function>,
    pub statements: Vec<Stmt>,
    pub probes: Vec<Probe>,
}
#[derive(Clone, Debug)]
struct Token {
    text: String,
    span: Span,
    string: bool,
}
fn lex(source: &str) -> Result<Vec<Token>> {
    let mut out = Vec::new();
    let mut i = 0;
    while i < source.len() {
        let c = source[i..].chars().next().unwrap();
        let start = i;
        if c.is_whitespace() {
            i += c.len_utf8();
            continue;
        }
        if source[i..].starts_with("//") {
            while i < source.len() && source.as_bytes()[i] != b'\n' {
                i += 1;
            }
            continue;
        }
        let mut string = false;
        let text = if c == '"' {
            string = true;
            i += 1;
            let mut s = String::new();
            let mut closed = false;
            while i < source.len() {
                let ch = source[i..].chars().next().unwrap();
                i += ch.len_utf8();
                if ch == '"' {
                    closed = true;
                    break;
                }
                if ch == '\\' {
                    let escape = source[i..].chars().next().ok_or_else(|| {
                        err("Syntax", "unterminated escape", Span { start, end: i })
                    })?;
                    i += escape.len_utf8();
                    s.push(match escape {
                        'n' => '\n',
                        't' => '\t',
                        'r' => '\r',
                        '"' => '"',
                        '\\' => '\\',
                        _ => {
                            return Err(err("Syntax", "unsupported escape", Span { start, end: i }))
                        }
                    });
                } else {
                    s.push(ch);
                }
            }
            if !closed {
                return Err(err("Syntax", "unterminated string", Span { start, end: i }));
            }
            s
        } else if c.is_ascii_digit() || c.is_ascii_alphabetic() || c == '_' {
            i += 1;
            while i < source.len() {
                let b = source.as_bytes()[i];
                if b.is_ascii_alphanumeric() || b == b'_' {
                    i += 1;
                } else {
                    break;
                }
            }
            source[start..i].into()
        } else {
            let op = ["..=", "->", ">=", "<=", "==", "!=", "&&", "||"]
                .into_iter()
                .find(|op| source[i..].starts_with(op));
            if let Some(op) = op {
                i += op.len();
                op.into()
            } else if "(){}:;,+-*/%!<>=".contains(c) {
                i += 1;
                c.to_string()
            } else {
                return Err(err(
                    "Syntax",
                    "unsupported character",
                    Span {
                        start,
                        end: start + c.len_utf8(),
                    },
                ));
            }
        };
        out.push(Token {
            text,
            span: Span { start, end: i },
            string,
        });
        if out.len() > 8192 {
            return Err(err("Limit", "token limit exceeded", Span { start, end: i }));
        }
    }
    out.push(Token {
        text: "<eof>".into(),
        span: Span { start: i, end: i },
        string: false,
    });
    Ok(out)
}
struct Parser {
    tokens: Vec<Token>,
    pos: usize,
    depth: usize,
}
impl Parser {
    fn token(&self) -> &Token {
        &self.tokens[self.pos]
    }
    fn at(&self, s: &str) -> bool {
        !self.token().string && self.token().text == s
    }
    fn take(&mut self, s: &str) -> bool {
        if self.at(s) {
            self.pos += 1;
            true
        } else {
            false
        }
    }
    fn expect(&mut self, s: &str) -> Result<()> {
        if self.take(s) {
            Ok(())
        } else {
            Err(err("Syntax", format!("expected {s}"), self.token().span))
        }
    }
    fn name(&mut self) -> Result<String> {
        let t = self.token().clone();
        if !t.string
            && t.text
                .as_bytes()
                .first()
                .is_some_and(|b| b.is_ascii_alphabetic() || *b == b'_')
            && ![
                "fn", "if", "else", "let", "print", "probe", "in", "true", "false", "Int", "Bool",
                "String",
            ]
            .contains(&t.text.as_str())
        {
            self.pos += 1;
            Ok(t.text)
        } else {
            Err(err("Syntax", "expected identifier", t.span))
        }
    }
    fn ty(&mut self) -> Result<Ty> {
        if self.take("Int") {
            Ok(Ty::Int)
        } else if self.take("Bool") {
            Ok(Ty::Bool)
        } else if self.take("String") {
            Ok(Ty::String)
        } else {
            Err(err(
                "Syntax",
                "expected Int, Bool or String",
                self.token().span,
            ))
        }
    }
    fn integer(&mut self) -> Result<i64> {
        let neg = self.take("-");
        let t = self.token().clone();
        if t.string {
            return Err(err("Syntax", "expected integer, not string", t.span));
        }
        self.pos += 1;
        let text = if neg { format!("-{}", t.text) } else { t.text };
        text.parse()
            .map_err(|_| err("Syntax", "integer outside i64 or invalid integer", t.span))
    }
    fn stmt(&mut self) -> Result<Option<Stmt>> {
        if self.take("let") {
            let n = self.name()?;
            self.expect("=")?;
            let e = self.expr(0)?;
            self.expect(";")?;
            Ok(Some(Stmt::Let(n, e)))
        } else if self.take("print") {
            self.expect("(")?;
            let e = self.expr(0)?;
            self.expect(")")?;
            self.expect(";")?;
            Ok(Some(Stmt::Print(e)))
        } else {
            Ok(None)
        }
    }
    fn expr(&mut self, min: u8) -> Result<Expr> {
        self.depth += 1;
        if self.depth > 64 {
            return Err(err("Limit", "syntax depth exceeded", self.token().span));
        }
        let start = self.token().span.start;
        let mut left = if self.at("-")
            && self
                .tokens
                .get(self.pos + 1)
                .is_some_and(|t| t.text == "9223372036854775808")
        {
            let n = self.integer()?;
            Expr {
                kind: ExprKind::Int(n),
                span: Span {
                    start,
                    end: self.tokens[self.pos - 1].span.end,
                },
            }
        } else if self.at("!") || self.at("-") {
            let op = self.token().text.clone();
            self.pos += 1;
            let e = self.expr(7)?;
            Expr {
                span: Span {
                    start,
                    end: e.span.end,
                },
                kind: ExprKind::Unary(op, Box::new(e)),
            }
        } else if self.take("if") {
            let c = self.expr(0)?;
            let a = self.block()?;
            self.expect("else")?;
            let b = self.block()?;
            Expr {
                span: Span {
                    start,
                    end: b.span.end,
                },
                kind: ExprKind::If(Box::new(c), Box::new(a), Box::new(b)),
            }
        } else if self.at("{") {
            self.block()?
        } else if self.take("(") {
            let e = self.expr(0)?;
            self.expect(")")?;
            e
        } else {
            let t = self.token().clone();
            if t.string {
                self.pos += 1;
                Expr {
                    kind: ExprKind::String(t.text),
                    span: t.span,
                }
            } else if self.take("true") || self.take("false") {
                Expr {
                    kind: ExprKind::Bool(t.text == "true"),
                    span: t.span,
                }
            } else if t.text.as_bytes()[0].is_ascii_digit() {
                let n = self.integer()?;
                Expr {
                    kind: ExprKind::Int(n),
                    span: t.span,
                }
            } else {
                let name = self.name()?;
                let kind = if self.take("(") {
                    let mut args = Vec::new();
                    if !self.at(")") {
                        loop {
                            args.push(self.expr(0)?);
                            if !self.take(",") {
                                break;
                            }
                        }
                    }
                    self.expect(")")?;
                    ExprKind::Call(name, args)
                } else {
                    ExprKind::Var(name)
                };
                Expr {
                    kind,
                    span: Span {
                        start,
                        end: self.tokens[self.pos - 1].span.end,
                    },
                }
            }
        };
        let mut chain = 0;
        loop {
            let op = self.token().text.clone();
            let prec = match op.as_str() {
                "||" => 1,
                "&&" => 2,
                "==" | "!=" => 3,
                "<" | ">" | "<=" | ">=" => 4,
                "+" | "-" => 5,
                "*" | "/" | "%" => 6,
                _ => 0,
            };
            if self.token().string || prec == 0 || prec < min {
                break;
            }
            chain += 1;
            if chain > 64 {
                return Err(err("Limit", "operator chain depth exceeded", left.span));
            }
            self.pos += 1;
            let right = self.expr(prec + 1)?;
            let span = Span {
                start,
                end: right.span.end,
            };
            left = Expr {
                kind: ExprKind::Binary(op, Box::new(left), Box::new(right)),
                span,
            };
        }
        self.depth -= 1;
        Ok(left)
    }
    fn block(&mut self) -> Result<Expr> {
        let start = self.token().span.start;
        self.expect("{")?;
        let mut stmts = Vec::new();
        let mut tail = None;
        while !self.at("}") {
            if let Some(s) = self.stmt()? {
                stmts.push(s);
            } else {
                let e = self.expr(0)?;
                if self.take(";") {
                    stmts.push(Stmt::Eval(e));
                } else {
                    tail = Some(Box::new(e));
                    break;
                }
            }
        }
        self.expect("}")?;
        Ok(Expr {
            kind: ExprKind::Block(stmts, tail),
            span: Span {
                start,
                end: self.tokens[self.pos - 1].span.end,
            },
        })
    }
}
pub fn parse(source: &str) -> Result<Program> {
    let mut p = Parser {
        tokens: lex(source)?,
        pos: 0,
        depth: 0,
    };
    let mut program = Program {
        functions: Vec::new(),
        statements: Vec::new(),
        probes: Vec::new(),
    };
    while !p.at("<eof>") {
        let start = p.token().span.start;
        if p.take("fn") {
            let name = p.name()?;
            p.expect("(")?;
            let mut params = Vec::new();
            if !p.at(")") {
                loop {
                    let n = p.name()?;
                    p.expect(":")?;
                    params.push((n, p.ty()?));
                    if !p.take(",") {
                        break;
                    }
                }
            }
            p.expect(")")?;
            p.expect("->")?;
            let ret = p.ty()?;
            let body = p.block()?;
            let span = Span {
                start,
                end: body.span.end,
            };
            program.functions.push(Function {
                name,
                params,
                ret,
                body,
                span,
            });
        } else if p.take("probe") {
            let var = p.name()?;
            p.expect("in")?;
            let lo = p.integer()?;
            p.expect("..=")?;
            let hi = p.integer()?;
            let body = p.block()?;
            let span = Span {
                start,
                end: body.span.end,
            };
            program.probes.push(Probe {
                var,
                lo,
                hi,
                body,
                span,
            });
        } else if let Some(s) = p.stmt()? {
            program.statements.push(s);
        } else {
            let e = p.expr(0)?;
            p.expect(";")?;
            program.statements.push(Stmt::Eval(e));
        }
    }
    // Left-associative operator chains also consume recursive checker/interpreter stack.
    let mut stack: Vec<(&Expr, usize)> = program
        .functions
        .iter()
        .map(|f| (&f.body, 0))
        .chain(program.probes.iter().map(|p| (&p.body, 0)))
        .collect();
    for s in &program.statements {
        stack.push((stmt_expr(s), 0));
    }
    while let Some((e, d)) = stack.pop() {
        if d > 64 {
            return Err(err("Limit", "AST depth exceeded", e.span));
        }
        for child in children(e) {
            stack.push((child, d + 1));
        }
    }
    Ok(program)
}
pub fn stmt_expr(s: &Stmt) -> &Expr {
    match s {
        Stmt::Let(_, e) | Stmt::Print(e) | Stmt::Eval(e) => e,
    }
}
pub fn children(e: &Expr) -> Vec<&Expr> {
    match &e.kind {
        ExprKind::Call(_, a) => a.iter().collect(),
        ExprKind::Unary(_, a) => vec![a],
        ExprKind::Binary(_, a, b) => vec![a, b],
        ExprKind::If(a, b, c) => vec![a, b, c],
        ExprKind::Block(s, t) => s
            .iter()
            .map(stmt_expr)
            .chain(t.iter().map(|e| e.as_ref()))
            .collect(),
        _ => vec![],
    }
}
