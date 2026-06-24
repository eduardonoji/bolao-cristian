module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const r = await fetch("https://worldcup26.ir/get/games");
    const json = await r.json();
    const raw = json.games || json || [];

    const games = raw.map(g => {
      // local_date vem como "06/13/2026 21:00" → converter para ISO
      let datetime = null;
      if (g.local_date) {
        const [datePart, timePart] = g.local_date.split(" ");
        const [month, day, year] = datePart.split("/");
        datetime = `${year}-${month}-${day}T${timePart}:00`;
      }

      const finished = g.finished === "TRUE" || g.time_elapsed === "finished";
      const status = finished ? "completed"
        : g.time_elapsed && g.time_elapsed !== "finished" && g.time_elapsed !== "" ? "in_progress"
        : "scheduled";

      return {
        id:         g.id || g._id,
        home:       g.home_team_name_en || "",
        away:       g.away_team_name_en || "",
        home_score: finished ? parseInt(g.home_score) : null,
        away_score: finished ? parseInt(g.away_score) : null,
        status,
        datetime,
        group:      g.group || "",
        matchday:   g.matchday || "",
      };
    });

    // ordenar por data
    games.sort((a, b) => new Date(a.datetime) - new Date(b.datetime));

    return res.status(200).json({ games });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
