module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { home, away } = req.body || {};
  if (!home || !away) return res.status(400).json({ error: 'Times inválidos' });

  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(503).json({ error: 'Serviço de IA não configurado. Adicione GEMINI_API_KEY nas variáveis de ambiente.' });

  const prompt = `Você é um analista esportivo especializado em futebol. Preveja o placar mais provável para a partida da Copa do Mundo 2026 entre ${home} (mandante) e ${away} (visitante). Considere o histórico recente dos times, força do elenco e fase do torneio. Retorne apenas o placar final.`;

  let r;
  try {
    r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: 'OBJECT',
              properties: {
                home: { type: 'INTEGER' },
                away: { type: 'INTEGER' }
              },
              required: ['home', 'away']
            }
          }
        })
      }
    );
  } catch (e) {
    return res.status(502).json({ error: 'Erro ao conectar com a IA.' });
  }

  if (!r.ok) {
    const txt = await r.text().catch(() => '');
    return res.status(502).json({ error: 'Erro na IA: ' + (txt || r.status) });
  }

  let data;
  try {
    data = await r.json();
  } catch (e) {
    return res.status(502).json({ error: 'Resposta inválida da IA.' });
  }

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) return res.status(502).json({ error: 'A IA não retornou um placar.' });

  let scores;
  try {
    scores = JSON.parse(text);
  } catch (e) {
    return res.status(502).json({ error: 'Formato de resposta da IA inválido.' });
  }

  const homeScore = parseInt(scores.home);
  const awayScore = parseInt(scores.away);
  if (isNaN(homeScore) || isNaN(awayScore) || homeScore < 0 || awayScore < 0) {
    return res.status(502).json({ error: 'Placar da IA fora do esperado.' });
  }

  res.json({ home: homeScore, away: awayScore });
};
