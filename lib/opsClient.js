/**
 * lib/opsClient.js — /ops status, quota estimates, doctor tips
 */
export function opsStatus() {
  const checks = {
    BOT_TOKEN: !!process.env.BOT_TOKEN,
    ADMIN_ID: !!process.env.ADMIN_ID,
    SUPABASE_URL: !!process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    GROQ_API_KEY: !!process.env.GROQ_API_KEY,
    GEMINI_API_KEY: !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY),
    GITHUB_TOKEN: !!(process.env.GITHUB_TOKEN || process.env.GH_TOKEN),
    GITHUB_REPO: !!(process.env.GITHUB_REPO || process.env.GH_REPO),
    VERCEL_TOKEN: !!process.env.VERCEL_TOKEN,
    VERCEL_PROJECT_ID: !!process.env.VERCEL_PROJECT_ID,
    CRON_SECRET: !!process.env.CRON_SECRET,
    HF_TOKEN: !!(process.env.HF_TOKEN || process.env.HUGGINGFACE_TOKEN),
  };
  const ok = Object.values(checks).filter(Boolean).length;
  const total = Object.keys(checks).length;
  return { ok: true, score: ok + '/' + total, checks };
}

export function opsQuotaHints() {
  return {
    ok: true,
    free_tier_notes: [
      'Groq: watch daily TPM — if 429, Gemini fallback should fire',
      'Gemini: free tier RPM limits — embed + chat share quota',
      'Vercel Hobby: ≤12 serverless functions, cron via external cron-job.org',
      'Supabase: 500MB DB free, 1GB storage — run /supa tables',
      'GitHub API: 5000 req/h authenticated',
    ],
  };
}

export function opsDoctor(status) {
  const tips = [];
  const c = status?.checks || {};
  if (!c.GROQ_API_KEY && !c.GEMINI_API_KEY) tips.push('No AI keys — add GROQ_API_KEY or GEMINI_API_KEY');
  if (c.GROQ_API_KEY && !c.GEMINI_API_KEY) tips.push('Add GEMINI_API_KEY as fallback when Groq hits 429');
  if (!c.GITHUB_TOKEN) tips.push('Add GITHUB_TOKEN (repo scope) to unlock /git');
  if (!c.VERCEL_TOKEN) tips.push('Add VERCEL_TOKEN to unlock /vercel deploys');
  if (!c.SUPABASE_SERVICE_ROLE) tips.push('SERVICE_ROLE needed for /supa admin reads');
  if (!c.CRON_SECRET) tips.push('Set CRON_SECRET for secure /api/cron jobs');
  if (!tips.length) tips.push('Core env looks healthy. Run /ops status weekly.');
  return { ok: true, tips };
}

export default { opsStatus, opsQuotaHints, opsDoctor };
