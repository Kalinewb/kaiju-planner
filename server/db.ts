import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export function openDb(path: string): DatabaseSync {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = DELETE;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS entities (
      id TEXT PRIMARY KEY,
      project_id TEXT,
      kind TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL DEFAULT '',
      data TEXT NOT NULL DEFAULT '{}',
      prov TEXT NOT NULL DEFAULT '{}',
      flags TEXT NOT NULL DEFAULT '{}',
      approved TEXT,
      approved_at TEXT,
      sort INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_entities_project ON entities(project_id, kind);
    CREATE TABLE IF NOT EXISTS revisions (
      id TEXT PRIMARY KEY,
      entity_id TEXT NOT NULL,
      approved_at TEXT NOT NULL,
      data TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_revisions_entity ON revisions(entity_id);
    CREATE TABLE IF NOT EXISTS links (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      from_id TEXT NOT NULL,
      to_id TEXT NOT NULL,
      type TEXT NOT NULL,
      confirmed INTEGER NOT NULL DEFAULT 0,
      source TEXT NOT NULL DEFAULT 'user',
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_links_project ON links(project_id);
    CREATE TABLE IF NOT EXISTS history (
      id TEXT PRIMARY KEY,
      project_id TEXT,
      entity_id TEXT,
      kind TEXT,
      action TEXT NOT NULL,
      summary TEXT NOT NULL,
      actor TEXT NOT NULL,
      at TEXT NOT NULL,
      before TEXT,
      after TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_history_project ON history(project_id, at);
    CREATE TABLE IF NOT EXISTS ai_messages (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_ai_messages_project ON ai_messages(project_id, at);
    CREATE TABLE IF NOT EXISTS api_tokens (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      last_used TEXT
    );
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, expires_at INTEGER NOT NULL);
  `);
  return db;
}
