import React, { useEffect, useState } from 'react';

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function Health() {
  const [health, setHealth] = useState(null);
  useEffect(() => {
    api('/api/health').then(setHealth).catch(() => {});
  }, []);
  if (!health) return <div className="footer">linkdrop</div>;
  return (
    <div className="footer">
      linkdrop v{health.version} · {health.users} users · {health.links} links
    </div>
  );
}

function AuthForm({ onAuthed }) {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const data = await api(`/api/${mode === 'login' ? 'login' : 'signup'}`, {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      onAuthed(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <h1>LinkDrop</h1>
      <p className="sub">One public page for all your links.</p>
      <form onSubmit={submit}>
        <label htmlFor="email">Email</label>
        <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <label htmlFor="password">Password</label>
        <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <button disabled={busy}>{busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}</button>
      </form>
      {error && <div className="error">{error}</div>}
      <button className="secondary" type="button" onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}>
        {mode === 'login' ? 'Need an account? Sign up' : 'Have an account? Sign in'}
      </button>
    </div>
  );
}

function ClaimUsername({ me, onClaimed }) {
  const [username, setUsername] = useState('');
  const [error, setError] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setError(null);
    try {
      const data = await api('/api/username', {
        method: 'POST',
        body: JSON.stringify({ username }),
      });
      onClaimed({ ...me, username: data.username });
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="card">
      <h1>Claim your username</h1>
      <p className="sub">Signed in as {me.email}. Pick the address for your public page.</p>
      <form onSubmit={submit}>
        <label htmlFor="username">Username</label>
        <input id="username" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="yourname" required />
        <button>Claim username</button>
      </form>
      {error && <div className="error">{error}</div>}
    </div>
  );
}

function LinksEditor({ me, onUpdate }) {
  const [links, setLinks] = useState(me.links || []);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);

  function edit(i, field, value) {
    setLinks(links.map((l, idx) => (idx === i ? { ...l, [field]: value } : l)));
    setSaved(false);
  }

  async function save(e) {
    e.preventDefault();
    setError(null);
    try {
      const data = await api('/api/links', {
        method: 'PUT',
        body: JSON.stringify({ links }),
      });
      setLinks(data.links);
      onUpdate({ ...me, links: data.links });
      setSaved(true);
    } catch (err) {
      setError(err.message);
    }
  }

  async function signOut() {
    await api('/api/logout', { method: 'POST' });
    window.location.href = '/';
  }

  return (
    <div className="card">
      <h1>Your links</h1>
      <p className="sub">
        Signed in as {me.email} · <a href="#" onClick={signOut}>Sign out</a>
      </p>
      <form onSubmit={save}>
        {links.map((link, i) => (
          <div className="link-row" key={i}>
            <input placeholder="Title" value={link.title} onChange={(e) => edit(i, 'title', e.target.value)} />
            <input placeholder="https://…" value={link.url} onChange={(e) => edit(i, 'url', e.target.value)} />
          </div>
        ))}
        <button className="secondary" type="button" onClick={() => setLinks([...links, { title: '', url: '' }])}>
          Add link
        </button>
        <button>Save links</button>
      </form>
      {saved && <p className="sub">Saved ✓</p>}
      {error && <div className="error">{error}</div>}
      <a className="public-link" href={`/u/${me.username}`}>
        View your public page →
      </a>
    </div>
  );
}

function PublicProfile({ username }) {
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api(`/api/user/${encodeURIComponent(username)}`)
      .then(setProfile)
      .catch((err) => setError(err.message));
  }, [username]);

  if (error) return <div className="card"><h1>Not found</h1><p className="sub">{error}</p></div>;
  if (!profile) return <div className="card"><p className="sub">Loading…</p></div>;

  return (
    <div className="card bio">
      <h1>@{profile.username}</h1>
      <p className="sub">on LinkDrop</p>
      {profile.links.length === 0 && <p className="sub">No links yet.</p>}
      {profile.links.map((link) => (
        <a className="public-link" key={link.id} href={link.url} target="_blank" rel="noreferrer">
          {link.title}
        </a>
      ))}
    </div>
  );
}

export default function App() {
  const path = window.location.pathname;
  const profileMatch = path.match(/^\/u\/([a-z0-9_]+)\/?$/i);

  const [me, setMe] = useState(undefined);

  useEffect(() => {
    if (profileMatch) return;
    api('/api/me')
      .then((data) => setMe(data.user))
      .catch(() => setMe(null));
  }, []);

  if (profileMatch) {
    return (
      <>
        <PublicProfile username={profileMatch[1]} />
        <Health />
      </>
    );
  }

  if (me === undefined) {
    return <div className="card"><p className="sub">Loading…</p></div>;
  }

  return (
    <>
      {!me && <AuthForm onAuthed={(user) => setMe({ ...user, links: [] })} />}
      {me && !me.username && <ClaimUsername me={me} onClaimed={setMe} />}
      {me && me.username && <LinksEditor me={me} onUpdate={setMe} />}
      <Health />
    </>
  );
}
