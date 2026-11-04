#!/bin/sh
set -eu
mkdir -p backend/contract build
cargo run --locked -p mail-web -- --openapi > backend/contract/openapi.json
cargo run --locked -p mail-web -- --runtime-info > build/runtime-info.json
