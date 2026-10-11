// Automatic lead assignment per channel (round robin).
// Active when the company has "lead distribution" on and the channel lists agents
// (services.distribute_leads). A returning caller goes back to the agent who already
// handled that phone (if still on the channel's list); otherwise the next agent in
// turn gets the lead. The turn pointer (services.distribute_last_user_id) is advanced
// under a row lock, so simultaneous leads don't land on the same agent.
const { query, getPool } = require('../db/pool');

const parseIds = (raw) => {
  try { const a = JSON.parse(raw || '[]'); return Array.isArray(a) ? a.map(Number).filter(Boolean) : []; } catch { return []; }
};

// The channel's eligible agents (active users of the company), ascending by id.
async function eligibleAgents(companyId, ids) {
  if (!ids.length) return [];
  const rows = await query(
    `SELECT id FROM users WHERE company_id = ? AND is_active = 1 AND role IN ('company_admin', 'company_user')
       AND id IN (${ids.map(() => '?').join(',')}) ORDER BY id`, [companyId, ...ids]);
  return rows.map((r) => r.id);
}

// next agent after `lastId` in the (sorted) list, wrapping around
const nextAfter = (list, lastId) => list.find((id) => id > (lastId || 0)) || list[0];

async function roundRobin(serviceId, agents) {
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.execute('SELECT distribute_last_user_id FROM services WHERE id = ? FOR UPDATE', [serviceId]);
    const pick = nextAfter(agents, rows[0] && rows[0].distribute_last_user_id);
    await conn.execute('UPDATE services SET distribute_last_user_id = ? WHERE id = ?', [pick, serviceId]);
    await conn.commit();
    return pick;
  } catch (e) {
    try { await conn.rollback(); } catch { /* ignore */ }
    throw e;
  } finally { conn.release(); }
}

// Assign a just-created lead. `agentId` forces a specific agent (e.g. the agent who
// placed an outgoing call). Returns the assigned user id, or null (left "general").
async function assignLead({ leadId, companyId, serviceId, phone, agentId = null }) {
  try {
    let pick = null;
    if (agentId) {
      const u = await query("SELECT id FROM users WHERE id = ? AND company_id = ? AND is_active = 1", [agentId, companyId]);
      pick = u[0] ? u[0].id : null;
    } else {
      if (!serviceId) return null;
      const r = await query(
        `SELECT s.distribute_leads, c.leads_distribution_enabled FROM services s JOIN companies c ON c.id = s.company_id
          WHERE s.id = ? AND s.company_id = ?`, [serviceId, companyId]);
      if (!r[0] || !Number(r[0].leads_distribution_enabled)) return null;
      const agents = await eligibleAgents(companyId, parseIds(r[0].distribute_leads));
      if (!agents.length) return null;
      // returning caller -> the agent who already handled this phone, if still eligible
      const key = String(phone || '').replace(/\D/g, '').slice(-9);
      if (key.length >= 7) {
        const prev = await query(
          `SELECT current_agent_id FROM leads WHERE company_id = ? AND id <> ? AND current_agent_id IS NOT NULL
             AND REGEXP_REPLACE(lead_phone, '[^0-9]', '') LIKE CONCAT('%', ?) ORDER BY id DESC LIMIT 1`,
          [companyId, leadId, key]);
        if (prev[0] && agents.includes(prev[0].current_agent_id)) pick = prev[0].current_agent_id;
      }
      if (!pick) pick = await roundRobin(serviceId, agents);
    }
    if (!pick) return null;
    const u = await query('UPDATE leads SET current_agent_id = ? WHERE id = ? AND current_agent_id IS NULL', [pick, leadId]);
    return u.affectedRows ? pick : null;
  } catch (e) {
    console.warn('[leadDistribution]', leadId, e.message);
    return null; // never block lead intake
  }
}

module.exports = { assignLead, nextAfter, parseIds };
