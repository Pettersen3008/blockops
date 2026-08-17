package secrets

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
)

type Cipher struct {
	aead cipher.AEAD
}

func New(key []byte) (*Cipher, error) {
	if len(key) != 32 {
		return nil, errors.New("encryption key must contain 32 bytes")
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, fmt.Errorf("create secret cipher: %w", err)
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("create secret GCM: %w", err)
	}
	return &Cipher{aead: aead}, nil
}

func (c *Cipher) Encrypt(plaintext []byte, purpose string) (string, error) {
	nonce := make([]byte, c.aead.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", fmt.Errorf("generate secret nonce: %w", err)
	}
	sealed := c.aead.Seal(nonce, nonce, plaintext, []byte(purpose))
	return base64.RawStdEncoding.EncodeToString(sealed), nil
}

func (c *Cipher) Decrypt(encoded, purpose string) ([]byte, error) {
	sealed, err := base64.RawStdEncoding.DecodeString(encoded)
	if err != nil {
		return nil, errors.New("decode encrypted secret")
	}
	if len(sealed) < c.aead.NonceSize()+c.aead.Overhead() {
		return nil, errors.New("encrypted secret is too short")
	}
	nonce, ciphertext := sealed[:c.aead.NonceSize()], sealed[c.aead.NonceSize():]
	plaintext, err := c.aead.Open(nil, nonce, ciphertext, []byte(purpose))
	if err != nil {
		return nil, errors.New("decrypt secret")
	}
	return plaintext, nil
}
