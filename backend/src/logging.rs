use std::{
    fs::{File, OpenOptions},
    io::{self, Write},
    path::PathBuf,
    sync::{Arc, Mutex},
};
const LIMIT: u64 = 5 * 1024 * 1024;
struct Rolling {
    path: PathBuf,
    file: File,
    size: u64,
}
#[derive(Clone)]
pub struct LogWriter(Arc<Mutex<Rolling>>);
impl LogWriter {
    pub fn new(directory: PathBuf) -> io::Result<Self> {
        std::fs::create_dir_all(&directory)?;
        let path = directory.join("app.log");
        let file = OpenOptions::new().create(true).append(true).open(&path)?;
        let size = file.metadata()?.len();
        Ok(Self(Arc::new(Mutex::new(Rolling { path, file, size }))))
    }
}
impl Write for LogWriter {
    fn write(&mut self, buffer: &[u8]) -> io::Result<usize> {
        let mut state = self
            .0
            .lock()
            .map_err(|_| io::Error::other("log writer poisoned"))?;
        if state.size + buffer.len() as u64 > LIMIT {
            for i in (1..4).rev() {
                let from = state.path.with_extension(format!("log.{i}"));
                if from.exists() {
                    std::fs::rename(from, state.path.with_extension(format!("log.{}", i + 1)))?;
                }
            }
            std::fs::rename(&state.path, state.path.with_extension("log.1"))?;
            state.file = OpenOptions::new()
                .create(true)
                .append(true)
                .open(&state.path)?;
            state.size = 0;
        }
        let written = state
            .file
            .write(&buffer[..buffer.len().min(LIMIT as usize)])?;
        state.size += written as u64;
        Ok(written)
    }
    fn flush(&mut self) -> io::Result<()> {
        self.0
            .lock()
            .map_err(|_| io::Error::other("log writer poisoned"))?
            .file
            .flush()
    }
}
