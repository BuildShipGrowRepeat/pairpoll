DROP TABLE app_meta;

CREATE TABLE accounts (
  id TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  blocked_at INTEGER,
  deleting_at INTEGER
);
CREATE INDEX accounts_deleting ON accounts(deleting_at) WHERE deleting_at IS NOT NULL;

CREATE TABLE credentials (
  id TEXT PRIMARY KEY NOT NULL,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('link', 'session', 'api_key')),
  hash TEXT NOT NULL UNIQUE,
  name TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER,
  revoked_at INTEGER
);
CREATE INDEX credentials_account_kind ON credentials(account_id, kind);
CREATE INDEX credentials_expiry ON credentials(expires_at);
CREATE INDEX credentials_revoked ON credentials(revoked_at) WHERE revoked_at IS NOT NULL;

CREATE TABLE device_requests (
  id TEXT PRIMARY KEY NOT NULL,
  secret_hash TEXT NOT NULL UNIQUE,
  code TEXT NOT NULL UNIQUE,
  account_id TEXT REFERENCES accounts(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE INDEX device_requests_account ON device_requests(account_id);
CREATE INDEX device_requests_expiry ON device_requests(expires_at);

CREATE TABLE rate_limits (
  scope TEXT NOT NULL,
  identifier_hash TEXT NOT NULL,
  hits INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  PRIMARY KEY (scope, identifier_hash)
);
CREATE INDEX rate_limits_expiry ON rate_limits(expires_at);

CREATE TABLE dev_mail (
  credential_id TEXT PRIMARY KEY NOT NULL REFERENCES credentials(id) ON DELETE CASCADE,
  link TEXT NOT NULL
);

CREATE TABLE polls (
  id TEXT PRIMARY KEY NOT NULL,
  owner_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  code TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL CHECK (kind IN ('image', 'video')),
  question TEXT NOT NULL,
  top_size INTEGER NOT NULL CHECK (top_size IN (1, 3, 5)),
  plays_once INTEGER NOT NULL CHECK (plays_once IN (0, 1)),
  voter_cap INTEGER NOT NULL CHECK (voter_cap BETWEEN 1 AND 200),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'open', 'closed')),
  admitted_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  deleting_at INTEGER,
  share_code TEXT UNIQUE,
  share_names INTEGER NOT NULL DEFAULT 0 CHECK (share_names IN (0, 1))
);
CREATE INDEX polls_owner_created ON polls(owner_id, created_at);
CREATE INDEX polls_expiry ON polls(expires_at);
CREATE INDEX polls_deleting ON polls(deleting_at) WHERE deleting_at IS NOT NULL;

CREATE TABLE items (
  id TEXT PRIMARY KEY NOT NULL,
  poll_id TEXT NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  object_key TEXT NOT NULL UNIQUE,
  poster_key TEXT UNIQUE,
  bytes INTEGER NOT NULL DEFAULT 0,
  mime TEXT NOT NULL DEFAULT '',
  poster_bytes INTEGER NOT NULL DEFAULT 0,
  poster_mime TEXT,
  status TEXT NOT NULL CHECK (status IN ('uploading', 'ready', 'deleting')),
  created_at INTEGER NOT NULL
);
CREATE INDEX items_poll_position ON items(poll_id, position);

CREATE TABLE uploads (
  object_key TEXT PRIMARY KEY NOT NULL,
  poll_id TEXT NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  deleting_at INTEGER
);
CREATE INDEX uploads_poll ON uploads(poll_id);
CREATE INDEX uploads_expiry ON uploads(created_at);

CREATE TABLE runs (
  id TEXT PRIMARY KEY NOT NULL,
  poll_id TEXT NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  browser_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  seed INTEGER NOT NULL,
  votes TEXT NOT NULL DEFAULT '[]',
  playback TEXT NOT NULL DEFAULT '[]',
  revision INTEGER NOT NULL DEFAULT 0,
  completed_at INTEGER,
  deleted_at INTEGER,
  created_at INTEGER NOT NULL,
  UNIQUE (poll_id, browser_hash)
);

CREATE TABLE reports (
  id TEXT PRIMARY KEY NOT NULL,
  poll_id TEXT NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX reports_poll ON reports(poll_id);
CREATE INDEX reports_created ON reports(created_at);

CREATE TABLE usage (
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  poll_count INTEGER NOT NULL DEFAULT 0,
  uploaded_bytes INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (account_id, day)
);
CREATE INDEX usage_day ON usage(day);
