import { createClient } from '@supabase/supabase-js';

function sb() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

function uid() {
  return String(process.env.ADMIN_ID || process.env.FOUNDER_ID || 'founder')
    .split(/[\s,]+/)
    .filter(Boolean)[0] || 'founder';
}

export async function enqueueJob(type, input = {}) {
  const client = sb();
  if (!client) throw new Error('Supabase not configured');
  const { data, error } = await client
    .from('platform_jobs')
    .insert({
      user_id: uid(),
      type: String(type).slice(0, 64),
      status: 'queued',
      input,
      updated_at: new Date().toISOString(),
    })
    .select('id, type, status, created_at')
    .single();
  if (error) throw new Error(error.message);
  await emitEvent('job.enqueued', { job_id: data.id, type: data.type });
  return data;
}

export async function getJob(id) {
  const client = sb();
  if (!client) throw new Error('Supabase not configured');
  const { data, error } = await client.from('platform_jobs').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function listJobs(limit = 20) {
  const client = sb();
  if (!client) throw new Error('Supabase not configured');
  const { data, error } = await client
    .from('platform_jobs')
    .select('id, type, status, error, created_at, updated_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data || [];
}

export async function emitEvent(type, payload = {}) {
  const client = sb();
  if (!client) return;
  try {
    await client.from('platform_events').insert({
      user_id: uid(),
      type: String(type).slice(0, 80),
      payload,
    });
  } catch (_) {}
}

export async function listEvents(limit = 30) {
  const client = sb();
  if (!client) return [];
  const { data } = await client
    .from('platform_events')
    .select('id, type, payload, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  return data || [];
}
