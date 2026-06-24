const { neon } = require('@neondatabase/serverless');

const ADMIN_NICK = 'eduardo';

async function getDb() {
  const sql = neon(process.env.DATABASE_URL);
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      nick TEXT PRIMARY KEY,
      pass TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      role TEXT NOT NULL DEFAULT 'user',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  return sql;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const action = req.query.action;

  try {
    const sql = await getDb();

    if (req.method === 'POST' && action === 'register') {
      const { nick, pass } = req.body;
      if (!nick || !pass) return res.status(400).json({ error: 'nick e pass obrigatórios' });
      const encoded = Buffer.from(pass).toString('base64');
      const isAdmin = nick === ADMIN_NICK;
      const status = isAdmin ? 'approved' : 'pending';
      const role = isAdmin ? 'admin' : 'user';
      try {
        await sql`INSERT INTO users (nick, pass, status, role) VALUES (${nick}, ${encoded}, ${status}, ${role})`;
      } catch (e) {
        if (e.message && e.message.includes('duplicate')) {
          return res.status(409).json({ error: 'Nick já em uso' });
        }
        throw e;
      }
      return res.status(200).json({ nick, status, role });
    }

    if (req.method === 'POST' && action === 'login') {
      const { nick, pass } = req.body;
      if (!nick || !pass) return res.status(400).json({ error: 'nick e pass obrigatórios' });
      const encoded = Buffer.from(pass).toString('base64');
      const rows = await sql`SELECT nick, status, role FROM users WHERE nick = ${nick} AND pass = ${encoded}`;
      if (!rows.length) return res.status(401).json({ error: 'Nick ou senha incorretos' });
      return res.status(200).json(rows[0]);
    }

    if (req.method === 'GET' && action === 'pending') {
      const { adminNick, adminPass } = req.query;
      const encoded = Buffer.from(adminPass || '').toString('base64');
      const adminRows = await sql`SELECT role FROM users WHERE nick = ${adminNick} AND pass = ${encoded}`;
      if (!adminRows.length || adminRows[0].role !== 'admin') {
        return res.status(403).json({ error: 'Acesso negado' });
      }
      const rows = await sql`SELECT nick, created_at FROM users WHERE status = 'pending' ORDER BY created_at`;
      return res.status(200).json({ users: rows });
    }

    if (req.method === 'POST' && action === 'approve') {
      const { adminNick, adminPass, targetNick, decision } = req.body;
      const encoded = Buffer.from(adminPass || '').toString('base64');
      const adminRows = await sql`SELECT role FROM users WHERE nick = ${adminNick} AND pass = ${encoded}`;
      if (!adminRows.length || adminRows[0].role !== 'admin') {
        return res.status(403).json({ error: 'Acesso negado' });
      }
      const newStatus = decision === 'approve' ? 'approved' : 'rejected';
      await sql`UPDATE users SET status = ${newStatus} WHERE nick = ${targetNick}`;
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: 'Ação inválida' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Erro interno' });
  }
};
