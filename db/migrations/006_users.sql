-- Named-account auth (audit Phase 0): replaces the single shared ADMIN_PASSWORD
-- as the actual login credential, so every dashboard action can be attributed
-- to a real person instead of the literal string "dashboard".
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  active        BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT now()
);
