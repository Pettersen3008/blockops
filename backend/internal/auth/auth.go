package auth

import (
	"context"
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"fmt"
	"regexp"
	"strings"
	"time"
	"unicode"

	"github.com/blockops-dashboard/blockops/backend/internal/store"
	"golang.org/x/crypto/argon2"
)

type Role string

const (
	Administrator Role = "administrator"
	Operator      Role = "operator"
	Viewer        Role = "viewer"
)

var usernamePattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9_.-]{2,31}$`)

type PasswordParams struct {
	Memory      uint32
	Iterations  uint32
	Parallelism uint8
	SaltLength  uint32
	KeyLength   uint32
}

var DefaultPasswordParams = PasswordParams{Memory: 64 * 1024, Iterations: 3, Parallelism: 2, SaltLength: 16, KeyLength: 32}

func ValidateUsername(username string) error {
	if !usernamePattern.MatchString(username) {
		return errors.New("username must be 3–32 characters and contain only letters, numbers, dot, underscore, or hyphen")
	}
	return nil
}

func ValidatePassword(password string) error {
	if len(password) < 12 {
		return errors.New("password must contain at least 12 characters")
	}
	if len(password) > 256 {
		return errors.New("password must contain at most 256 characters")
	}
	var lower, upper, digit, symbol bool
	for _, character := range password {
		switch {
		case unicode.IsLower(character):
			lower = true
		case unicode.IsUpper(character):
			upper = true
		case unicode.IsDigit(character):
			digit = true
		default:
			symbol = true
		}
	}
	categories := 0
	for _, present := range []bool{lower, upper, digit, symbol} {
		if present {
			categories++
		}
	}
	if categories < 3 {
		return errors.New("password must use at least three of lowercase, uppercase, numbers, and symbols")
	}
	return nil
}

func ParseRole(value string) (Role, error) {
	switch Role(value) {
	case Administrator, Operator, Viewer:
		return Role(value), nil
	default:
		return "", errors.New("role must be administrator, operator, or viewer")
	}
}

func HashPassword(password string) (string, error) {
	return hashPassword(password, DefaultPasswordParams)
}

func hashPassword(password string, params PasswordParams) (string, error) {
	salt := make([]byte, params.SaltLength)
	if _, err := rand.Read(salt); err != nil {
		return "", fmt.Errorf("generate password salt: %w", err)
	}
	hash := argon2.IDKey([]byte(password), salt, params.Iterations, params.Memory, params.Parallelism, params.KeyLength)
	return fmt.Sprintf("$argon2id$v=19$m=%d,t=%d,p=%d$%s$%s", params.Memory, params.Iterations, params.Parallelism, base64.RawStdEncoding.EncodeToString(salt), base64.RawStdEncoding.EncodeToString(hash)), nil
}

func VerifyPassword(password, encoded string) bool {
	var memory, iterations uint32
	var parallelism uint8
	parts := strings.Split(encoded, "$")
	if len(parts) != 6 || parts[1] != "argon2id" || parts[2] != "v=19" {
		return false
	}
	if _, err := fmt.Sscanf(parts[3], "m=%d,t=%d,p=%d", &memory, &iterations, &parallelism); err != nil {
		return false
	}
	if memory < 8*1024 || memory > 1024*1024 || iterations < 1 || iterations > 10 || parallelism < 1 || parallelism > 16 {
		return false
	}
	salt, err := base64.RawStdEncoding.DecodeString(parts[4])
	if err != nil || len(salt) < 8 || len(salt) > 64 {
		return false
	}
	expected, err := base64.RawStdEncoding.DecodeString(parts[5])
	if err != nil || len(expected) < 16 || len(expected) > 64 {
		return false
	}
	actual := argon2.IDKey([]byte(password), salt, iterations, memory, parallelism, uint32(len(expected)))
	return subtle.ConstantTimeCompare(actual, expected) == 1
}

type SessionManager struct {
	Store *store.Store
	TTL   time.Duration
}

type IssuedSession struct {
	Token     string
	CSRFToken string
	ExpiresAt time.Time
}

func (m SessionManager) Issue(ctx context.Context, userID string, now time.Time) (IssuedSession, error) {
	token, err := randomToken(32)
	if err != nil {
		return IssuedSession{}, err
	}
	csrf, err := randomToken(32)
	if err != nil {
		return IssuedSession{}, err
	}
	expires := now.Add(m.TTL)
	if err := m.Store.CreateSession(ctx, store.Session{IDHash: store.TokenHash(token), CSRFToken: csrf, CreatedAt: now, ExpiresAt: expires}, userID); err != nil {
		return IssuedSession{}, err
	}
	return IssuedSession{Token: token, CSRFToken: csrf, ExpiresAt: expires}, nil
}

func CSRFMatches(expected, provided string) bool {
	if expected == "" || provided == "" {
		return false
	}
	return subtle.ConstantTimeCompare(store.TokenHash(expected), store.TokenHash(provided)) == 1
}

func randomToken(length int) (string, error) {
	buffer := make([]byte, length)
	if _, err := rand.Read(buffer); err != nil {
		return "", fmt.Errorf("generate secure token: %w", err)
	}
	return base64.RawURLEncoding.EncodeToString(buffer), nil
}
