const http = require('http');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');
const { q, dataDir } = require('./db');

const PORT = Number(process.env.PORT) || 3000;

// JWT-Secret wird beim ersten Start erzeugt und im Datenordner gespeichert.
const secretFile = path.join(dataDir, 'jwt-secret');
if (!fs.existsSync(secretFile)) fs.writeFileSync(secretFile, crypto.randomBytes(48).toString('hex'));
const JWT_SECRET = process.env.JWT_SECRET || fs.readFileSync(secretFile, 'utf8').trim();

const COLORS = ['#7c5cff', '#2bb3ff', '#22c993', '#ff8a3d', '#ff4f8b', '#f5c400', '#00c2c7', '#a56bff'];
const SERVER_ICONS = ['planet', 'game-controller', 'rocket', 'flame', 'leaf', 'musical-notes', 'cafe', 'diamond', 'flash', 'moon', 'skull', 'trophy'];
const REACTION_ICONS = ['heart', 'thumbs-up', 'thumbs-down', 'happy', 'sad', 'flame', 'star', 'checkmark-circle', 'eye', 'rocket', 'trophy', 'skull', 'help-circle', 'alert-circle', 'musical-notes', 'game-controller'];

const id = () => crypto.randomUUID();
const now = () => Date.now();
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const inviteCode = () => crypto.randomBytes(5).toString('base64url');

class HttpError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}
const fail = (status, code) => {
  throw new HttpError(status, code);
};

// ---------- Präsenz ----------

const onlineSockets = new Map(); // userId -> Anzahl verbundener Sockets

function effectiveStatus(u) {
  if (!onlineSockets.get(u.id)) return 'offline';
  return u.status === 'invisible' ? 'offline' : u.status;
}

function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    username: u.username,
    displayName: u.display_name,
    avatarColor: u.avatar_color,
    avatarIcon: u.avatar_icon,
    status: effectiveStatus(u),
    customStatus: u.custom_status,
    about: u.about,
    createdAt: u.created_at,
  };
}

function selfUser(u) {
  return { ...publicUser(u), status: u.status, online: true };
}

const getUser = (userId) => q.get('SELECT * FROM users WHERE id = ?', userId);

// ---------- Serialisierung ----------

function serializeServer(serverId, forUserId) {
  const s = q.get('SELECT * FROM servers WHERE id = ?', serverId);
  if (!s) return null;
  const channels = q.all('SELECT * FROM channels WHERE server_id = ? ORDER BY type, position, created_at', serverId).map((c) => ({
    id: c.id,
    serverId: c.server_id,
    name: c.name,
    type: c.type,
    topic: c.topic,
    position: c.position,
  }));
  const members = q
    .all('SELECT m.role, m.nickname, m.joined_at, u.* FROM members m JOIN users u ON u.id = m.user_id WHERE m.server_id = ? ORDER BY m.joined_at', serverId)
    .map((row) => ({ ...publicUser(row), role: row.role, nickname: row.nickname, joinedAt: row.joined_at }));
  const me = forUserId ? members.find((m) => m.id === forUserId) : null;
  return {
    id: s.id,
    name: s.name,
    icon: s.icon,
    color: s.color,
    description: s.description,
    ownerId: s.owner_id,
    createdAt: s.created_at,
    myRole: me ? me.role : null,
    channels,
    members,
  };
}

function serializeDm(dmId) {
  const d = q.get('SELECT * FROM dms WHERE id = ?', dmId);
  if (!d) return null;
  const members = q.all('SELECT u.* FROM dm_members dm JOIN users u ON u.id = dm.user_id WHERE dm.dm_id = ?', dmId).map(publicUser);
  return { id: d.id, isGroup: !!d.is_group, name: d.name, ownerId: d.owner_id, createdAt: d.created_at, lastActivity: d.last_activity, members };
}

function serializeMessage(m) {
  const author = m.author_id ? publicUser(getUser(m.author_id)) : null;
  const reactionRows = q.all('SELECT icon, user_id FROM reactions WHERE message_id = ?', m.id);
  const reactions = {};
  for (const r of reactionRows) (reactions[r.icon] ||= []).push(r.user_id);
  let reply = null;
  if (m.reply_to) {
    const r = q.get('SELECT id, content, author_id FROM messages WHERE id = ?', m.reply_to);
    if (r) reply = { id: r.id, content: r.content.slice(0, 140), author: publicUser(getUser(r.author_id)) };
  }
  return {
    id: m.id,
    channelId: m.channel_id,
    author,
    content: m.content,
    replyTo: reply,
    createdAt: m.created_at,
    editedAt: m.edited_at,
    reactions,
  };
}

function friendsOf(userId) {
  return q
    .all('SELECT u.*, f.status AS f_status, f.requester_id AS f_requester, f.created_at AS f_since FROM friendships f JOIN users u ON u.id = f.friend_id WHERE f.user_id = ?', userId)
    .map((row) => ({
      user: publicUser(row),
      status: row.f_status,
      direction: row.f_requester === userId ? 'outgoing' : 'incoming',
      since: row.f_since,
    }));
}

// ---------- Zugriffsrechte ----------

const membership = (serverId, userId) => q.get('SELECT * FROM members WHERE server_id = ? AND user_id = ?', serverId, userId);
const ROLE_RANK = { member: 0, admin: 1, owner: 2 };

function requireMember(serverId, userId) {
  const m = membership(serverId, userId);
  if (!m) fail(403, 'not_member');
  return m;
}

function requireRole(serverId, userId, role) {
  const m = requireMember(serverId, userId);
  if (ROLE_RANK[m.role] < ROLE_RANK[role]) fail(403, 'missing_permission');
  return m;
}

const isDmMember = (dmId, userId) => !!q.get('SELECT 1 FROM dm_members WHERE dm_id = ? AND user_id = ?', dmId, userId);

// Liefert den Raum ("server:x" oder "dm:x"), zu dem ein Kanal gehört, und prüft den Zugriff.
function resolveChannel(channelId, userId) {
  const channel = q.get('SELECT * FROM channels WHERE id = ?', channelId);
  if (channel) {
    requireMember(channel.server_id, userId);
    return { kind: 'channel', channel, room: `server:${channel.server_id}` };
  }
  const dm = q.get('SELECT * FROM dms WHERE id = ?', channelId);
  if (dm) {
    if (!isDmMember(dm.id, userId)) fail(403, 'not_member');
    return { kind: 'dm', dm, room: `dm:${dm.id}` };
  }
  fail(404, 'channel_not_found');
}

// ---------- App ----------

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' }, maxHttpBufferSize: 1e6 });

const emitServer = (serverId, event, payload) => io.to(`server:${serverId}`).emit(event, payload);
const emitUser = (userId, event, payload) => io.to(`user:${userId}`).emit(event, payload);

// Schickt jedem Mitglied die eigene Sicht auf den Server (myRole unterscheidet sich).
function broadcastServer(serverId) {
  const userIds = q.all('SELECT user_id FROM members WHERE server_id = ?', serverId).map((r) => r.user_id);
  for (const uid of userIds) emitUser(uid, 'server:upsert', serializeServer(serverId, uid));
}

function broadcastDm(dmId) {
  const dm = serializeDm(dmId);
  if (dm) for (const m of dm.members) emitUser(m.id, 'dm:upsert', dm);
}

const pushFriends = (userId) => emitUser(userId, 'friends:update', friendsOf(userId));

// Teilt eine Profiländerung allen mit, die den Nutzer sehen können.
function broadcastUser(userId) {
  const u = getUser(userId);
  if (!u) return;
  const payload = publicUser(u);
  const rooms = new Set();
  for (const r of q.all('SELECT server_id FROM members WHERE user_id = ?', userId)) rooms.add(`server:${r.server_id}`);
  for (const r of q.all('SELECT dm_id FROM dm_members WHERE user_id = ?', userId)) rooms.add(`dm:${r.dm_id}`);
  for (const r of q.all('SELECT friend_id FROM friendships WHERE user_id = ?', userId)) rooms.add(`user:${r.friend_id}`);
  if (rooms.size) io.to([...rooms]).emit('user:update', payload);
  emitUser(userId, 'me:update', selfUser(u));
}

const wrap = (fn) => async (req, res) => {
  try {
    const result = await fn(req, res);
    if (!res.headersSent) res.json(result ?? { ok: true });
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.code });
    console.error(err);
    res.status(500).json({ error: 'server_error' });
  }
};

function auth(req, _res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = getUser(payload.sub);
    if (!user) throw new Error('gone');
    req.user = user;
    next();
  } catch {
    _res.status(401).json({ error: 'unauthorized' });
  }
}

const signToken = (userId) => jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: '60d' });

const str = (v, max, min = 0) => {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t.length >= min && t.length <= max ? t : null;
};

// ---------- Auth ----------

const loginAttempts = new Map();
function throttle(key) {
  const entry = loginAttempts.get(key) || { count: 0, reset: now() + 10 * 60_000 };
  if (entry.reset < now()) Object.assign(entry, { count: 0, reset: now() + 10 * 60_000 });
  entry.count++;
  loginAttempts.set(key, entry);
  if (entry.count > 20) fail(429, 'too_many_attempts');
}

app.get('/api/health', (_req, res) => res.json({ ok: true, name: 'Lodge', version: 1 }));

app.post(
  '/api/auth/register',
  wrap(async (req) => {
    throttle(`reg:${req.ip}`);
    const username = str(req.body.username, 32, 3);
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    const displayName = str(req.body.displayName, 32, 1) || username;
    if (!username || !/^[a-zA-Z0-9_.]+$/.test(username)) fail(400, 'invalid_username');
    if (password.length < 6 || password.length > 128) fail(400, 'invalid_password');
    if (q.get('SELECT 1 FROM users WHERE username = ?', username)) fail(409, 'username_taken');
    const userId = id();
    const hash = await bcrypt.hash(password, 10);
    q.run(
      'INSERT INTO users (id, username, display_name, password_hash, avatar_color, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      userId,
      username,
      displayName,
      hash,
      pick(COLORS),
      now()
    );
    return { token: signToken(userId), user: selfUser(getUser(userId)) };
  })
);

app.post(
  '/api/auth/login',
  wrap(async (req) => {
    throttle(`login:${req.ip}`);
    const username = str(req.body.username, 32, 1);
    const user = username && q.get('SELECT * FROM users WHERE username = ?', username);
    const ok = user && (await bcrypt.compare(String(req.body.password || ''), user.password_hash));
    if (!ok) fail(401, 'invalid_credentials');
    return { token: signToken(user.id), user: selfUser(user) };
  })
);

// ---------- Konto ----------

app.get(
  '/api/bootstrap',
  auth,
  wrap(async (req) => {
    const uid = req.user.id;
    const servers = q
      .all('SELECT server_id FROM members WHERE user_id = ? ORDER BY joined_at', uid)
      .map((r) => serializeServer(r.server_id, uid));
    const dms = q
      .all('SELECT d.id FROM dms d JOIN dm_members m ON m.dm_id = d.id WHERE m.user_id = ? ORDER BY d.last_activity DESC', uid)
      .map((r) => serializeDm(r.id));
    const rooms = new Set([...servers.map((s) => s.channels.map((c) => c.id)).flat(), ...dms.map((d) => d.id)]);
    const voice = {};
    for (const [roomId, participants] of voiceRooms) if (rooms.has(roomId)) voice[roomId] = [...participants.values()];
    return { user: selfUser(req.user), servers, dms, friends: friendsOf(uid), voice, reactionIcons: REACTION_ICONS, serverIcons: SERVER_ICONS, colors: COLORS };
  })
);

app.patch(
  '/api/me',
  auth,
  wrap(async (req) => {
    const b = req.body;
    const u = req.user;
    const displayName = b.displayName !== undefined ? str(b.displayName, 32, 1) : u.display_name;
    if (!displayName) fail(400, 'invalid_display_name');
    const about = b.about !== undefined ? str(b.about, 190) : u.about;
    const customStatus = b.customStatus !== undefined ? str(b.customStatus, 64) : u.custom_status;
    const status = b.status !== undefined ? b.status : u.status;
    if (!['online', 'idle', 'dnd', 'invisible'].includes(status)) fail(400, 'invalid_status');
    const avatarColor = b.avatarColor !== undefined ? b.avatarColor : u.avatar_color;
    if (!/^#[0-9a-fA-F]{6}$/.test(avatarColor)) fail(400, 'invalid_color');
    const avatarIcon = b.avatarIcon !== undefined ? b.avatarIcon || null : u.avatar_icon;
    if (about === null || customStatus === null) fail(400, 'too_long');
    q.run(
      'UPDATE users SET display_name = ?, about = ?, custom_status = ?, status = ?, avatar_color = ?, avatar_icon = ? WHERE id = ?',
      displayName,
      about,
      customStatus,
      status,
      avatarColor,
      avatarIcon,
      u.id
    );
    broadcastUser(u.id);
    return selfUser(getUser(u.id));
  })
);

app.post(
  '/api/me/username',
  auth,
  wrap(async (req) => {
    const username = str(req.body.username, 32, 3);
    if (!username || !/^[a-zA-Z0-9_.]+$/.test(username)) fail(400, 'invalid_username');
    if (!(await bcrypt.compare(String(req.body.password || ''), req.user.password_hash))) fail(401, 'wrong_password');
    const taken = q.get('SELECT id FROM users WHERE username = ?', username);
    if (taken && taken.id !== req.user.id) fail(409, 'username_taken');
    q.run('UPDATE users SET username = ? WHERE id = ?', username, req.user.id);
    broadcastUser(req.user.id);
    return selfUser(getUser(req.user.id));
  })
);

app.post(
  '/api/me/password',
  auth,
  wrap(async (req) => {
    const next = String(req.body.newPassword || '');
    if (next.length < 6 || next.length > 128) fail(400, 'invalid_password');
    if (!(await bcrypt.compare(String(req.body.oldPassword || ''), req.user.password_hash))) fail(401, 'wrong_password');
    q.run('UPDATE users SET password_hash = ? WHERE id = ?', await bcrypt.hash(next, 10), req.user.id);
    return { ok: true };
  })
);

app.delete(
  '/api/me',
  auth,
  wrap(async (req) => {
    const uid = req.user.id;
    if (!(await bcrypt.compare(String(req.body.password || ''), req.user.password_hash))) fail(401, 'wrong_password');

    const ownedServers = q.all('SELECT id FROM servers WHERE owner_id = ?', uid).map((r) => r.id);
    const ownedMembers = new Map(ownedServers.map((sid) => [sid, q.all('SELECT user_id FROM members WHERE server_id = ?', sid).map((r) => r.user_id)]));
    const otherServers = q.all('SELECT server_id FROM members WHERE user_id = ?', uid).map((r) => r.server_id).filter((s) => !ownedServers.includes(s));
    const dmIds = q.all('SELECT dm_id FROM dm_members WHERE user_id = ?', uid).map((r) => r.dm_id);
    const friendIds = q.all('SELECT friend_id FROM friendships WHERE user_id = ?', uid).map((r) => r.friend_id);

    q.tx(() => {
      q.run('DELETE FROM friendships WHERE friend_id = ?', uid);
      q.run('DELETE FROM users WHERE id = ?', uid);
      // Leere oder nur noch einseitige Unterhaltungen aufräumen.
      for (const dmId of dmIds) {
        const left = q.get('SELECT COUNT(*) AS c FROM dm_members WHERE dm_id = ?', dmId).c;
        const dm = q.get('SELECT is_group FROM dms WHERE id = ?', dmId);
        if (left === 0 || (dm && !dm.is_group && left < 2)) {
          q.run('DELETE FROM messages WHERE channel_id = ?', dmId);
          q.run('DELETE FROM dms WHERE id = ?', dmId);
        }
      }
      for (const sid of ownedServers) {
        q.run('DELETE FROM messages WHERE channel_id IN (SELECT id FROM channels WHERE server_id = ?)', sid);
      }
    });

    for (const [sid, members] of ownedMembers) for (const m of members) emitUser(m, 'server:remove', { id: sid });
    for (const sid of otherServers) broadcastServer(sid);
    for (const dmId of dmIds) {
      if (q.get('SELECT 1 FROM dms WHERE id = ?', dmId)) broadcastDm(dmId);
      else io.to(`dm:${dmId}`).emit('dm:remove', { id: dmId });
    }
    for (const f of friendIds) pushFriends(f);
    io.in(`user:${uid}`).disconnectSockets(true);
    return { ok: true };
  })
);

app.get(
  '/api/users/:id',
  auth,
  wrap(async (req) => {
    const u = getUser(req.params.id);
    if (!u) fail(404, 'user_not_found');
    const mutualServers = q
      .all('SELECT s.id, s.name, s.icon, s.color FROM members a JOIN members b ON a.server_id = b.server_id JOIN servers s ON s.id = a.server_id WHERE a.user_id = ? AND b.user_id = ?', req.user.id, u.id);
    return { ...publicUser(u), mutualServers };
  })
);

// ---------- Server ----------

function createChannel(serverId, name, type, topic = '') {
  const pos = q.get('SELECT COALESCE(MAX(position), -1) + 1 AS p FROM channels WHERE server_id = ? AND type = ?', serverId, type).p;
  const cid = id();
  q.run('INSERT INTO channels (id, server_id, name, type, topic, position, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', cid, serverId, name, type, topic, pos, now());
  return cid;
}

const channelName = (v, type) => {
  const name = str(v, 40, 1);
  if (!name) fail(400, 'invalid_name');
  return type === 'text' ? name.toLowerCase().replace(/\s+/g, '-') : name;
};

function addMember(serverId, userId, role = 'member') {
  q.run('INSERT OR IGNORE INTO members (server_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)', serverId, userId, role, now());
  io.in(`user:${userId}`).socketsJoin(`server:${serverId}`);
}

app.post(
  '/api/servers',
  auth,
  wrap(async (req) => {
    const name = str(req.body.name, 50, 1);
    if (!name) fail(400, 'invalid_name');
    const icon = SERVER_ICONS.includes(req.body.icon) ? req.body.icon : 'planet';
    const color = /^#[0-9a-fA-F]{6}$/.test(req.body.color || '') ? req.body.color : pick(COLORS);
    const sid = id();
    q.tx(() => {
      q.run('INSERT INTO servers (id, name, icon, color, owner_id, created_at) VALUES (?, ?, ?, ?, ?, ?)', sid, name, icon, color, req.user.id, now());
      addMember(sid, req.user.id, 'owner');
      createChannel(sid, 'allgemein', 'text');
      createChannel(sid, 'clips', 'text');
      createChannel(sid, 'Lounge', 'voice');
      createChannel(sid, 'Gaming', 'voice');
    });
    return serializeServer(sid, req.user.id);
  })
);

app.patch(
  '/api/servers/:id',
  auth,
  wrap(async (req) => {
    const sid = req.params.id;
    requireRole(sid, req.user.id, 'admin');
    const s = q.get('SELECT * FROM servers WHERE id = ?', sid);
    const name = req.body.name !== undefined ? str(req.body.name, 50, 1) : s.name;
    if (!name) fail(400, 'invalid_name');
    const icon = req.body.icon !== undefined && SERVER_ICONS.includes(req.body.icon) ? req.body.icon : s.icon;
    const color = req.body.color !== undefined && /^#[0-9a-fA-F]{6}$/.test(req.body.color) ? req.body.color : s.color;
    const description = req.body.description !== undefined ? str(req.body.description, 300) ?? s.description : s.description;
    q.run('UPDATE servers SET name = ?, icon = ?, color = ?, description = ? WHERE id = ?', name, icon, color, description, sid);
    broadcastServer(sid);
    return serializeServer(sid, req.user.id);
  })
);

app.delete(
  '/api/servers/:id',
  auth,
  wrap(async (req) => {
    const sid = req.params.id;
    requireRole(sid, req.user.id, 'owner');
    const members = q.all('SELECT user_id FROM members WHERE server_id = ?', sid).map((r) => r.user_id);
    q.tx(() => {
      q.run('DELETE FROM messages WHERE channel_id IN (SELECT id FROM channels WHERE server_id = ?)', sid);
      q.run('DELETE FROM servers WHERE id = ?', sid);
    });
    for (const m of members) emitUser(m, 'server:remove', { id: sid });
    io.in(`server:${sid}`).socketsLeave(`server:${sid}`);
    return { ok: true };
  })
);

function removeMember(sid, uid) {
  q.run('DELETE FROM members WHERE server_id = ? AND user_id = ?', sid, uid);
  emitUser(uid, 'server:remove', { id: sid });
  io.in(`user:${uid}`).socketsLeave(`server:${sid}`);
  broadcastServer(sid);
}

app.post(
  '/api/servers/:id/leave',
  auth,
  wrap(async (req) => {
    const m = requireMember(req.params.id, req.user.id);
    if (m.role === 'owner') fail(400, 'owner_cannot_leave');
    removeMember(req.params.id, req.user.id);
  })
);

app.delete(
  '/api/servers/:id/members/:userId',
  auth,
  wrap(async (req) => {
    const sid = req.params.id;
    const me = requireRole(sid, req.user.id, 'admin');
    const target = membership(sid, req.params.userId);
    if (!target) fail(404, 'not_member');
    if (ROLE_RANK[target.role] >= ROLE_RANK[me.role]) fail(403, 'missing_permission');
    if (req.query.ban === '1') q.run('INSERT OR IGNORE INTO bans (server_id, user_id) VALUES (?, ?)', sid, target.user_id);
    removeMember(sid, target.user_id);
  })
);

app.patch(
  '/api/servers/:id/members/:userId',
  auth,
  wrap(async (req) => {
    const sid = req.params.id;
    const target = membership(sid, req.params.userId);
    if (!target) fail(404, 'not_member');
    if (req.body.role !== undefined) {
      requireRole(sid, req.user.id, 'owner');
      if (!['admin', 'member'].includes(req.body.role) || target.role === 'owner') fail(400, 'invalid_role');
      q.run('UPDATE members SET role = ? WHERE server_id = ? AND user_id = ?', req.body.role, sid, target.user_id);
    }
    if (req.body.nickname !== undefined) {
      if (target.user_id !== req.user.id) requireRole(sid, req.user.id, 'admin');
      q.run('UPDATE members SET nickname = ? WHERE server_id = ? AND user_id = ?', str(req.body.nickname, 32) || null, sid, target.user_id);
    }
    broadcastServer(sid);
  })
);

app.post(
  '/api/servers/:id/transfer',
  auth,
  wrap(async (req) => {
    const sid = req.params.id;
    requireRole(sid, req.user.id, 'owner');
    const target = membership(sid, req.body.userId);
    if (!target || target.user_id === req.user.id) fail(400, 'invalid_target');
    q.tx(() => {
      q.run("UPDATE members SET role = 'admin' WHERE server_id = ? AND user_id = ?", sid, req.user.id);
      q.run("UPDATE members SET role = 'owner' WHERE server_id = ? AND user_id = ?", sid, target.user_id);
      q.run('UPDATE servers SET owner_id = ? WHERE id = ?', target.user_id, sid);
    });
    broadcastServer(sid);
  })
);

// ---------- Einladungen ----------

app.post(
  '/api/servers/:id/invites',
  auth,
  wrap(async (req) => {
    const sid = req.params.id;
    requireMember(sid, req.user.id);
    const maxUses = Math.max(0, Math.min(1000, Number(req.body.maxUses) || 0));
    const hours = Number(req.body.expiresInHours) || 0;
    const expiresAt = hours > 0 ? now() + hours * 3600_000 : null;
    const code = inviteCode();
    q.run('INSERT INTO invites (code, server_id, creator_id, max_uses, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)', code, sid, req.user.id, maxUses, expiresAt, now());
    return { code, maxUses, expiresAt };
  })
);

app.get(
  '/api/servers/:id/invites',
  auth,
  wrap(async (req) => {
    requireRole(req.params.id, req.user.id, 'admin');
    return q.all('SELECT * FROM invites WHERE server_id = ? ORDER BY created_at DESC', req.params.id).map((i) => ({
      code: i.code,
      uses: i.uses,
      maxUses: i.max_uses,
      expiresAt: i.expires_at,
      creator: publicUser(getUser(i.creator_id)),
    }));
  })
);

app.delete(
  '/api/invites/:code',
  auth,
  wrap(async (req) => {
    const inv = q.get('SELECT * FROM invites WHERE code = ?', req.params.code);
    if (!inv) fail(404, 'invite_not_found');
    if (inv.creator_id !== req.user.id) requireRole(inv.server_id, req.user.id, 'admin');
    q.run('DELETE FROM invites WHERE code = ?', inv.code);
  })
);

function validInvite(code) {
  const inv = q.get('SELECT * FROM invites WHERE code = ?', code);
  if (!inv) fail(404, 'invite_not_found');
  if (inv.expires_at && inv.expires_at < now()) fail(410, 'invite_expired');
  if (inv.max_uses && inv.uses >= inv.max_uses) fail(410, 'invite_used_up');
  return inv;
}

app.get(
  '/api/invites/:code',
  auth,
  wrap(async (req) => {
    const inv = validInvite(req.params.code);
    const s = q.get('SELECT * FROM servers WHERE id = ?', inv.server_id);
    const count = q.get('SELECT COUNT(*) AS c FROM members WHERE server_id = ?', s.id).c;
    return { code: inv.code, server: { id: s.id, name: s.name, icon: s.icon, color: s.color, description: s.description, memberCount: count }, alreadyMember: !!membership(s.id, req.user.id) };
  })
);

app.post(
  '/api/invites/:code/join',
  auth,
  wrap(async (req) => {
    const inv = validInvite(req.params.code);
    const sid = inv.server_id;
    if (q.get('SELECT 1 FROM bans WHERE server_id = ? AND user_id = ?', sid, req.user.id)) fail(403, 'banned');
    if (!membership(sid, req.user.id)) {
      q.tx(() => {
        addMember(sid, req.user.id);
        q.run('UPDATE invites SET uses = uses + 1 WHERE code = ?', inv.code);
      });
      broadcastServer(sid);
    }
    return serializeServer(sid, req.user.id);
  })
);

// ---------- Kanäle ----------

app.post(
  '/api/servers/:id/channels',
  auth,
  wrap(async (req) => {
    const sid = req.params.id;
    requireRole(sid, req.user.id, 'admin');
    const type = req.body.type === 'voice' ? 'voice' : 'text';
    const cid = createChannel(sid, channelName(req.body.name, type), type, str(req.body.topic, 300) || '');
    broadcastServer(sid);
    return { id: cid };
  })
);

app.patch(
  '/api/channels/:id',
  auth,
  wrap(async (req) => {
    const c = q.get('SELECT * FROM channels WHERE id = ?', req.params.id);
    if (!c) fail(404, 'channel_not_found');
    requireRole(c.server_id, req.user.id, 'admin');
    const name = req.body.name !== undefined ? channelName(req.body.name, c.type) : c.name;
    const topic = req.body.topic !== undefined ? str(req.body.topic, 300) ?? c.topic : c.topic;
    const position = Number.isInteger(req.body.position) ? req.body.position : c.position;
    q.run('UPDATE channels SET name = ?, topic = ?, position = ? WHERE id = ?', name, topic, position, c.id);
    broadcastServer(c.server_id);
  })
);

app.delete(
  '/api/channels/:id',
  auth,
  wrap(async (req) => {
    const c = q.get('SELECT * FROM channels WHERE id = ?', req.params.id);
    if (!c) fail(404, 'channel_not_found');
    requireRole(c.server_id, req.user.id, 'admin');
    q.tx(() => {
      q.run('DELETE FROM messages WHERE channel_id = ?', c.id);
      q.run('DELETE FROM channels WHERE id = ?', c.id);
    });
    broadcastServer(c.server_id);
  })
);

// ---------- Nachrichten ----------

app.get(
  '/api/channels/:id/messages',
  auth,
  wrap(async (req) => {
    resolveChannel(req.params.id, req.user.id);
    const limit = Math.min(100, Number(req.query.limit) || 50);
    const before = Number(req.query.before) || Number.MAX_SAFE_INTEGER;
    const rows = q.all('SELECT * FROM messages WHERE channel_id = ? AND created_at < ? ORDER BY created_at DESC LIMIT ?', req.params.id, before, limit);
    return rows.reverse().map(serializeMessage);
  })
);

app.post(
  '/api/channels/:id/messages',
  auth,
  wrap(async (req) => {
    const target = resolveChannel(req.params.id, req.user.id);
    if (target.kind === 'channel' && target.channel.type !== 'text') fail(400, 'not_text_channel');
    const content = str(req.body.content, 4000, 1);
    if (!content) fail(400, 'invalid_content');
    const replyTo = typeof req.body.replyTo === 'string' && q.get('SELECT 1 FROM messages WHERE id = ? AND channel_id = ?', req.body.replyTo, req.params.id) ? req.body.replyTo : null;
    const mid = id();
    q.run('INSERT INTO messages (id, channel_id, author_id, content, reply_to, created_at) VALUES (?, ?, ?, ?, ?, ?)', mid, req.params.id, req.user.id, content, replyTo, now());
    if (target.kind === 'dm') q.run('UPDATE dms SET last_activity = ? WHERE id = ?', now(), target.dm.id);
    const msg = serializeMessage(q.get('SELECT * FROM messages WHERE id = ?', mid));
    io.to(target.room).emit('message:new', msg);
    return msg;
  })
);

function ownMessage(messageId, userId, allowAdmin) {
  const m = q.get('SELECT * FROM messages WHERE id = ?', messageId);
  if (!m) fail(404, 'message_not_found');
  const target = resolveChannel(m.channel_id, userId);
  if (m.author_id !== userId) {
    if (!allowAdmin || target.kind !== 'channel') fail(403, 'missing_permission');
    requireRole(target.channel.server_id, userId, 'admin');
  }
  return { m, target };
}

app.patch(
  '/api/messages/:id',
  auth,
  wrap(async (req) => {
    const { m, target } = ownMessage(req.params.id, req.user.id, false);
    const content = str(req.body.content, 4000, 1);
    if (!content) fail(400, 'invalid_content');
    q.run('UPDATE messages SET content = ?, edited_at = ? WHERE id = ?', content, now(), m.id);
    const msg = serializeMessage(q.get('SELECT * FROM messages WHERE id = ?', m.id));
    io.to(target.room).emit('message:update', msg);
    return msg;
  })
);

app.delete(
  '/api/messages/:id',
  auth,
  wrap(async (req) => {
    const { m, target } = ownMessage(req.params.id, req.user.id, true);
    q.run('DELETE FROM messages WHERE id = ?', m.id);
    io.to(target.room).emit('message:delete', { id: m.id, channelId: m.channel_id });
  })
);

app.post(
  '/api/messages/:id/reactions',
  auth,
  wrap(async (req) => {
    const m = q.get('SELECT * FROM messages WHERE id = ?', req.params.id);
    if (!m) fail(404, 'message_not_found');
    const target = resolveChannel(m.channel_id, req.user.id);
    const icon = req.body.icon;
    if (!REACTION_ICONS.includes(icon)) fail(400, 'invalid_icon');
    const exists = q.get('SELECT 1 FROM reactions WHERE message_id = ? AND user_id = ? AND icon = ?', m.id, req.user.id, icon);
    if (exists) q.run('DELETE FROM reactions WHERE message_id = ? AND user_id = ? AND icon = ?', m.id, req.user.id, icon);
    else q.run('INSERT INTO reactions (message_id, user_id, icon) VALUES (?, ?, ?)', m.id, req.user.id, icon);
    const msg = serializeMessage(m);
    io.to(target.room).emit('message:update', msg);
    return msg;
  })
);

// ---------- Freunde ----------

const friendship = (a, b) => q.get('SELECT * FROM friendships WHERE user_id = ? AND friend_id = ?', a, b);

app.post(
  '/api/friends',
  auth,
  wrap(async (req) => {
    const target = req.body.userId ? getUser(req.body.userId) : q.get('SELECT * FROM users WHERE username = ?', str(req.body.username, 32, 1) || '');
    if (!target) fail(404, 'user_not_found');
    const me = req.user.id;
    if (target.id === me) fail(400, 'cannot_add_self');
    const existing = friendship(me, target.id);
    if (existing?.status === 'accepted') fail(409, 'already_friends');
    const reverse = friendship(target.id, me);
    if (reverse?.status === 'blocked') fail(403, 'blocked');
    // Wenn der andere schon angefragt hat, wird direkt angenommen.
    if (existing?.status === 'pending' && existing.requester_id === target.id) {
      q.run("UPDATE friendships SET status = 'accepted' WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)", me, target.id, target.id, me);
    } else if (!existing) {
      q.tx(() => {
        q.run("INSERT INTO friendships (user_id, friend_id, status, requester_id, created_at) VALUES (?, ?, 'pending', ?, ?)", me, target.id, me, now());
        q.run("INSERT OR REPLACE INTO friendships (user_id, friend_id, status, requester_id, created_at) VALUES (?, ?, 'pending', ?, ?)", target.id, me, me, now());
      });
    }
    pushFriends(me);
    pushFriends(target.id);
  })
);

app.post(
  '/api/friends/:userId/accept',
  auth,
  wrap(async (req) => {
    const f = friendship(req.user.id, req.params.userId);
    if (!f || f.status !== 'pending' || f.requester_id === req.user.id) fail(404, 'request_not_found');
    q.run("UPDATE friendships SET status = 'accepted', created_at = ? WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)", now(), req.user.id, f.friend_id, f.friend_id, req.user.id);
    pushFriends(req.user.id);
    pushFriends(f.friend_id);
  })
);

app.post(
  '/api/friends/:userId/block',
  auth,
  wrap(async (req) => {
    const other = getUser(req.params.userId);
    if (!other || other.id === req.user.id) fail(404, 'user_not_found');
    q.tx(() => {
      q.run('DELETE FROM friendships WHERE user_id = ? AND friend_id = ?', other.id, req.user.id);
      q.run("INSERT OR REPLACE INTO friendships (user_id, friend_id, status, requester_id, created_at) VALUES (?, ?, 'blocked', ?, ?)", req.user.id, other.id, req.user.id, now());
    });
    pushFriends(req.user.id);
    pushFriends(other.id);
  })
);

app.delete(
  '/api/friends/:userId',
  auth,
  wrap(async (req) => {
    const other = req.params.userId;
    const mine = friendship(req.user.id, other);
    q.run('DELETE FROM friendships WHERE user_id = ? AND friend_id = ?', req.user.id, other);
    // Eine Blockierung des anderen bleibt bestehen.
    if (mine?.status !== 'blocked') q.run("DELETE FROM friendships WHERE user_id = ? AND friend_id = ? AND status != 'blocked'", other, req.user.id);
    pushFriends(req.user.id);
    pushFriends(other);
  })
);

// ---------- Direktnachrichten & Gruppen ----------

app.post(
  '/api/dms',
  auth,
  wrap(async (req) => {
    const me = req.user.id;
    const others = [...new Set((Array.isArray(req.body.userIds) ? req.body.userIds : []).filter((u) => typeof u === 'string' && u !== me))];
    if (!others.length) fail(400, 'no_recipients');
    if (others.length > 9) fail(400, 'group_too_large');
    for (const o of others) {
      if (!getUser(o)) fail(404, 'user_not_found');
      if (friendship(o, me)?.status === 'blocked') fail(403, 'blocked');
    }
    const isGroup = others.length > 1 || req.body.group === true;
    if (!isGroup) {
      const existing = q.get(
        'SELECT d.id FROM dms d JOIN dm_members a ON a.dm_id = d.id AND a.user_id = ? JOIN dm_members b ON b.dm_id = d.id AND b.user_id = ? WHERE d.is_group = 0',
        me,
        others[0]
      );
      if (existing) return serializeDm(existing.id);
    }
    const dmId = id();
    q.tx(() => {
      q.run('INSERT INTO dms (id, is_group, name, owner_id, created_at, last_activity) VALUES (?, ?, ?, ?, ?, ?)', dmId, isGroup ? 1 : 0, isGroup ? str(req.body.name, 50) || null : null, me, now(), now());
      for (const u of [me, ...others]) q.run('INSERT INTO dm_members (dm_id, user_id) VALUES (?, ?)', dmId, u);
    });
    for (const u of [me, ...others]) io.in(`user:${u}`).socketsJoin(`dm:${dmId}`);
    broadcastDm(dmId);
    return serializeDm(dmId);
  })
);

app.patch(
  '/api/dms/:id',
  auth,
  wrap(async (req) => {
    const dm = q.get('SELECT * FROM dms WHERE id = ?', req.params.id);
    if (!dm || !isDmMember(dm.id, req.user.id)) fail(404, 'dm_not_found');
    if (!dm.is_group) fail(400, 'not_group');
    q.run('UPDATE dms SET name = ? WHERE id = ?', str(req.body.name, 50) || null, dm.id);
    broadcastDm(dm.id);
  })
);

app.post(
  '/api/dms/:id/members',
  auth,
  wrap(async (req) => {
    const dm = q.get('SELECT * FROM dms WHERE id = ?', req.params.id);
    if (!dm || !isDmMember(dm.id, req.user.id)) fail(404, 'dm_not_found');
    if (!dm.is_group) fail(400, 'not_group');
    const count = q.get('SELECT COUNT(*) AS c FROM dm_members WHERE dm_id = ?', dm.id).c;
    const ids = (Array.isArray(req.body.userIds) ? req.body.userIds : []).filter((u) => getUser(u));
    if (count + ids.length > 10) fail(400, 'group_too_large');
    for (const u of ids) {
      q.run('INSERT OR IGNORE INTO dm_members (dm_id, user_id) VALUES (?, ?)', dm.id, u);
      io.in(`user:${u}`).socketsJoin(`dm:${dm.id}`);
    }
    broadcastDm(dm.id);
  })
);

app.delete(
  '/api/dms/:id/members/:userId',
  auth,
  wrap(async (req) => {
    const dm = q.get('SELECT * FROM dms WHERE id = ?', req.params.id);
    if (!dm || !isDmMember(dm.id, req.user.id)) fail(404, 'dm_not_found');
    const target = req.params.userId;
    if (target !== req.user.id && dm.owner_id !== req.user.id) fail(403, 'missing_permission');
    if (!dm.is_group) {
      // 1:1-Unterhaltung nur für mich ausblenden geht nicht ohne Zusatztabelle – daher nicht erlaubt.
      fail(400, 'not_group');
    }
    q.run('DELETE FROM dm_members WHERE dm_id = ? AND user_id = ?', dm.id, target);
    emitUser(target, 'dm:remove', { id: dm.id });
    io.in(`user:${target}`).socketsLeave(`dm:${dm.id}`);
    const left = q.all('SELECT user_id FROM dm_members WHERE dm_id = ?', dm.id);
    if (!left.length) {
      q.run('DELETE FROM messages WHERE channel_id = ?', dm.id);
      q.run('DELETE FROM dms WHERE id = ?', dm.id);
    } else {
      if (dm.owner_id === target) q.run('UPDATE dms SET owner_id = ? WHERE id = ?', left[0].user_id, dm.id);
      broadcastDm(dm.id);
    }
  })
);

// ---------- Web-Client ausliefern (optional) ----------

const webDir = process.env.LODGE_WEB_DIR || path.join(__dirname, '..', '..', 'app', 'dist');
if (fs.existsSync(webDir)) {
  app.use(express.static(webDir));
  app.get(/^\/(?!api|socket\.io).*/, (_req, res) => res.sendFile(path.join(webDir, 'index.html')));
}

// ---------- Echtzeit ----------

// roomId (Sprachkanal-ID oder DM-ID) -> Map(socketId -> Teilnehmer)
const voiceRooms = new Map();

function voiceScope(roomId) {
  const c = q.get('SELECT server_id, type FROM channels WHERE id = ?', roomId);
  if (c) return c.type === 'voice' ? { room: `server:${c.server_id}`, serverId: c.server_id } : null;
  if (q.get('SELECT 1 FROM dms WHERE id = ?', roomId)) return { room: `dm:${roomId}`, dmId: roomId };
  return null;
}

function emitVoiceRoom(roomId) {
  const scope = voiceScope(roomId);
  const participants = [...(voiceRooms.get(roomId)?.values() || [])];
  if (scope) io.to(scope.room).emit('voice:room', { roomId, participants });
}

function leaveVoice(socket) {
  const roomId = socket.data.voiceRoom;
  if (!roomId) return;
  socket.data.voiceRoom = null;
  socket.leave(`voice:${roomId}`);
  const room = voiceRooms.get(roomId);
  if (room) {
    room.delete(socket.id);
    if (!room.size) voiceRooms.delete(roomId);
  }
  socket.to(`voice:${roomId}`).emit('voice:peer-left', { socketId: socket.id });
  emitVoiceRoom(roomId);
}

io.use((socket, next) => {
  try {
    const payload = jwt.verify(socket.handshake.auth?.token, JWT_SECRET);
    const user = getUser(payload.sub);
    if (!user) throw new Error('gone');
    socket.data.userId = user.id;
    next();
  } catch {
    next(new Error('unauthorized'));
  }
});

io.on('connection', (socket) => {
  const uid = socket.data.userId;
  socket.join(`user:${uid}`);
  for (const r of q.all('SELECT server_id FROM members WHERE user_id = ?', uid)) socket.join(`server:${r.server_id}`);
  for (const r of q.all('SELECT dm_id FROM dm_members WHERE user_id = ?', uid)) socket.join(`dm:${r.dm_id}`);

  const wasOnline = onlineSockets.get(uid) || 0;
  onlineSockets.set(uid, wasOnline + 1);
  if (!wasOnline) broadcastUser(uid);

  socket.on('typing', ({ channelId } = {}) => {
    try {
      const target = resolveChannel(channelId, uid);
      socket.to(target.room).emit('typing', { channelId, userId: uid });
    } catch {}
  });

  socket.on('voice:join', ({ roomId, state } = {}, ack) => {
    try {
      const scope = voiceScope(roomId);
      if (!scope) fail(404, 'channel_not_found');
      if (scope.serverId) requireMember(scope.serverId, uid);
      else if (!isDmMember(scope.dmId, uid)) fail(403, 'not_member');
      leaveVoice(socket);

      const room = voiceRooms.get(roomId) || new Map();
      voiceRooms.set(roomId, room);
      const wasEmpty = room.size === 0;
      const peers = [...room.values()];
      room.set(socket.id, {
        socketId: socket.id,
        userId: uid,
        muted: !!state?.muted,
        deafened: !!state?.deafened,
        video: false,
        screen: false,
        joinedAt: now(),
      });
      socket.data.voiceRoom = roomId;
      socket.join(`voice:${roomId}`);
      socket.to(`voice:${roomId}`).emit('voice:peer-joined', room.get(socket.id));
      emitVoiceRoom(roomId);

      // Anruf in einer DM/Gruppe: die anderen klingeln lassen.
      if (scope.dmId && wasEmpty) {
        const caller = publicUser(getUser(uid));
        for (const r of q.all('SELECT user_id FROM dm_members WHERE dm_id = ? AND user_id != ?', roomId, uid)) emitUser(r.user_id, 'call:ring', { dmId: roomId, caller });
      }
      ack?.({ ok: true, peers });
    } catch (err) {
      ack?.({ ok: false, error: err.code || 'server_error' });
    }
  });

  socket.on('voice:leave', () => leaveVoice(socket));

  socket.on('voice:state', (state = {}) => {
    const roomId = socket.data.voiceRoom;
    const p = roomId && voiceRooms.get(roomId)?.get(socket.id);
    if (!p) return;
    for (const k of ['muted', 'deafened', 'video', 'screen']) if (typeof state[k] === 'boolean') p[k] = state[k];
    emitVoiceRoom(roomId);
  });

  socket.on('voice:signal', ({ to, data } = {}) => {
    const roomId = socket.data.voiceRoom;
    if (!roomId || !voiceRooms.get(roomId)?.has(to)) return;
    io.to(to).emit('voice:signal', { from: socket.id, userId: uid, data });
  });

  socket.on('call:decline', ({ dmId } = {}) => {
    if (isDmMember(dmId, uid)) io.to(`dm:${dmId}`).emit('call:declined', { dmId, userId: uid });
  });

  socket.on('disconnect', () => {
    leaveVoice(socket);
    const left = (onlineSockets.get(uid) || 1) - 1;
    if (left <= 0) {
      onlineSockets.delete(uid);
      broadcastUser(uid);
    } else onlineSockets.set(uid, left);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  const nets = require('os').networkInterfaces();
  const ips = Object.values(nets)
    .flat()
    .filter((n) => n && n.family === 'IPv4' && !n.internal)
    .map((n) => n.address);
  console.log(`\n  Lodge-Server läuft auf Port ${PORT}`);
  console.log(`  Lokal:     http://localhost:${PORT}`);
  for (const ip of ips) console.log(`  Netzwerk:  http://${ip}:${PORT}`);
  console.log('');
});
