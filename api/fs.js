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
    res.status(200).json({ ok: true, service: 'pasiya-fs', version: 'S2' });
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
    res.status(400).json({ ok: false, error: 'unknown action' });
  } catch (e) {
    console.error('api/fs', e);
    res.status(200).json({ ok: false, error: String(e.message || e) });
  }
}
