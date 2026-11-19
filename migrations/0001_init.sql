-- Initial migration. The backend builder replaces this placeholder with the real schema.
CREATE TABLE IF NOT EXISTS app_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
INSERT INTO app_meta (key, value) VALUES ('schema', 'scaffold');
