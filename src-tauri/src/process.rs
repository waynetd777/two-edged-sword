// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

//! Running a short-lived command with a time limit: a hung one (Music beachballing, a login shell
//! stuck in the user's profile) is killed rather than holding a thread for ever.

use std::io::Read;
use std::process::{Command, Output, Stdio};
use std::time::{Duration, Instant};

/// Like `Command::output`, but kills the command if it hasn't finished within `limit`.
pub fn output_within(cmd: &mut Command, limit: Duration) -> Result<Output, String> {
    let mut child = cmd.stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped()).spawn().map_err(|e| e.to_string())?;
    // Read as it runs, so a full pipe never stalls it.
    let drain = |p: Option<Box<dyn Read + Send>>| {
        std::thread::spawn(move || {
            let mut v = Vec::new();
            if let Some(mut p) = p {
                let _ = p.read_to_end(&mut v);
            }
            v
        })
    };
    let out = drain(child.stdout.take().map(|p| Box::new(p) as Box<dyn Read + Send>));
    let err = drain(child.stderr.take().map(|p| Box::new(p) as Box<dyn Read + Send>));
    let until = Instant::now() + limit;
    let status = loop {
        match child.try_wait().map_err(|e| e.to_string())? {
            Some(s) => break s,
            None if Instant::now() >= until => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(format!("gave up after {} seconds", limit.as_secs()));
            }
            None => std::thread::sleep(Duration::from_millis(20)),
        }
    };
    Ok(Output { status, stdout: out.join().unwrap_or_default(), stderr: err.join().unwrap_or_default() })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn returns_output_or_kills_when_too_slow() {
        let out = output_within(Command::new("/bin/echo").arg("hi"), Duration::from_secs(5)).unwrap();
        assert_eq!(String::from_utf8_lossy(&out.stdout).trim(), "hi");
        let t = Instant::now();
        assert!(output_within(Command::new("/bin/sleep").arg("10"), Duration::from_millis(200)).is_err());
        assert!(t.elapsed() < Duration::from_secs(5));
    }
}
