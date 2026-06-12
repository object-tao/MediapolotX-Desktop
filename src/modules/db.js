const fs = require('node:fs');
const path = require('node:path');
const initSqlJs = require('sql.js');

async function createDatabase(dbPath) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const SQL = await initSqlJs();
  const db = fs.existsSync(dbPath)
    ? new SQL.Database(fs.readFileSync(dbPath))
    : new SQL.Database();

  migrate(db);
  persist(db, dbPath);

  return {
    exec: (sql) => {
      db.exec(sql);
      persist(db, dbPath);
    },
    prepare: (sql) => createStatement(db, dbPath, sql),
    close: () => persist(db, dbPath)
  };
}

function migrate(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS storages (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      base_path TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'unknown',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS files (
      id TEXT PRIMARY KEY,
      storage_id TEXT NOT NULL,
      relative_path TEXT NOT NULL,
      absolute_path TEXT NOT NULL,
      file_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL DEFAULT 0,
      mtime_ms INTEGER NOT NULL DEFAULT 0,
      hash TEXT,
      thumbnail_path TEXT,
      processing_status TEXT NOT NULL DEFAULT 'indexed',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(storage_id, relative_path),
      FOREIGN KEY(storage_id) REFERENCES storages(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      remote_id TEXT,
      task_type TEXT NOT NULL,
      payload TEXT NOT NULL,
      result TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      error_message TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS local_works (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      folder_name TEXT NOT NULL,
      folder_path TEXT NOT NULL,
      md_file TEXT,
      image_paths TEXT NOT NULL DEFAULT '[]',
      tags TEXT NOT NULL DEFAULT '[]',
      content TEXT NOT NULL DEFAULT '',
      publish_status TEXT NOT NULL DEFAULT '未发布',
      source_root TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS local_work_children (
      id TEXT PRIMARY KEY,
      parent_id TEXT NOT NULL,
      title TEXT NOT NULL,
      variant_name TEXT NOT NULL,
      folder_path TEXT NOT NULL,
      image_paths TEXT NOT NULL DEFAULT '[]',
      content TEXT NOT NULL DEFAULT '',
      publish_status TEXT NOT NULL DEFAULT '未发布',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(parent_id) REFERENCES local_works(id) ON DELETE CASCADE
    );
  `);

  addColumnIfMissing(db, 'tasks', 'result', 'TEXT');
  addColumnIfMissing(db, 'local_works', 'tags', "TEXT NOT NULL DEFAULT '[]'");
  addColumnIfMissing(db, 'local_works', 'content', "TEXT NOT NULL DEFAULT ''");
}

function addColumnIfMissing(db, tableName, columnName, columnDefinition) {
  const columns = db.exec(`PRAGMA table_info(${tableName})`)[0]?.values || [];
  const exists = columns.some((column) => column[1] === columnName);
  if (!exists) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition}`);
  }
}

function createStatement(db, dbPath, sql) {
  return {
    run: (...args) => {
      const statement = db.prepare(sql);
      try {
        bind(statement, args);
        statement.step();
        persist(db, dbPath);
      } finally {
        statement.free();
      }
    },
    get: (...args) => {
      const statement = db.prepare(sql);
      try {
        bind(statement, args);
        if (!statement.step()) return undefined;
        return statement.getAsObject();
      } finally {
        statement.free();
      }
    },
    all: (...args) => {
      const statement = db.prepare(sql);
      const rows = [];
      try {
        bind(statement, args);
        while (statement.step()) {
          rows.push(statement.getAsObject());
        }
        return rows;
      } finally {
        statement.free();
      }
    }
  };
}

function bind(statement, args) {
  if (args.length === 0) return;
  if (args.length === 1 && isPlainObject(args[0])) {
    statement.bind(normalizeNamedParams(args[0]));
    return;
  }
  statement.bind(args);
}

function normalizeNamedParams(params) {
  return Object.fromEntries(
    Object.entries(params).map(([key, value]) => [
      key.startsWith('@') || key.startsWith(':') || key.startsWith('$') ? key : `@${key}`,
      value
    ])
  );
}

function persist(db, dbPath) {
  fs.writeFileSync(dbPath, Buffer.from(db.export()));
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function nowIso() {
  return new Date().toISOString();
}

module.exports = {
  createDatabase,
  nowIso
};
