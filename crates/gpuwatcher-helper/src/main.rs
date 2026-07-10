use std::io::{self, Read, Write};

fn main() {
    let exit_code = match run() {
        Ok(()) => 0,
        Err(err) => {
            let _ = writeln!(io::stderr(), "helper I/O error: {err}");
            1
        }
    };

    std::process::exit(exit_code);
}

fn run() -> io::Result<()> {
    let mut input = String::new();
    io::stdin().read_to_string(&mut input)?;

    let response = gpuwatcher_helper::handle_request_to_string(&input);
    let mut stdout = io::stdout().lock();
    stdout.write_all(response.as_bytes())?;
    stdout.write_all(b"\n")?;
    stdout.flush()
}
