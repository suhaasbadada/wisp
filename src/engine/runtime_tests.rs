use super::*;

fn program(source: &str) -> Program {
    let p = parse(source).unwrap();
    check(&p).unwrap();
    p
}

fn run(machine: &mut Machine<'_>, p: &Program, env: &mut Env<Value>) -> Result<()> {
    for s in &p.statements {
        machine.stmt(s, env)?;
    }
    Ok(())
}

#[test]
fn direct_and_mutual_tail_calls_unwind_selected_branches_and_blocks() {
    let p = program(
        "fn direct(n: Int, sum: Int) -> Int {
            if n == 0 { sum } else {
                let next = n - 1;
                direct(next, sum + 1)
            }
        }
        fn even(n: Int) -> Bool {
            if n == 0 { true } else { odd(n - 1) }
        }
        fn odd(n: Int) -> Bool {
            if n == 0 { false } else { even(n - 1) }
        }
        print(direct(1000, 0));
        print(even(1001));",
    );
    let limits = Limits {
        call_depth: 1,
        ..Limits::default()
    };
    let mut machine = Machine::new(&p, &limits);
    run(&mut machine, &p, &mut Env::new()).unwrap();
    assert_eq!(machine.output, "1000\nfalse\n");
    assert_eq!((machine.depth, machine.evaluation_depth), (0, 0));
}

#[test]
fn operand_initializer_condition_and_statement_calls_are_not_tail_calls() {
    for source in [
        "fn f(n: Int) -> Int { if n == 0 { 1 } else { n * f(n - 1) } } print(f(100));",
        "fn f() -> Int { let x = f(); x } print(f());",
        "fn f() -> Bool { if f() { true } else { false } } print(f());",
        "fn f() -> Int { f(); 1 } print(f());",
        "fn f(n: Int) -> Int { f(f(n)) } print(f(1));",
    ] {
        let p = program(source);
        let limits = Limits {
            call_depth: 3,
            ..Limits::default()
        };
        let mut machine = Machine::new(&p, &limits);
        let error = run(&mut machine, &p, &mut Env::new()).unwrap_err();
        assert_eq!(error.code, DiagnosticCode::LimitCallDepth, "{source}");
        assert_eq!((machine.depth, machine.evaluation_depth), (0, 0));
    }
}

#[test]
fn infinite_tail_calls_exhaust_cumulative_budgets_not_the_host_stack() {
    let p = program("fn forever() -> Int { forever() } print(forever());");
    for (limits, expected) in [
        (
            Limits {
                fuel: 0,
                ..Limits::default()
            },
            DiagnosticCode::LimitFuel,
        ),
        (
            Limits {
                allocation_bytes: 0,
                ..Limits::default()
            },
            DiagnosticCode::LimitAllocation,
        ),
        (
            Limits {
                fuel: 1000,
                ..Limits::default()
            },
            DiagnosticCode::LimitFuel,
        ),
        (
            Limits {
                allocation_bytes: 1000,
                ..Limits::default()
            },
            DiagnosticCode::LimitAllocation,
        ),
        (
            Limits {
                call_depth: 0,
                ..Limits::default()
            },
            DiagnosticCode::LimitCallDepth,
        ),
        (
            Limits {
                evaluation_depth: 0,
                ..Limits::default()
            },
            DiagnosticCode::LimitEvaluationDepth,
        ),
        (
            Limits {
                evaluation_depth: 1,
                ..Limits::default()
            },
            DiagnosticCode::LimitEvaluationDepth,
        ),
    ] {
        let mut machine = Machine::new(&p, &limits);
        assert_eq!(
            run(&mut machine, &p, &mut Env::new()).unwrap_err().code,
            expected
        );
        assert_eq!((machine.depth, machine.evaluation_depth), (0, 0));
    }
}

#[test]
fn tail_arguments_execute_left_to_right_before_jump_and_preserve_error_output() {
    let p = program(
        "fn mark(n: Int) -> Int { print(n); n }
        fn target(a: Int, b: Int) -> Int { print(99); a + b }
        fn relay() -> Int { target(mark(1), mark(2)) }
        print(relay());",
    );
    let limits = Limits::default();
    let mut machine = Machine::new(&p, &limits);
    run(&mut machine, &p, &mut Env::new()).unwrap();
    assert_eq!(machine.output, "1\n2\n99\n3\n");

    let p = program(
        "fn mark(n: Int) -> Int { print(n); n }
        fn target(a: Int, b: Int) -> Int { print(99); a + b }
        fn relay() -> Int { target(mark(1), mark(2) / 0) }
        print(relay());",
    );
    let mut machine = Machine::new(&p, &limits);
    assert_eq!(
        run(&mut machine, &p, &mut Env::new()).unwrap_err().code,
        DiagnosticCode::DivZero
    );
    assert_eq!(machine.output, "1\n2\n");
    assert_eq!((machine.depth, machine.evaluation_depth), (0, 0));
}

#[test]
fn lexical_bindings_are_cleaned_on_branch_return_and_error_and_machine_is_reusable() {
    let p = program(
        "let inherited = 7;
        print(if true { let local = inherited + 1; local } else { 0 });
        let local = 9;
        { let doomed = 3; let crash = 1 / 0; doomed };
        let doomed = 10;
        print(inherited + local + doomed);",
    );
    let limits = Limits::default();
    let mut machine = Machine::new(&p, &limits);
    let mut env = Env::new();
    for s in &p.statements[..3] {
        machine.stmt(s, &mut env).unwrap();
    }
    assert_eq!(env.len(), 2);
    assert_eq!(
        machine.stmt(&p.statements[3], &mut env).unwrap_err().code,
        DiagnosticCode::DivZero
    );
    assert_eq!(env.len(), 2);
    assert!(!env.contains_key("doomed"));
    assert!(!env.contains_key("crash"));
    assert_eq!((machine.depth, machine.evaluation_depth), (0, 0));
    for s in &p.statements[4..] {
        machine.stmt(s, &mut env).unwrap();
    }
    assert_eq!(machine.output, "8\n26\n");
}

#[test]
fn borrowed_projection_and_scope_entry_do_not_copy_unselected_payloads() {
    let p = program(
        "record Inner { small: Int, large: String }
        record Outer { inner: Inner }
        let value = new Outer { inner: new Inner { small: 42, large: \"payload\" } };
        let result = { value.inner.small };
        let selected = value.inner.large;",
    );
    let limits = Limits {
        allocation_bytes: 1000,
        ..Limits::default()
    };
    let mut machine = Machine::new(&p, &limits);
    let mut env = Env::new();
    machine.stmt(&p.statements[0], &mut env).unwrap();
    // An internal large value isolates projection cost from construction cost.
    let Value::Record(_, outer) = env.get_mut("value").unwrap() else {
        panic!()
    };
    let Value::Record(_, inner) = &mut outer[0].1 else {
        panic!()
    };
    inner[1].1 = Value::String("x".repeat(2000));
    let before = machine.allocation;
    machine.stmt(&p.statements[1], &mut env).unwrap();
    assert!(matches!(env["result"], Value::Int(42)));
    // Block, two projections, root variable, and the result binding only.
    assert_eq!(machine.allocation - before, 4 * 16 + 32 + "result".len());
    assert_eq!(
        machine.stmt(&p.statements[2], &mut env).unwrap_err().code,
        DiagnosticCode::LimitAllocation
    );
    assert!(!env.contains_key("selected"));
    assert_eq!((machine.depth, machine.evaluation_depth), (0, 0));
}

#[test]
fn computed_projection_moves_its_selected_payload_once() {
    let p = program("record R { text: String } let selected = new R { text: \"abcd\" }.text;");
    // Three expression entries + record storage + literal + binding.
    let expected = 3 * 16 + 32 + 1 + 32 + 4 + 4 + 32 + "selected".len();
    let limits = Limits {
        allocation_bytes: expected,
        ..Limits::default()
    };
    let mut machine = Machine::new(&p, &limits);
    let mut env = Env::new();
    run(&mut machine, &p, &mut env).unwrap();
    assert!(matches!(&env["selected"], Value::String(s) if s == "abcd"));
    assert_eq!(machine.allocation, expected);
}

#[test]
fn borrowed_projection_retains_expression_depth_and_selected_value_preflight() {
    let p =
        program("record R { selected: Int } let value = new R { selected: 1 }; value.selected;");
    let limits = Limits {
        evaluation_depth: 1,
        ..Limits::default()
    };
    let mut machine = Machine::new(&p, &limits);
    let mut env = Env::new();
    env.insert(
        "value".into(),
        Value::Record("R".into(), vec![("selected".into(), Value::Int(1))]),
    );
    assert_eq!(
        machine.stmt(&p.statements[1], &mut env).unwrap_err().code,
        DiagnosticCode::LimitEvaluationDepth
    );
    assert_eq!((machine.depth, machine.evaluation_depth), (0, 0));

    let limits = Limits::default();
    let mut machine = Machine::new(&p, &limits);
    // Malformed internal data must fail before recursively duplicating payload.
    let mut selected = Value::Unit;
    for _ in 0..17 {
        selected = Value::Record("R".into(), vec![("selected".into(), selected)]);
    }
    env.insert(
        "value".into(),
        Value::Record("R".into(), vec![("selected".into(), selected)]),
    );
    assert_eq!(
        machine.stmt(&p.statements[1], &mut env).unwrap_err().code,
        DiagnosticCode::LimitValueDepth
    );
    assert_eq!(machine.allocation, 2 * 16);
    assert_eq!((machine.depth, machine.evaluation_depth), (0, 0));
}
