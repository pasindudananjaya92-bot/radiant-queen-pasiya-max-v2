/**
 * api/fs.js — PasiyaOS FS API (always JSON, Node runtime)
 * POST { initData, action, path, content, cwd, line }
 */
export const config = { runtime: 'nodejs', maxDuration: 30 };

import { validateInitData } from '../lib/tgWebAppAuth.js';
import * as vfs from '../lib/pasiyaFs.js';

const BOT_TOKEN = process.env.BOT_TOKEN || '';
const ADMIN_ID = String(process.env.ADMIN_ID || '').trim();
const OS_FS_SECRET = String(process.env.OS_FS_SECRET || '').trim();

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-os-secret');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
}

function json(res, status, obj) {
  cors(res);
  res.statusCode = status;
  res.end(JSON.stringify(obj));
}

function parseBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body || '{}');
    } catch (_) {
      return {};
    }
  }
  return {};
}

function resolveUser(req, body) {
  const secret = String(req.headers['x-os-secret'] || body.secret || '').trim();
  if (OS_FS_SECRET && secret && secret === OS_FS_SECRET) {
    return { ok: true, userId: ADMIN_ID || 'founder', via: 'secret' };
  }
  const v = validateInitData(body.initData || '', BOT_TOKEN);
  if (!v.ok) return { ok: false, error: v.error || 'auth failed' };
  const uid = v.user && v.user.id != null ? String(v.user.id) : '';
  if (!uid) return { ok: false, error: 'no user in initData' };
  if (ADMIN_ID && uid !== ADMIN_ID) {
    return { ok: false, error: 'founder-only disk (ADMIN_ID mismatch)' };
  }
  return { ok: true, userId: uid, via: 'telegram' };
}

function resolvePath(cwd, p) {
  const c = vfs.normalizePath(cwd || '/');
  if (!p || p === '.') return c;
  if (String(p).startsWith('/')) return vfs.normalizePath(p);
  if (c === '/') return vfs.normalizePath('/' + p);
  return vfs.normalizePath(c + '/' + p);
}

async function runShell(userId, cwd0, line) {
  const cwdStart = vfs.normalizePath(cwd0 || '/');
  const raw = String(line || '').trim();
  if (!raw) return { ok: true, cwd: cwdStart, output: '' };

  // tokenize respecting simple quotes
  const parts = raw.match(/(?:[^\s"]+|"[^"]*")+/g) || [];
  const argv = parts.map((p) => p.replace(/^"|"$/g, ''));
  const cmd = String(argv[0] || '').toLowerCase();
  const arg1 = argv[1] || '';
  let cwd = cwdStart;
  let output = '';

  if (cmd === 'help') {
    output = 'ls cd pwd cat mkdir rm touch tree df clear help\necho text > /path/file\necho text >> /path/file';
  } else if (cmd === 'pwd') {
    output = cwdStart;
  } else if (cmd === 'cd') {
    const dest = resolvePath(cwdStart, arg1 || '/');
    const st = await vfs.fsStat(userId, dest);
    if (!st.ok || !st.stat || st.stat.type !== 'dir') {
      output = 'cd: not a directory: ' + dest;
    } else {
      cwd = dest;
      output = '';
    }
  } else if (cmd === 'ls' || cmd === 'dir') {
    const target = resolvePath(cwdStart, arg1 || '.');
    const r = await vfs.fsList(userId, target);
    if (!r.ok) output = r.error || 'ls failed';
    else {
      const ents = r.entries || [];
      output =
        ents
          .map((e) => {
            const name = String(e.path).split('/').filter(Boolean).pop() || e.path;
            return (e.type === 'dir' ? '📁 ' : '📄 ') + name;
          })
          .join('\n') || '(empty)';
    }
  } else if (cmd === 'cat') {
    if (!arg1) output = 'cat: missing file';
    else {
      const r = await vfs.fsRead(userId, resolvePath(cwdStart, arg1));
      output = r.ok ? String(r.content || '') : r.error || 'not found';
    }
  } else if (cmd === 'mkdir') {
    if (!arg1) output = 'mkdir: missing operand';
    else {
      const r = await vfs.fsMkdir(userId, resolvePath(cwdStart, arg1));
      output = r.ok ? 'ok ' + r.path : r.error || 'mkdir failed';
    }
  } else if (cmd === 'rm' || cmd === 'del') {
    if (!arg1) output = 'rm: missing operand';
    else {
      const hard = argv.includes('-f') || argv.includes('--hard');
      const r = await vfs.fsRm(userId, resolvePath(cwdStart, arg1), hard);
      output = r.ok ? 'removed' : r.error || 'rm failed';
    }
  } else if (cmd === 'touch') {
    if (!arg1) output = 'touch: missing file';
    else {
      const p = resolvePath(cwdStart, arg1);
      const existing = await vfs.fsRead(userId, p);
      const r = await vfs.fsWrite(userId, p, existing.ok ? existing.content : '');
      output = r.ok ? 'ok ' + p : r.error || 'touch failed';
    }
  } else if (cmd === 'echo') {
    // CRITICAL: robust redirect parse (no fragile regex flags)
    const full = raw.replace(/^echo\s+/i, '').trim();
    let append = false;
    let textPart = full;
    let redir = '';
    const ia = full.indexOf('>>');
    const iw = full.indexOf('>');
    if (ia >= 0) {
      append = true;
      textPart = full.slice(0, ia).trim();
      redir = full.slice(ia + 2).trim();
    } else if (iw >= 0) {
      textPart = full.slice(0, iw).trim();
      redir = full.slice(iw + 1).trim();
    }
    textPart = textPart.replace(/^["']|["']$/g, '');
    if (redir) {
      redir = redir.replace(/^["']|["']$/g, '').split(/\s+/)[0];
      const p = resolvePath(cwdStart, redir);
      let body = textPart + '\n';
      if (append) {
        const prev = await vfs.fsRead(userId, p);
        body = (prev.ok ? String(prev.content || '') : '') + textPart + '\n';
      }
      const r = await vfs.fsWrite(userId, p, body);
      output = r.ok ? 'wrote ' + p + ' (' + r.size + 'b)' : r.error || 'write failed';
    } else {
      output = textPart;
    }
  } else if (cmd === 'tree') {
    const r = await vfs.fsTree(userId, resolvePath(cwdStart, arg1 || '.'), 4);
    output = r.ok ? r.tree : r.error || 'tree failed';
  } else if (cmd === 'df' || cmd === 'quota') {
    const r = await vfs.fsQuotaUsed(userId);
    output = r.ok
      ? 'used ' + r.used + ' / ' + r.max + ' bytes (left ' + r.left + ')'
      : r.error || 'df failed';
  } else if (cmd === 'clear') {
    output = '__CLEAR__';
  } else {
    output = cmd + ': command not found — try help';
  }

  return { ok: true, cwd, output };
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method === 'GET') {
    json(res, 200, {
      ok: true,
      service: 'pasiya-fs',
      version: 'S5-S9',
      hasBotToken: Boolean(BOT_TOKEN),
      hasAdmin: Boolean(ADMIN_ID),
    });
    return;
  }

  if (req.method !== 'POST') {
    json(res, 405, { ok: false, error: 'POST only' });
    return;
  }

  try {
    const body = parseBody(req);
    const auth = resolveUser(req, body);
    if (!auth.ok) {
      json(res, 200, { ok: false, error: auth.error });
      return;
    }
    const userId = auth.userId;
    const action = String(body.action || 'list').toLowerCase().trim();
    const path = body.path || '/';

    // seed before mutating ops
    try {
      await vfs.ensureUserSeed(userId);
    } catch (e) {
      json(res, 200, { ok: false, error: 'seed: ' + String(e.message || e) });
      return;
    }

    if (action === 'seed') {
      json(res, 200, await vfs.ensureUserSeed(userId));
      return;
    }
    if (action === 'list' || action === 'ls') {
      json(res, 200, await vfs.fsList(userId, path));
      return;
    }
    if (action === 'read' || action === 'cat') {
      json(res, 200, await vfs.fsRead(userId, path));
      return;
    }
    if (action === 'write') {
      const r = await vfs.fsWrite(userId, path, body.content ?? '');
      json(res, 200, r);
      return;
    }
    if (action === 'mkdir') {
      json(res, 200, await vfs.fsMkdir(userId, path));
      return;
    }
    if (action === 'rm' || action === 'delete') {
      json(res, 200, await vfs.fsRm(userId, path, !!body.hard));
      return;
    }
    if (action === 'tree') {
      json(res, 200, await vfs.fsTree(userId, path, body.depth || 4));
      return;
    }
    if (action === 'df' || action === 'quota') {
      json(res, 200, await vfs.fsQuotaUsed(userId));
      return;
    }
    if (action === 'stat') {
      json(res, 200, await vfs.fsStat(userId, path));
      return;
    }
    if (action === 'shell') {
      const out = await runShell(userId, body.cwd || '/', body.line || '');
      json(res, 200, out);
      return;
    }

    
    if (action === 'httpget') {
      // Safe text fetch for Mini Browser (founder disk API already auth'd)
      const url = String(body.url || '').trim();
      if (!/^https:\/\//i.test(url)) {
        json(res, 200, { ok: false, error: 'only https URLs allowed' });
        return;
      }
      try {
        const ac = new AbortController();
        const timer = setTimeout(() => ac.abort(), 12000);
        const r = await fetch(url, {
          signal: ac.signal,
          headers: { 'User-Agent': 'PasiyaOS-Browser/1.0', Accept: 'text/html,text/plain,application/json' },
          redirect: 'follow',
        });
        clearTimeout(timer);
        const ct = r.headers.get('content-type') || '';
        let text = await r.text();
        if (text.length > 200000) text = text.slice(0, 200000) + '\n…[truncated]';
        json(res, 200, {
          ok: true,
          status: r.status,
          contentType: ct,
          url: r.url,
          text,
        });
      } catch (e) {
        json(res, 200, { ok: false, error: 'fetch: ' + String(e.message || e) });
      }
      return;
    }

json(res, 200, { ok: false, error: 'unknown action: ' + action });
  } catch (e) {
    console.error('api/fs fatal', e);
    try {
      json(res, 200, { ok: false, error: 'server: ' + String(e.message || e) });
    } catch (_) {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ ok: false, error: 'fatal' }));
    }
  }
}
