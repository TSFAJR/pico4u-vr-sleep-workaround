#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]
mod engine;
mod openvr;
mod protocol;

use engine::{Backend, Engine};
use openvr::Session;
use protocol::{Desired, Failure};
use std::{
    io::{self, BufRead, Read, Write},
    sync::{Arc, Mutex},
    thread,
    time::{Duration, Instant},
};

impl Backend for Session {
    fn quit_requested(&self) -> Result<bool, Failure> {
        Session::quit_requested(self)
    }
    fn prepare(&mut self) -> Result<(), Failure> {
        Session::prepare(self)
    }
    fn resize(&self) -> Result<(), Failure> {
        Session::resize(self)
    }
    fn apply(&self, p: u8) -> Result<(), Failure> {
        Session::apply(self, p)
    }
    fn clear_overlay(&mut self) {
        Session::clear_overlay(self)
    }
}

fn main() {
    let desired = Arc::new(Mutex::new(Desired::default()));
    let input = desired.clone();
    thread::spawn(move || {
        let mut reader = io::stdin().lock();
        loop {
            // Bound each protocol frame even if the parent is misbehaving.
            let mut line = Vec::new();
            match (&mut reader).take(4097).read_until(b'\n', &mut line) {
                Ok(n) if n > 0 && n <= 4096 => {
                    let Ok(next) = serde_json::from_slice::<Desired>(&line) else {
                        break;
                    };
                    if next.percent > 100 {
                        break;
                    }
                    let mut current = input.lock().unwrap();
                    if next.revision >= current.revision {
                        *current = next;
                    }
                }
                _ => break,
            }
        }
        input.lock().unwrap().quit = true; // EOF on parent exit releases overlay.
    });
    let start = Instant::now();
    let mut engine = Engine::<Session>::default();
    let mut output = io::stdout().lock();
    loop {
        let snapshot = desired.lock().unwrap().clone();
        let report = engine.step(&snapshot, start.elapsed(), Session::connect, || {
            let current = desired.lock().unwrap();
            current.revision == snapshot.revision && !current.quit
        });
        // Heartbeats allow the parent to detect a blocked native call.
        if serde_json::to_writer(&mut output, &report).is_err()
            || writeln!(output).is_err()
            || output.flush().is_err()
        {
            break;
        }
        if snapshot.quit {
            break;
        }
        thread::sleep(Duration::from_millis(50));
    }
}
