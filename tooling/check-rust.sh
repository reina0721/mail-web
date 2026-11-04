#!/bin/sh
set -eu
rustup component add clippy rustfmt
cargo fmt
cargo test
cargo clippy -- -D warnings
