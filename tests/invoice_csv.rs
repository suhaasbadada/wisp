use std::process::Command;

#[test]
fn csv_transport_and_native_contract() {
    let output = Command::new("python3")
        .args(["-B", "scripts/invoice_csv_test.py"])
        .env("WISP_TEST_BINARY", env!("CARGO_BIN_EXE_wisp"))
        .current_dir(env!("CARGO_MANIFEST_DIR"))
        .output()
        .expect("python3 must be available for the CSV adapter tests");
    assert!(
        output.status.success(),
        "stdout: {}\nstderr: {}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
}
