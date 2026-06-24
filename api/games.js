module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const response = await fetch('https://worldcup26.ir/get/games');
    if (!response.ok) throw new Error('Falha ao buscar jogos');
    const data = await response.json();
    const raw = Array.isArray(data) ? data : (data.games || data.data || []);

    const games = raw.map(g => {
      let datetime = null;
      if (g.local_date) {
        const parts = g.local_date.split(' ');
        const datePart = parts[0];
        const timePart = parts[1] || '00:00';
        const [month, day, year] = datePart.split('/');
        datetime = `${year}-${month}-${day}T${timePart}:00`;
      }

      const finished = g.finished === 'TRUE' || g.finished === true;
      const timeElapsed = g.time_elapsed || '';
      const isLive = !finished && /\d/.test(timeElapsed);

      let status = 'scheduled';
      if (finished) status = 'completed';
      else if (isLive) status = 'in_progress';

      const hasScore = status === 'in_progress' || status === 'completed';

      return {
        id: String(g.id),
        home: g.home_team_name_en || '',
        away: g.away_team_name_en || '',
        homeScore: hasScore ? parseInt(g.home_score, 10) : null,
        awayScore: hasScore ? parseInt(g.away_score, 10) : null,
        status,
        timeElapsed: timeElapsed,
        datetime,
        group: g.group || '',
        matchday: g.matchday || ''
      };
    });

    return res.status(200).json({ games });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Erro ao buscar jogos' });
  }
};
