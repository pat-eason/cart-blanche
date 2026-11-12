package main

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"net/http"
	"net/mail"
	"strconv"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"
)

const (
	cookieName = "cb_session"
	sessionTTL = 30 * 24 * time.Hour
)

func randToken(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return base64.RawURLEncoding.EncodeToString(b)
}

func hashToken(t string) string {
	sum := sha256.Sum256([]byte(t))
	return hex.EncodeToString(sum[:])
}

func newInviteCode() string {
	const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
	b := make([]byte, 8)
	_, _ = rand.Read(b)
	out := make([]byte, 8)
	for i := range b {
		out[i] = alphabet[int(b[i])%len(alphabet)]
	}
	return string(out[:4]) + "-" + string(out[4:])
}

func (s *server) startSession(w http.ResponseWriter, userID string) error {
	tok := randToken(32)
	exp := time.Now().Add(sessionTTL)
	if _, err := s.db.Exec(`INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)`,
		hashToken(tok), userID, exp.UTC()); err != nil {
		return err
	}
	http.SetCookie(w, &http.Cookie{
		Name: cookieName, Value: tok, Path: s.cookiePath, Expires: exp,
		HttpOnly: true, Secure: s.secureCookie, SameSite: http.SameSiteLaxMode,
	})
	return nil
}

func (s *server) userFromRequest(r *http.Request) (*User, error) {
	c, err := r.Cookie(cookieName)
	if err != nil {
		return nil, err
	}
	u := &User{}
	var exp time.Time
	err = s.db.QueryRow(`SELECT u.id,u.email,u.name,u.household_id,s.expires_at
		FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=?`, hashToken(c.Value)).
		Scan(&u.ID, &u.Email, &u.Name, &u.HouseholdID, &exp)
	if err != nil {
		return nil, err
	}
	if time.Now().After(exp) {
		return nil, sql.ErrNoRows
	}
	return u, nil
}

type credentials struct {
	Email      string `json:"email"`
	Password   string `json:"password"`
	Name       string `json:"name"`
	InviteCode string `json:"inviteCode"` // household invite code
	// RegistrationCode is the site-wide code required when REGISTRATION_MODE=invite.
	RegistrationCode string `json:"registrationCode"`
}

// checkRegistrationCode enforces invite-only mode with per-IP lockout and a global failure ceiling.
func (s *server) checkRegistrationCode(w http.ResponseWriter, r *http.Request, given string) bool {
	ip := clientIP(r, s.proxyHops)
	if ok, wait := s.codeGuard.allowed(ip); !ok {
		w.Header().Set("Retry-After", strconv.Itoa(int(wait.Seconds())+1))
		writeErr(w, apiErr{http.StatusTooManyRequests, "too many attempts, try again later"})
		return false
	}
	if subtle.ConstantTimeCompare([]byte(strings.TrimSpace(given)), []byte(s.regCode)) != 1 {
		s.codeGuard.fail(ip)
		writeErr(w, apiErr{http.StatusForbidden, "that registration code isn't valid"})
		return false
	}
	return true
}

func (s *server) register(w http.ResponseWriter, r *http.Request) {
	if s.regMode == "closed" {
		writeErr(w, apiErr{http.StatusForbidden, "registration is closed"})
		return
	}
	var in credentials
	if err := decode(r, &in); err != nil {
		writeErr(w, err)
		return
	}
	if s.regMode == "invite" && !s.checkRegistrationCode(w, r, in.RegistrationCode) {
		return
	}
	in.Email = strings.TrimSpace(in.Email)
	in.Name = strings.TrimSpace(in.Name)
	if _, err := mail.ParseAddress(in.Email); err != nil {
		writeErr(w, errBad("enter a valid email address"))
		return
	}
	if len(in.Password) < 8 {
		writeErr(w, errBad("password must be at least 8 characters"))
		return
	}
	if in.Name == "" {
		in.Name = strings.Split(in.Email, "@")[0]
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(in.Password), bcrypt.DefaultCost)
	if err != nil {
		writeErr(w, err)
		return
	}
	tx, err := s.db.Begin()
	if err != nil {
		writeErr(w, err)
		return
	}
	defer tx.Rollback()

	var exists int
	_ = tx.QueryRow(`SELECT COUNT(*) FROM users WHERE lower(email)=lower(?)`, in.Email).Scan(&exists)
	if exists > 0 {
		writeErr(w, apiErr{http.StatusConflict, "that email is already registered"})
		return
	}

	var hid string
	if code := strings.ToUpper(strings.TrimSpace(in.InviteCode)); code != "" {
		if err := tx.QueryRow(`SELECT id FROM households WHERE invite_code=?`, code).Scan(&hid); err != nil {
			writeErr(w, errBad("that invite code wasn't found"))
			return
		}
	} else {
		hid, err = tx.InsertID(`INSERT INTO households(name,invite_code) VALUES(?,?)`, in.Name+"'s Kitchen", newInviteCode())
		if err != nil {
			writeErr(w, err)
			return
		}
	}
	uid, err := tx.InsertID(`INSERT INTO users(email,name,password_hash,household_id) VALUES(?,?,?,?)`, in.Email, in.Name, string(hash), hid)
	if err != nil {
		if isUnique(err) {
			writeErr(w, apiErr{http.StatusConflict, "that email is already registered"})
			return
		}
		writeErr(w, err)
		return
	}
	if err := tx.Commit(); err != nil {
		writeErr(w, err)
		return
	}
	if err := s.startSession(w, uid); err != nil {
		writeErr(w, err)
		return
	}
	writeJSON(w, 201, User{ID: uid, Email: in.Email, Name: in.Name, HouseholdID: hid})
}

func (s *server) login(w http.ResponseWriter, r *http.Request) {
	var in credentials
	if err := decode(r, &in); err != nil {
		writeErr(w, err)
		return
	}
	u := User{}
	var hash string
	err := s.db.QueryRow(`SELECT id,email,name,household_id,password_hash FROM users WHERE lower(email)=lower(?)`,
		strings.TrimSpace(in.Email)).Scan(&u.ID, &u.Email, &u.Name, &u.HouseholdID, &hash)
	if err != nil || bcrypt.CompareHashAndPassword([]byte(hash), []byte(in.Password)) != nil {
		writeErr(w, apiErr{http.StatusUnauthorized, "email or password is incorrect"})
		return
	}
	if err := s.startSession(w, u.ID); err != nil {
		writeErr(w, err)
		return
	}
	writeJSON(w, 200, u)
}

func (s *server) logout(w http.ResponseWriter, r *http.Request) {
	if c, err := r.Cookie(cookieName); err == nil {
		_, _ = s.db.Exec(`DELETE FROM sessions WHERE token_hash=?`, hashToken(c.Value))
	}
	http.SetCookie(w, &http.Cookie{Name: cookieName, Value: "", Path: s.cookiePath, MaxAge: -1, HttpOnly: true, Secure: s.secureCookie, SameSite: http.SameSiteLaxMode})
	w.WriteHeader(http.StatusNoContent)
}

func (s *server) me(w http.ResponseWriter, r *http.Request, u *User) (any, error) { return u, nil }

// ---------- household ----------

type Member struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Email string `json:"email"`
}

type Household struct {
	ID         string   `json:"id"`
	Name       string   `json:"name"`
	InviteCode string   `json:"inviteCode"`
	Members    []Member `json:"members"`
}

func (s *server) loadHousehold(id string) (*Household, error) {
	h := &Household{ID: id, Members: []Member{}}
	if err := s.db.QueryRow(`SELECT name,invite_code FROM households WHERE id=?`, id).Scan(&h.Name, &h.InviteCode); err != nil {
		return nil, err
	}
	rows, err := s.db.Query(`SELECT id,name,email FROM users WHERE household_id=? ORDER BY id`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var m Member
		if err := rows.Scan(&m.ID, &m.Name, &m.Email); err != nil {
			return nil, err
		}
		h.Members = append(h.Members, m)
	}
	return h, rows.Err()
}

func (s *server) getHousehold(w http.ResponseWriter, r *http.Request, u *User) (any, error) {
	return s.loadHousehold(u.HouseholdID)
}

func (s *server) updateHousehold(w http.ResponseWriter, r *http.Request, u *User) (any, error) {
	var in struct {
		Name string `json:"name"`
	}
	if err := decode(r, &in); err != nil {
		return nil, err
	}
	in.Name = strings.TrimSpace(in.Name)
	if in.Name == "" {
		return nil, errBad("name is required")
	}
	if _, err := s.db.Exec(`UPDATE households SET name=? WHERE id=?`, in.Name, u.HouseholdID); err != nil {
		return nil, err
	}
	return s.loadHousehold(u.HouseholdID)
}

func (s *server) joinHousehold(w http.ResponseWriter, r *http.Request, u *User) (any, error) {
	var in struct {
		Code string `json:"code"`
	}
	if err := decode(r, &in); err != nil {
		return nil, err
	}
	var hid string
	if err := s.db.QueryRow(`SELECT id FROM households WHERE invite_code=?`, strings.ToUpper(strings.TrimSpace(in.Code))).Scan(&hid); err != nil {
		return nil, errBad("that invite code wasn't found")
	}
	if hid == u.HouseholdID {
		return s.loadHousehold(hid)
	}
	if _, err := s.db.Exec(`UPDATE users SET household_id=? WHERE id=?`, hid, u.ID); err != nil {
		return nil, err
	}
	return s.loadHousehold(hid)
}

func (s *server) resetInvite(w http.ResponseWriter, r *http.Request, u *User) (any, error) {
	if _, err := s.db.Exec(`UPDATE households SET invite_code=? WHERE id=?`, newInviteCode(), u.HouseholdID); err != nil {
		return nil, err
	}
	return s.loadHousehold(u.HouseholdID)
}
