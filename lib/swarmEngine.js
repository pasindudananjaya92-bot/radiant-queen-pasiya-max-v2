/**
 * lib/swarmEngine.js — parallel AI workers in ONE function (Promise.all)
 * Avoids exploding serverless function count
 */
export async function swarmRun(tasks, generateReply, ctx) {
  const list = (tasks || []).slice(0, 6); // free-tier safe
  const results = await Promise.all(
    list.map(async (t, i) => {
      try {
        const out = await generateReply(String(t.prompt || t), ctx);
        return { i, ok: true, out: String(out || '').slice(0, 800) };
      } catch (e) {
        return { i, ok: false, error: String(e.message || e) };
      }
    })
  );
  return { ok: true, results };
}

export function swarmAggregatePrompt(results) {
  return (
    'Aggregate these parallel agent results into one clear briefing with bullets and a final recommendation.\n\n' +
    results
      .map((r, i) => 'Agent ' + (i + 1) + ':\n' + (r.out || r.error || ''))
      .join('\n\n')
      .slice(0, 6000)
  );
}

export default { swarmRun, swarmAggregatePrompt };
