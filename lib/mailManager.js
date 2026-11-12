// Dashboard Voice — reuse ttsManager + optional signed URL via vault
import * as vault from './vaultManager.js';

export async function speakForDashboard(text) {
  const tts = await import('./ttsManager.js');
  const speak = tts.speakText || tts.speakBriefing || tts.synthesizeSpeech;
  if (typeof speak !== 'function') {
    return { ok: false, error: 'ttsManager missing speak function' };
  }
  const r = await speak(String(text || '').slice(0, 900), 'female');
  if (!r?.ok || !r.buffer) {
    return { ok: false, error: r?.error || 'TTS failed' };
  }

  // Prefer upload to vault for Play URL
  try {
    if (vault.isConfigured()) {
      const path = `tts/dash_${Date.now()}.ogg`;
      const buf = Buffer.isBuffer(r.buffer) ? r.buffer : Buffer.from(r.buffer);
      await vault.uploadBuffer(path, buf, r.contentType || 'audio/ogg');
      const url = await vault.getSignedUrl(path, 3600);
      return {
        ok: true,
        provider: r.provider || 'tts',
        path,
        url,
        preview: r.preview || String(text).slice(0, 120),
      };
    }
  } catch (e) {
    return {
      ok: true,
      provider: r.provider || 'tts',
      note: 'audio generated but vault upload failed: ' + (e.message || e),
      preview: String(text).slice(0, 120),
    };
  }

  return {
    ok: true,
    provider: r.provider || 'tts',
    note: 'audio ok (no vault URL)',
    preview: String(text).slice(0, 120),
  };
}
