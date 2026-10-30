const path = require('path');
const fs = require('fs');

// Zwei Betriebsarten mit derselben SQL (bewusst nur Befehle, die Postgres und SQLite beide verstehen):
// - DATABASE_URL gesetzt (z. B. Neon in der Cloud) → Postgres über "pg"
// - sonst (lokal auf dem PC) → SQLite-Datei server/data/lodge.db
const dataDir = process.env.LODGE_DATA_DIR || path.join(__dirname, '..', 'data');
const INT8 = 20;

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    display_name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    avatar_color TEXT NOT NULL,
    avatar_icon TEXT,
    status TEXT NOT NULL DEFAULT 'online',
    custom_status TEXT NOT NULL DEFAULT '',
    about TEXT NOT NULL DEFAULT '',
    created_at BIGINT NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower ON users (lower(username));

  CREATE TABLE IF NOT EXISTS servers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    icon TEXT NOT NULL DEFAULT 'planet',
    color TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at BIGINT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS members (
    server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'member',
    nickname TEXT,
    joined_at BIGINT NOT NULL,
    PRIMARY KEY (server_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS bans (
    server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (server_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS channels (
    id TEXT PRIMARY KEY,
    server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('text', 'voice')),
    topic TEXT NOT NULL DEFAULT '',
    position INTEGER NOT NULL DEFAULT 0,
    created_at BIGINT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS invites (
    code TEXT PRIMARY KEY,
    server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    creator_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    uses INTEGER NOT NULL DEFAULT 0,
    max_uses INTEGER NOT NULL DEFAULT 0,
    expires_at BIGINT,
    created_at BIGINT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS dms (
    id TEXT PRIMARY KEY,
    is_group INTEGER NOT NULL DEFAULT 0,
    name TEXT,
    owner_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at BIGINT NOT NULL,
    last_activity BIGINT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS dm_members (
    dm_id TEXT NOT NULL REFERENCES dms(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (dm_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    channel_id TEXT NOT NULL,
    author_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    reply_to TEXT,
    created_at BIGINT NOT NULL,
    edited_at BIGINT
  );
  CREATE INDEX IF NOT EXISTS idx_messages_channel ON messages(channel_id, created_at);

  CREATE TABLE IF NOT EXISTS reactions (
    message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    icon TEXT NOT NULL,
    PRIMARY KEY (message_id, user_id, icon)
  );

  CREATE TABLE IF NOT EXISTS friendships (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    friend_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'blocked')),
    requester_id TEXT NOT NULL,
    created_at BIGINT NOT NULL,
    PRIMARY KEY (user_id, friend_id)
  );
`;

// Im Code werden "?" als Platzhalter geschrieben; Postgres erwartet $1, $2, …
const toPg = (sql) => {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
};

// Einheitliche Abfrage-Schnittstelle über einem "query(sql, params) → { rows, rowCount }".
function makeQ(query) {
  return {
    get: async (sql, ...params) => (await query(toPg(sql), params)).rows[0],
    all: async (sql, ...params) => (await query(toPg(sql), params)).rows,
    run: async (sql, ...params) => {
      const r = await query(toPg(sql), params);
      return { changes: r.rowCount ?? r.affectedRows ?? 0 };
    },
  };
}

let q;
let mode;

async function initDb() {
  if (process.env.DATABASE_URL) {
    const { Pool, types } = require('pg');
    types.setTypeParser(INT8, (v) => Number(v));
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: /sslmode=disable|localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL) ? false : { rejectUnauthorized: false },
      max: Number(process.env.PG_POOL_MAX) || 5,
    });
    await pool.query(SCHEMA);
    q = {
      ...makeQ((sql, params) => pool.query(sql, params)),
      async tx(fn) {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const result = await fn(makeQ((sql, params) => client.query(sql, params)));
          await client.query('COMMIT');
          return result;
        } catch (err) {
          await client.query('ROLLBACK').catch(() => {});
          throw err;
        } finally {
          client.release();
        }
      },
    };
    mode = 'Postgres (DATABASE_URL)';
    closeDb = () => pool.end();
  } else {
    // SQLite übersteht auch ein hartes Beenden (Fenster schließen) ohne Datenverlust.
    const { DatabaseSync } = require('node:sqlite');
    fs.mkdirSync(dataDir, { recursive: true });
    const file = path.join(dataDir, 'lodge.db');
    const db = new DatabaseSync(file);
    db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
    db.exec(SCHEMA);
    const cache = new Map();
    const prepare = (sql) => {
      let s = cache.get(sql);
      if (!s) cache.set(sql, (s = db.prepare(sql)));
      return s;
    };
    // Gleiche Schnittstelle wie bei Postgres, nur synchron ausgeführt.
    const sqliteQ = {
      get: async (sql, ...params) => prepare(sql).get(...params),
      all: async (sql, ...params) => prepare(sql).all(...params),
      run: async (sql, ...params) => ({ changes: prepare(sql).run(...params).changes }),
    };
    q = {
      ...sqliteQ,
      // Innerhalb einer Transaktion wird nur auf SQLite gewartet (keine echte Ein-/Ausgabe),
      // daher können sich andere Anfragen nicht dazwischenschieben.
      async tx(fn) {
        db.exec('BEGIN');
        try {
          const result = await fn(sqliteQ);
          db.exec('COMMIT');
          return result;
        } catch (err) {
          db.exec('ROLLBACK');
          throw err;
        }
      },
    };
    closeDb = async () => db.close();
    mode = `lokal (${file})`;
  }
  return { q, mode };
}

let closeDb = async () => {};
module.exports.closeDb = () => closeDb();

// Proxy, damit andere Module "q" importieren können, bevor initDb() fertig ist.
const qProxy = new Proxy(
  {},
  {
    get(_t, prop) {
      if (!q) throw new Error('Datenbank noch nicht initialisiert');
      return q[prop];
    },
  }
);

Object.assign(module.exports, { initDb, q: qProxy, dataDir });
