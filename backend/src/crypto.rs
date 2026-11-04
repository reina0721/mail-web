use aes_gcm::{Aes256Gcm, KeyInit, Nonce, aead::Aead};
use rand::RngCore;
use sha2::{Digest, Sha256};

#[derive(Clone)]
pub struct Vault(Aes256Gcm);

impl Vault {
    pub fn new(key: &[u8]) -> Result<Self, &'static str> {
        Aes256Gcm::new_from_slice(key)
            .map(Self)
            .map_err(|_| "key must be 32 bytes")
    }
    pub fn seal(&self, value: &[u8]) -> Result<Vec<u8>, &'static str> {
        let mut nonce = [0u8; 12];
        rand::thread_rng().fill_bytes(&mut nonce);
        let encrypted = self
            .0
            .encrypt(Nonce::from_slice(&nonce), value)
            .map_err(|_| "encryption failed")?;
        let mut result = nonce.to_vec();
        result.extend(encrypted);
        Ok(result)
    }
    pub fn open(&self, value: &[u8]) -> Result<Vec<u8>, &'static str> {
        if value.len() < 28 {
            return Err("invalid ciphertext");
        }
        self.0
            .decrypt(Nonce::from_slice(&value[..12]), &value[12..])
            .map_err(|_| "decryption failed")
    }
}
pub fn hash(value: &str) -> String {
    hex::encode(Sha256::digest(value.as_bytes()))
}
pub fn token() -> String {
    let mut bytes = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut bytes);
    hex::encode(bytes)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn authenticated_ciphertext() {
        let v = Vault::new(&[9; 32]).unwrap();
        let mut sealed = v.seal(b"credential").unwrap();
        assert_eq!(v.open(&sealed).unwrap(), b"credential");
        sealed[15] ^= 1;
        assert!(v.open(&sealed).is_err());
        assert!(v.open(&[]).is_err());
        assert!(Vault::new(&[8; 32]).unwrap().open(&sealed).is_err());
    }
    #[test]
    fn independent_tokens() {
        assert_ne!(token(), token());
        assert_eq!(token().len(), 64);
    }
}
