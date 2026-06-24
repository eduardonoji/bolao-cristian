const { neon } = require('@neondatabase/serverless');
const { fetchGames } = require('./_games');

function getWindowBoundsUTC() {
  const now = new Date();
  const manausNow = new Date(now.getTime() - 4 * 60 * 60 * 1000);
  const h = manausNow.getUTCHours();
  const start = new Date(now);
  start.setUTCHours(10, 0, 0, 0);
  if (h < 6) start.setUTCDate(start.getUTCDate() - 1);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

function buildEmail(nick, games) {
  const gameLines = games.map(g => {
    const d = new Date(g.datetime);
    const time = d.toLocaleTimeString('pt-BR', { timeZone: 'America/Manaus', hour: '2-digit', minute: '2-digit' });
    return `<tr>
      <td style="padding:8px 0;border-bottom:1px solid #333;font-size:14px;color:#f0f0f0">${g.home} <span style="color:#555">×</span> ${g.away}</td>
      <td style="padding:8px 0;border-bottom:1px solid #333;font-size:14px;color:#999;text-align:right">${time}</td>
    </tr>`;
  }).join('');

  return {
    subject: `⚽ Bolão Snip – você ainda não apostou hoje, ${nick}!`,
    html: `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#0f0f0f">
  <div style="max-width:480px;margin:0 auto;padding:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
    <div style="margin-bottom:24px">
      <span style="font-size:28px">⚽</span>
      <span style="font-size:18px;font-weight:700;color:#f0f0f0;margin-left:8px">Bolão Snip - 2026</span>
    </div>
    <div style="background:#1a1a1a;border-radius:14px;padding:24px;border:1px solid rgba(255,255,255,0.08)">
      <p style="margin:0 0 8px;font-size:18px;font-weight:700;color:#f0f0f0">Opa, ${nick}! 👋</p>
      <p style="margin:0 0 20px;font-size:14px;color:#999;line-height:1.5">
        Hoje tem <strong style="color:#f0f0f0">${games.length} jogo${games.length > 1 ? 's' : ''}</strong> e você ainda não fez sua${games.length > 1 ? 's' : ''} aposta${games.length > 1 ? 's' : ''}. Não perca a chance de ganhar pontos!
      </p>
      <table style="width:100%;border-collapse:collapse">
        ${gameLines}
      </table>
      <div style="margin-top:24px;text-align:center">
        <a href="${process.env.APP_URL || 'https://bolao-snip.vercel.app'}"
           style="display:inline-block;background:#3b82f6;color:#fff;padding:13px 28px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px">
          Apostar agora
        </a>
      </div>
    </div>
    <p style="margin:16px 0 0;font-size:12px;color:#555;text-align:center">
      Você recebe este e-mail porque tem uma conta no Bolão Snip.
    </p>
  </div>
</body>
</html>`
  };
}

async function sendEmail(to, subject, html) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM || 'Bolão Snip <noreply@bolaosnip.com>',
      to: [to],
      subject,
      html,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error(`Erro ao enviar email para ${to}:`, err);
  }
  return res.ok;
}

module.exports = async function handler(req, res) {
  // Vercel injeta Authorization: Bearer <CRON_SECRET> automaticamente
  const auth = req.headers.authorization;
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Não autorizado' });
  }

  try {
    const sql = neon(process.env.DATABASE_URL);
    const { start, end } = getWindowBoundsUTC();

    // Jogos de hoje ainda não iniciados
    const games = await fetchGames();
    const todayScheduled = games.filter(g => {
      if (!g.datetime || g.status !== 'scheduled') return false;
      const d = new Date(g.datetime);
      return d >= start && d < end;
    });

    if (!todayScheduled.length) {
      return res.status(200).json({ ok: true, message: 'Nenhum jogo hoje, nenhum e-mail enviado.' });
    }

    // Usuários aprovados com e-mail cadastrado
    const users = await sql`SELECT nick, email FROM users WHERE status = 'approved' AND email IS NOT NULL AND email != ''`;
    if (!users.length) {
      return res.status(200).json({ ok: true, message: 'Nenhum usuário com e-mail.' });
    }

    // Palpites já feitos para os jogos de hoje
    const gameIds = todayScheduled.map(g => g.id);
    const palpites = await sql`SELECT nick, game_id FROM palpites WHERE game_id = ANY(${gameIds})`;
    const betSet = new Set(palpites.map(p => `${p.nick}:${p.game_id}`));

    let sent = 0;
    for (const user of users) {
      const missing = todayScheduled.filter(g => !betSet.has(`${user.nick}:${g.id}`));
      if (!missing.length) continue;
      const { subject, html } = buildEmail(user.nick, missing);
      const ok = await sendEmail(user.email, subject, html);
      if (ok) sent++;
    }

    return res.status(200).json({ ok: true, sent, total: users.length });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Erro no cron' });
  }
};
