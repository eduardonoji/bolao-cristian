const REGION_UTC_OFFSET = { 'Eastern': 4, 'Central': 5, 'Western': 7 };

const TEAM_PT = {
  'Argentina': 'Argentina',
  'Australia': 'Austrália',
  'Austria': 'Áustria',
  'Belgium': 'Bélgica',
  'Bolivia': 'Bolívia',
  'Bosnia and Herzegovina': 'Bósnia e Herzegovina',
  'Brazil': 'Brasil',
  'Cameroon': 'Camarões',
  'Canada': 'Canadá',
  'Chile': 'Chile',
  'Colombia': 'Colômbia',
  'Costa Rica': 'Costa Rica',
  'Croatia': 'Croácia',
  'Czech Republic': 'República Tcheca',
  'Denmark': 'Dinamarca',
  'DR Congo': 'RD Congo',
  'Ecuador': 'Equador',
  'Egypt': 'Egito',
  'England': 'Inglaterra',
  'France': 'França',
  'Germany': 'Alemanha',
  'Ghana': 'Gana',
  'Greece': 'Grécia',
  'Haiti': 'Haiti',
  'Honduras': 'Honduras',
  'Hungary': 'Hungria',
  'Indonesia': 'Indonésia',
  'Iran': 'Irã',
  'Iraq': 'Iraque',
  'Israel': 'Israel',
  'Italy': 'Itália',
  'Ivory Coast': 'Costa do Marfim',
  'Jamaica': 'Jamaica',
  'Japan': 'Japão',
  'Kenya': 'Quênia',
  'Mexico': 'México',
  'Morocco': 'Marrocos',
  'Netherlands': 'Países Baixos',
  'New Zealand': 'Nova Zelândia',
  'Nigeria': 'Nigéria',
  'Northern Ireland': 'Irlanda do Norte',
  'Norway': 'Noruega',
  'Panama': 'Panamá',
  'Paraguay': 'Paraguai',
  'Peru': 'Peru',
  'Poland': 'Polônia',
  'Portugal': 'Portugal',
  'Qatar': 'Catar',
  'Romania': 'Romênia',
  'Saudi Arabia': 'Arábia Saudita',
  'Scotland': 'Escócia',
  'Senegal': 'Senegal',
  'Serbia': 'Sérvia',
  'Slovakia': 'Eslováquia',
  'Slovenia': 'Eslovênia',
  'South Africa': 'África do Sul',
  'South Korea': 'Coreia do Sul',
  'Spain': 'Espanha',
  'Sweden': 'Suécia',
  'Switzerland': 'Suíça',
  'Turkey': 'Turquia',
  'Ukraine': 'Ucrânia',
  'United States': 'Estados Unidos',
  'Uruguay': 'Uruguai',
  'Venezuela': 'Venezuela',
  'Wales': 'País de Gales',
};

function translateTeam(name) {
  return TEAM_PT[name] || name;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const [gamesRes, stadiumsRes] = await Promise.all([
      fetch('https://worldcup26.ir/get/games'),
      fetch('https://worldcup26.ir/get/stadiums'),
    ]);
    if (!gamesRes.ok) throw new Error('Falha ao buscar jogos');

    const { games: raw } = await gamesRes.json();
    const stadiumData = stadiumsRes.ok ? await stadiumsRes.json() : { stadiums: [] };

    // stadium_id → utc offset (hours to add to convert local→UTC)
    const stadiumOffset = {};
    for (const s of (stadiumData.stadiums || [])) {
      stadiumOffset[s.id] = REGION_UTC_OFFSET[s.region] || 4;
    }

    const games = raw.map(g => {
      let datetime = null;
      if (g.local_date) {
        const [datePart, timePart = '00:00'] = g.local_date.split(' ');
        const [month, day, year] = datePart.split('/');
        const [h, m] = timePart.split(':').map(Number);
        const offsetHours = stadiumOffset[g.stadium_id] || 4;
        // Convert venue local time → UTC
        const utcDate = new Date(Date.UTC(
          parseInt(year), parseInt(month) - 1, parseInt(day),
          h + offsetHours, m, 0
        ));
        datetime = utcDate.toISOString();
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
        home: translateTeam(g.home_team_name_en || ''),
        away: translateTeam(g.away_team_name_en || ''),
        homeScore: hasScore ? parseInt(g.home_score, 10) : null,
        awayScore: hasScore ? parseInt(g.away_score, 10) : null,
        status,
        timeElapsed,
        datetime,
        group: g.group || '',
        matchday: g.matchday || '',
      };
    });

    return res.status(200).json({ games });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Erro ao buscar jogos' });
  }
};
