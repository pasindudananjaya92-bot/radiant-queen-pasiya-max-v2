/**
 * GET /api/canvas?id=xxx  OR  rewrite /canvas/:id → here
 * Fetches public/canvas/<id>/index.html from GitHub and returns HTML.
 * Bypasses Vercel static public/ 404 when project is API-heavy.
 */
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const GITHUB_REPO =
  process.env.GITHUB_REPO || 'pasindudananjaya92-bot/radiant-queen-pasiya-max-v2';
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main';

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
}

export default async function handler(req, res) {
  try {
    if (req.method === 'OPTIONS') {
      cors(res);
      return res.status(204).end();
    }
    const id = String(req.query?.id || '')
      .replace(/[^a-zA-Z0-9_-]/g, '')
      .slice(0, 40);
    if (!id) {
      cors(res);
      return res.status(400).send('Missing id. Use /api/canvas?id=...');
    }
    const path = `public/canvas/${id}/index.html`;
    const [owner, repo] = String(GITHUB_REPO).split('/');
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${encodeURIComponent(GITHUB_BRANCH)}`;
    const headers = {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'pasiya-canvas-api',
    };
    if (GITHUB_TOKEN) headers.Authorization = 'Bearer ' + GITHUB_TOKEN;

    const gh = await fetch(url, { headers });
    if (!gh.ok) {
      cors(res);
      return res
        .status(404)
        .send(
          `Canvas not found on GitHub (${gh.status}). path=${path} branch=${GITHUB_BRANCH}`
        );
    }
    const j = await gh.json();
    const html = Buffer.from(j.content || '', 'base64').toString('utf8');
    cors(res);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(html);
  } catch (e) {
    cors(res);
    return res.status(500).send('canvas error: ' + String(e.message || e));
  }
}
