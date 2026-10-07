/**
 * api/fs.js — PasiyaOS filesystem API for Mini App
 * POST JSON: { initData, action, path, content }
 * actions: list | read | write | mkdir | rm | tree | df | seed
 *
 * Auth: Telegram WebApp initData HMAC (preferred)
 * Fallback: x-os-secret === process.env.OS_FS_SECRET (founder tools)
 */
import { validateInitData } from '../lib/tgWebAppAuth.js';
import * as fs from '../lib/pasiyaFs.js';

const BOT_TOKEN = process.env.BOT_TOKEN || '';
const ADMIN_ID = String(process.env.ADMIN_ID || '').trim();
const OS_FS_SECRET = String(process.env.OS_FS_SECRET || '').trim();

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS, GET');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-os-secret');
}

function resolveUser(req, body) {
  const secret = req.headers['x-os-secret'] || body.secret || '';
  if (OS_FS_SECRET && secret && secret === OS_FS_SECRET) {
    return { ok: true, userId: ADMIN_ID || 'founder', via: 'secret' };
  }
  const initData = body.initData || '';
  const v = validateInitData(initData, BOT_TOKEN);
  if (!v.ok) return { ok: false, error: 'auth: ' + (v.error || 'fail') };
  const uid = v.user?.id != null ? String(v.user.id) : '';
  if (!uid) return { ok: false, error: 'no user in initData' };
  // STEP 2: founder-only write disk (same as /fs bot gate)
  if (ADMIN_ID && uid !== ADMIN_ID) {
    return { ok: false, error: 'founder-only disk in STEP 2' };
  }
  return { ok: true, userId: uid, via: 'telegram' };
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method === 'GET') {
    res.status(200).json({ ok: true, service: 'pasiya-fs', version: 'S4' });
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'POST only' });
    return;
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    const auth = resolveUser(req, body);
    if (!auth.ok) {
      res.status(401).json({ ok: false, error: auth.error });
      return;
    }
    const userId = auth.userId;
    const action = String(body.action || 'list').toLowerCase();
    const path = body.path || '/';
    const content = body.content;

    await fs.ensureUserSeed(userId);

    if (action === 'seed') {
      res.status(200).json(await fs.ensureUserSeed(userId));
      return;
    }
    if (action === 'list' || action === 'ls') {
      res.status(200).json(await fs.fsList(userId, path));
      return;
    }
    if (action === 'read' || action === 'cat') {
      res.status(200).json(await fs.fsRead(userId, path));
      return;
    }
    if (action === 'write') {
      res.status(200).json(await fs.fsWrite(userId, path, content ?? ''));
      return;
    }
    if (action === 'mkdir') {
      res.status(200).json(await fs.fsMkdir(userId, path));
      return;
    }
    if (action === 'rm' || action === 'delete') {
      res.status(200).json(await fs.fsRm(userId, path, !!body.hard));
      return;
    }
    if (action === 'tree') {
      res.status(200).json(await fs.fsTree(userId, path, body.depth || 4));
      return;
    }
    if (action === 'df' || action === 'quota') {
      res.status(200).json(await fs.fsQuotaUsed(userId));
      return;
    }
    if (action === 'stat') {
      res.status(200).json(await fs.fsStat(userId, path));
      return;
    }

    if (action === 'shell') {
      // body.cwd + body.line → { cwd, output }
      const cwd0 = fs.normalizePath(body.cwd || '/');
      const line = String(body.line || '').trim();
      if (!line) {
        res.status(200).json({ ok: true, cwd: cwd0, output: '' });
        return;
      }
      const parts = line.match(/(?:[^\s"]+|"[^"]*")+/g) || [];
      const argv = parts.map((p) => p.replace(/^"|"$/g, ''));
      const cmd = (argv[0] || '').toLowerCase();
      const arg1 = argv[1] || '';
      const resolve = (p) => {
        if (!p || p === '.') return cwd0;
        if (p.startsWith('/')) return fs.normalizePath(p);
        if (cwd0 === '/') return fs.normalizePath('/' + p);
        return fs.normalizePath(cwd0 + '/' + p);
      };
      let cwd = cwd0;
      let output = '';
      try {
        if (cmd === 'help') {
          output = 'ls cd pwd cat mkdir rm touch echo tree df clear help';
        } else if (cmd === 'pwd') {
          output = cwd0;
        } else if (cmd === 'cd') {
          const dest = resolve(arg1 || '/');
          const st = await fs.fsStat(userId, dest);
          if (!st.ok || st.stat?.type !== 'dir') {
            res.status(200).json({ ok: true, cwd: cwd0, output: 'cd: not a directory: ' + dest });
            return;
          }
          cwd = dest;
          output = '';
        } else if (cmd === 'ls' || cmd === 'dir') {
          const target = resolve(arg1 || '.');
          const r = await fs.fsList(userId, target);
          if (!r.ok) output = r.error;
          else {
            output = (r.entries || [])
              .map((e) => (e.type === 'dir' ? '📁 ' : '📄 ') + e.path.split('/').filter(Boolean).pop())
              .join('
') || '(empty)';
          }
        } else if (cmd === 'cat') {
          if (!arg1) output = 'cat: missing file';
          else {
            const r = await fs.fsRead(userId, resolve(arg1));
            output = r.ok ? r.content : r.error;
          }
        } else if (cmd === 'mkdir') {
          if (!arg1) output = 'mkdir: missing operand';
          else {
            const r = await fs.fsMkdir(userId, resolve(arg1));
            output = r.ok ? '' : r.error;
          }
        } else if (cmd === 'rm' || cmd === 'del') {
          if (!arg1) output = 'rm: missing operand';
          else {
            const r = await fs.fsRm(userId, resolve(arg1), argv.includes('-f') || argv.includes('--hard'));
            output = r.ok ? '' : r.error;
          }
        } else if (cmd === 'touch') {
          if (!arg1) output = 'touch: missing file';
          else {
            const p = resolve(arg1);
            const existing = await fs.fsRead(userId, p);
            const r = await fs.fsWrite(userId, p, existing.ok ? existing.content : '');
            output = r.ok ? '' : r.error;
          }
        } else if (cmd === 'echo') {
          // Support: echo hello
          //          echo hello > /path/file
          //          echo hello >> /path/file
          const full = line.replace(/^echo\s+/i, '').trim();
          let redir = null;
          let append = false;
          let textPart = full;
          const idxAppend = full.indexOf('>>');
          const idxWrite = full.indexOf('>');
          if (idxAppend >= 0) {
            append = true;
            textPart = full.slice(0, idxAppend).trim();
            redir = full.slice(idxAppend + 2).trim();
          } else if (idxWrite >= 0) {
            textPart = full.slice(0, idxWrite).trim();
            redir = full.slice(idxWrite + 1).trim();
          }
          textPart = textPart.replace(/^["']|["']$/g, '');
          if (redir) {
            // strip quotes around path
            redir = redir.replace(/^["']|["']$/g, '').split(/\s+/)[0];
            const p = resolve(redir);
            if (append) {
              const prev = await fs.fsRead(userId, p);
              const r = await fs.fsWrite(userId, p, (prev.ok ? prev.content : '') + textPart + '\n');
              output = r.ok ? 'wrote ' + p : r.error;
            } else {
              const r = await fs.fsWrite(userId, p, textPart + '\n');
              output = r.ok ? 'wrote ' + p : r.error;
            }
          } else {
            output = textPart;
          }
        } else if (cmd === 'tree') {
          const r = await fs.fsTree(userId, resolve(arg1 || '.'), 4);
          output = r.ok ? r.tree : r.error;
        } else if (cmd === 'df' || cmd === 'quota') {
          const r = await fs.fsQuotaUsed(userId);
          output = r.ok ? 'used ' + r.used + ' / ' + r.max + ' bytes (left ' + r.left + ')' : r.error;
        } else if (cmd === 'clear') {
          output = '__CLEAR__';
        } else {
          output = cmd + ': command not found. Try help';
        }
      } catch (e) {
        output = String(e.message || e);
      }
      res.status(200).json({ ok: true, cwd, output });
      return;
    }


    res.status(400).json({ ok: false, error: 'unknown action' });
  } catch (e) {
    console.error('api/fs', e);
    res.status(200).json({ ok: false, error: String(e.message || e) });
  }
}
