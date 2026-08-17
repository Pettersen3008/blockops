package secrets

import (
	"bytes"
	"testing"
)

func TestCipherRoundTripAndPurposeBinding(t *testing.T) {
	t.Parallel()
	cipher, err := New(bytes.Repeat([]byte{7}, 32))
	if err != nil {
		t.Fatal(err)
	}
	encoded, err := cipher.Encrypt([]byte("not-logged"), "rcon")
	if err != nil {
		t.Fatal(err)
	}
	plaintext, err := cipher.Decrypt(encoded, "rcon")
	if err != nil {
		t.Fatal(err)
	}
	if string(plaintext) != "not-logged" {
		t.Fatalf("unexpected plaintext %q", plaintext)
	}
	if _, err := cipher.Decrypt(encoded, "another-purpose"); err == nil {
		t.Fatal("expected associated-data mismatch to fail")
	}
}
