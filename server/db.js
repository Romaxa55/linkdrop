import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

export function createDb(dbPath) {
  const file = dbPath || path.join(process.cwd(), 'data', 'linkdrop.db');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      username TEXT UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      url TEXT NOT NULL,
      sort INTEGER NOT NULL DEFAULT 0
    );
  `);

  const stmt = {
    insertUser: db.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)'),
    userById: db.prepare('SELECT * FROM users WHERE id = ?'),
    userByEmail: db.prepare('SELECT * FROM users WHERE email = ?'),
    userByUsername: db.prepare('SELECT * FROM users WHERE username = ?'),
    claimUsername: db.prepare('UPDATE users SET username = ? WHERE id = ?'),
    linksForUser: db.prepare('SELECT id, title, url FROM links WHERE user_id = ? ORDER BY sort, id'),
    deleteLinks: db.prepare('DELETE FROM links WHERE user_id = ?'),
    insertLink: db.prepare('INSERT INTO links (user_id, title, url, sort) VALUES (?, ?, ?, ?)'),
    countUsers: db.prepare('SELECT COUNT(*) AS n FROM users'),
    countLinks: db.prepare('SELECT COUNT(*) AS n FROM links'),
  };

  return {
    createUser(email, passwordHash) {
      const info = stmt.insertUser.run(email, passwordHash);
      return stmt.userById.get(info.lastInsertRowid);
    },
    getUserById: (id) => stmt.userById.get(id) || null,
    getUserByEmail: (email) => stmt.userByEmail.get(email) || null,
    getUserByUsername: (username) => stmt.userByUsername.get(username) || null,
    claimUsername(userId, username) {
      stmt.claimUsername.run(username, userId);
    },
    getLinksForUser(userId) {
      return stmt.linksForUser.all(userId);
    },
    setLinks(userId, links) {
      const tx = db.transaction(() => {
        stmt.deleteLinks.run(userId);
        links.forEach((link, i) => stmt.insertLink.run(userId, link.title, link.url, i));
      });
      tx();
    },
    getPublicProfile(username) {
      const user = stmt.userByUsername.get(username);
      if (!user) return null;
      return {
        username: user.username,
        created: user.created_at,
        links: stmt.linksForUser.all(user.id),
      };
    },
    countUsers: () => stmt.countUsers.get().n,
    countLinks: () => stmt.countLinks.get().n,
  };
}
