package auth

import "testing"

func TestPasswordHashRoundTrip(t *testing.T) {
	t.Parallel()
	params := PasswordParams{Memory: 8 * 1024, Iterations: 1, Parallelism: 1, SaltLength: 16, KeyLength: 32}
	hash, err := hashPassword("Correct horse Battery 42!", params)
	if err != nil {
		t.Fatal(err)
	}
	if !VerifyPassword("Correct horse Battery 42!", hash) {
		t.Fatal("expected password to verify")
	}
	if VerifyPassword("incorrect", hash) {
		t.Fatal("incorrect password verified")
	}
}

func TestPasswordPolicy(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name       string
		password   string
		shouldPass bool
	}{
		{"strong", "Long passphrase 42!", true},
		{"too short", "Short1!", false},
		{"too few categories", "onlylowercaseletters", false},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			err := ValidatePassword(test.password)
			if (err == nil) != test.shouldPass {
				t.Fatalf("ValidatePassword() error = %v", err)
			}
		})
	}
}
