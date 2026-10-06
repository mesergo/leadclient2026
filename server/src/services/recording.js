// Shared call-recording serving + signed public links. Keeps Maskyoo hidden:
// the recording is always streamed through our server, never a Maskyoo URL.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('../config');
const { query } = require('../db/pool');
const maskyoo = require('./maskyoo');

const REC_DIR = path.join(config.uploadDir, '.recordings');

// A short HMAC that lets a customer's webhook link download a recording without
// logging in (and without ever seeing Maskyoo). Bound to the lead id + our secret.
function sign(id) {
  return crypto.createHmac('sha256', config.jwt.secret).update('rec:' + id).digest('hex').slice(0, 24);
}
function verifySig(id, sig) {
  if (!sig) return false;
  const expected = sign(id);
  const a = Buffer.from(String(sig)); const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function publicUrl(id) {
  if (!config.appUrl) return null;
  return `${config.appUrl}/api/public/recording/${id}?sig=${sign(id)}`;
}

// Stream the recording for a lead row ({id, recording_url}) to res. Handles the
// local cache, a Maskyoo call-UUID (fetched via REST then cached), and legacy URLs.
async function serve(res, lead) {
  if (!lead || !lead.recording_url) return res.status(404).json({ error: 'no_recording' });

  if (lead.recording_url.startsWith('local:')) {
    const fp = path.join(REC_DIR, path.basename(lead.recording_url.slice(6)));
    if (fs.existsSync(fp)) return res.sendFile(fp);
    return res.status(404).json({ error: 'file_missing' });
  }

  if (lead.recording_url.startsWith('maskyoo-uuid:')) {
    const uuid = lead.recording_url.slice('maskyoo-uuid:'.length);
    const buf = await maskyoo.getRecording(uuid);
    if (!buf) return res.status(404).json({ error: 'recording_not_ready' });
    try {
      fs.mkdirSync(REC_DIR, { recursive: true });
      const fname = `lead-${lead.id}.wav`;
      fs.writeFileSync(path.join(REC_DIR, fname), buf);
      await query('UPDATE leads SET recording_url = ? WHERE id = ?', [`local:${fname}`, lead.id]);
    } catch (e) { /* still serve what we fetched */ }
    res.setHeader('Content-Type', 'audio/wav');
    res.setHeader('Content-Disposition', `inline; filename="recording-${lead.id}.wav"`);
    return res.send(buf);
  }

  if (!/^https?:\/\//i.test(lead.recording_url)) return res.status(404).json({ error: 'no_recording' });
  try {
    const r = await fetch(lead.recording_url, { headers: config.maskyoo.token ? { Authorization: `Bearer ${config.maskyoo.token}` } : {} });
    if (!r.ok) return res.status(502).json({ error: `maskyoo_${r.status}` });
    const ct = r.headers.get('content-type') || 'audio/mpeg';
    if (!/audio|octet-stream|mpeg|wav|mp4/i.test(ct)) return res.status(502).json({ error: 'not_audio', ct });
    const ext = /wav/i.test(ct) ? 'wav' : /mp4|m4a|aac/i.test(ct) ? 'm4a' : 'mp3';
    const buf = Buffer.from(await r.arrayBuffer());
    try {
      fs.mkdirSync(REC_DIR, { recursive: true });
      const fname = `lead-${lead.id}.${ext}`;
      fs.writeFileSync(path.join(REC_DIR, fname), buf);
      await query('UPDATE leads SET recording_url = ? WHERE id = ?', [`local:${fname}`, lead.id]);
    } catch (e) { /* still serve what we fetched */ }
    res.setHeader('Content-Type', ct);
    res.setHeader('Content-Disposition', `inline; filename="recording-${lead.id}.${ext}"`);
    res.send(buf);
  } catch (e) { res.status(502).json({ error: 'fetch_failed' }); }
}

module.exports = { serve, sign, verifySig, publicUrl, REC_DIR };
