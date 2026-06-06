const { nowIso } = require('./db');

function createSettingsManager(db) {
  const getSetting = db.prepare('SELECT value FROM settings WHERE key = ?');
  const listSettings = db.prepare('SELECT key, value, updated_at FROM settings ORDER BY key ASC');
  const upsertSetting = db.prepare(`
    INSERT INTO settings (key, value, updated_at)
    VALUES (@key, @value, @updatedAt)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = excluded.updated_at
  `);

  function get(key, fallback = null) {
    const row = getSetting.get(key);
    if (!row) return fallback;
    return parseJson(row.value, fallback);
  }

  function set(key, value) {
    upsertSetting.run({
      key,
      value: JSON.stringify(value),
      updatedAt: nowIso()
    });
    return value;
  }

  function all() {
    return Object.fromEntries(
      listSettings.all().map((row) => [row.key, parseJson(row.value, null)])
    );
  }

  return { get, set, all };
}

function parseJson(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

module.exports = {
  createSettingsManager
};
