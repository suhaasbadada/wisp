use std::io::{self, Read};
fn main() {
    let result = match std::env::args().nth(1).as_deref() {
        Some("--json") => {
            let mut request = String::new();
            io::stdin()
                .read_to_string(&mut request)
                .map(|_| wisp::dispatch(&request))
        }
        Some(path) => std::fs::read_to_string(path).map(|source| {
            wisp::dispatch(&serde_json::json!({"op":"run","source":source}).to_string())
        }),
        None => {
            eprintln!("usage: wisp FILE.wisp | wisp --json < request.json");
            std::process::exit(2);
        }
    };
    match result {
        Ok(report) => println!("{report}"),
        Err(e) => {
            eprintln!("{e}");
            std::process::exit(2);
        }
    }
}
