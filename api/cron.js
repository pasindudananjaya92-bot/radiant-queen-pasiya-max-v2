// SNIPPET ONLY — merge into api/cron.js (do not deploy as standalone function)
//
// if (job === 'swarmdigest' || job === 'swarm_digest' || job === 'swarm') {
//   const mod = await import('../lib/swarmScheduler.js');
//   const r = await mod.jobSwarmCron();
//   res.status(200).json(r);
//   return;
// }
