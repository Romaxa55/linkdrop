import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDb } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));

const SESSION_SECRET = process.env.SESSION_SECRET;
if (!SESSION_SECRET) {
  console.error('Missing required environment variable: SESSION_SECRET');
  console.error('Generate one with: openssl rand -hex 32');
  process.exit(1);
}

const PORT = Number(process.env.PORT || 3000);
const db = createDb(process.env.DATABASE_PATH);

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));

function sign(value) {
  return crypto.createHmac('sha256', SESSION_SECRET).update(value).digest('base64url');
}

function encodeSession(userId) {
  const value = String(userId);
  return `${value}.${sign(value)}`;
}

function decodeSession(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const [value, sig] = raw.split('.');
  if (!value || !sig) return null;
  const expected = sign(value);
  if (sig.length !== expected.length) return null;
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  const userId = Number(value);
  return Number.isInteger(userId) ? userId : null;
}

function parseCookies(header) {
  const out = {};
  for (const part of String(header).split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

function getSessionUser(req) {
  const cookies = parseCookies(req.headers.cookie || '');
  const userId = decodeSession(cookies.session);
  if (!userId) return null;
  return db.getUserById(userId);
}

function setSession(res, userId) {
  res.setHeader(
    'Set-Cookie',
    `session=${encodeURIComponent(encodeSession(userId))}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}`
  );
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  const check = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return check.length === expected.length && crypto.timingSafeEqual(check, expected);
}

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    app: 'linkdrop',
    version: pkg.version,
    users: db.countUsers(),
    links: db.countLinks(),
  });
});

app.post('/api/signup', (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Invalid email address' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }
  if (db.getUserByEmail(email)) {
    return res.status(409).json({ error: 'An account with this email already exists' });
  }
  const user = db.createUser(email, hashPassword(password));
  setSession(res, user.id);
  res.json({ id: user.id, email: user.email, username: user.username });
});

app.post('/api/login', (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const user = db.getUserByEmail(email);
  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: 'Wrong email or password' });
  }
  setSession(res, user.id);
  res.json({ id: user.id, email: user.email, username: user.username });
});

app.post('/api/logout', (req, res) => {
  res.setHeader('Set-Cookie', 'session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
  res.json({ ok: true });
});

app.get('/api/me', (req, res) => {
  const user = getSessionUser(req);
  if (!user) return res.json({ user: null });
  res.json({
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
      links: db.getLinksForUser(user.id),
    },
  });
});

app.post('/api/username', (req, res) => {
  const user = getSessionUser(req);
  if (!user) return res.status(401).json({ error: 'Not signed in' });
  const username = String(req.body?.username || '').trim().toLowerCase();
  if (!/^[a-z0-9_]{3,20}$/.test(username)) {
    return res.status(400).json({ error: 'Username must be 3-20 characters: a-z, 0-9, underscore' });
  }
  if (db.getUserByUsername(username)) {
    return res.status(409).json({ error: 'That username is already taken' });
  }
  db.claimUsername(user.id, username);
  res.json({ username });
});

app.put('/api/links', (req, res) => {
  const user = getSessionUser(req);
  if (!user) return res.status(401).json({ error: 'Not signed in' });
  const links = Array.isArray(req.body?.links) ? req.body.links : [];
  if (links.length > 10) return res.status(400).json({ error: 'Maximum 10 links' });
  const clean = [];
  for (const link of links) {
    const title = String(link?.title || '').trim();
    const url = String(link?.url || '').trim();
    if (!title || !url) continue;
    if (!/^https?:\/\/.+/i.test(url)) {
      return res.status(400).json({ error: 'Each link must start with http:// or https://' });
    }
    clean.push({ title: title.slice(0, 80), url: url.slice(0, 500) });
  }
  db.setLinks(user.id, clean);
  res.json({ links: db.getLinksForUser(user.id) });
});

app.get('/api/user/:username', (req, res) => {
  const profile = db.getPublicProfile(String(req.params.username).toLowerCase());
  if (!profile) return res.status(404).json({ error: 'User not found' });
  res.json(profile);
});

const distDir = path.join(__dirname, '..', 'dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api/')) {
      return res.sendFile(path.join(distDir, 'index.html'));
    }
    next();
  });
} else {
  app.get('/', (req, res) => {
    res.status(503).send('Frontend is not built. Run: npm run build');
  });
}

app.listen(PORT, () => {
  console.log(`linkdrop v${pkg.version} listening on :${PORT}`);
});
