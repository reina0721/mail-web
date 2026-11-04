//! Persistence boundary. SQLite is the only implemented and tested engine.
//! A future engine needs its own statements, migrations and conversion tests.
mod sqlite;
pub use sqlite::{Pool, Statement, begin, connect, now, query, scalar, snapshot, version};
