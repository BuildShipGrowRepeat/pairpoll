CREATE TABLE oauth_grant_states (
  account_id TEXT NOT NULL,
  grant_id TEXT NOT NULL,
  code_exchanged_at INTEGER,
  revoked_at INTEGER,
  cleanup_pending INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (account_id, grant_id)
);
CREATE INDEX oauth_grant_states_revoked ON oauth_grant_states(revoked_at) WHERE revoked_at IS NOT NULL;
CREATE INDEX oauth_grant_states_cleanup ON oauth_grant_states(cleanup_pending) WHERE cleanup_pending = 1;

CREATE TABLE oauth_account_cleanup (
  account_id TEXT PRIMARY KEY NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE oauth_consent_states (
  handle_hash TEXT PRIMARY KEY NOT NULL,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE INDEX oauth_consent_states_expiry ON oauth_consent_states(expires_at);
