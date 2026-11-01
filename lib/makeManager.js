// lib/makeManager.js
// Agent-20 — Make.com Manager (Webhook Mode - Free Plan Compatible)
// Version: 2026-11-02

const MAKE_WEBHOOK_URL = process.env.MAKE_WEBHOOK_URL || '';
const MAKE_WEBHOOK_SECRET = process.env.MAKE_WEBHOOK_SECRET || '';

// Friendly name → optional override webhook (leave empty to use master URL)
const SCENARIO_MAP = {
  // Example (uncomment and set if you want named webhooks later):
  // keepalive: process.env.MAKE_WEBHOOK_KEEPALIVE || '',
  // digest: process.env.MAKE_WEBHOOK_DIGEST || '',
};

function isConfigured() {
  return Boolean(MAKE_WEBHOOK_URL && MAKE_WEBHOOK_URL.startsWith('http'));
}

async function triggerScenario(scenarioKey = 'default', extra = {}) {
  if (!isConfigured()) {
    throw new Error('MAKE_WEBHOOK_URL is not set. Add it in Vercel Env Vars.');
  }

  const targetUrl = SCENARIO_MAP[scenarioKey] || MAKE_WEBHOOK_URL;

  const payload = {
    action: 'run',
    scenario: scenarioKey || 'default',
    source: 'pasiya-bot',
    timestamp: new Date().toISOString(),
    ...extra,
  };

  const headers = {
    'Content-Type': 'application/json',
    'User-Agent': 'PasiyaBot-Agent20/1.0',
  };

  if (MAKE_WEBHOOK_SECRET) {
    headers['X-Webhook-Secret'] = MAKE_WEBHOOK_SECRET;
  }

  const res = await fetch(targetUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  const text = await res.text().catch(() => '');

  if (!res.ok) {
    throw new Error(`Webhook failed (${res.status}): ${text.slice(0, 200)}`);
  }

  return {
    ok: true,
    status: res.status,
    scenario: scenarioKey,
    response: text.slice(0, 300) || 'accepted',
  };
}

function listConfigured() {
  const keys = Object.keys(SCENARIO_MAP).filter(k => SCENARIO_MAP[k]);
  if (keys.length === 0) {
    return ['default (master webhook)'];
  }
  return keys;
}

export {
  isConfigured,
  triggerScenario,
  listConfigured,
};
