CREATE TABLE IF NOT EXISTS items (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK(type IN ('program','hotspot','video')),
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  cover TEXT NOT NULL DEFAULT '',
  payload TEXT NOT NULL DEFAULT '{}',
  published INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(type,slug)
);
CREATE INDEX IF NOT EXISTS idx_items_type_published ON items(type,published,updated_at DESC);
CREATE TABLE IF NOT EXISTS site_settings (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL DEFAULT '{}',updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
INSERT OR IGNORE INTO site_settings (id,data) VALUES (1,'{}');
CREATE TABLE IF NOT EXISTS login_attempts (ip TEXT PRIMARY KEY, failures INTEGER NOT NULL DEFAULT 0, window_start INTEGER NOT NULL DEFAULT 0);
