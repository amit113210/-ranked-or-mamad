let cachedGames = null;
let lastCacheTime = 0;

export default async function handler(req, res) {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Credentials', true)
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS')
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    )

    if (req.method === 'OPTIONS') {
        res.status(200).end()
        return
    }

    try {
        // Simple in-memory cache to avoid rate limiting the FreeToGame API
        // Cache for 1 hour
        const now = Date.now();
        if (cachedGames && (now - lastCacheTime < 3600000)) {
            return res.status(200).json({ success: true, fromCache: true, games: cachedGames });
        }

        const response = await fetch('https://www.freetogame.com/api/games');

        if (!response.ok) {
            throw new Error(`Failed to fetch games: ${response.status}`);
        }

        const data = await response.json();

        // Extract what we need to minimize data transfer size to frontend
        const mappedGames = data.map(g => ({
            id: g.id,
            title: g.title,
            genre: g.genre,
            thumbnail: g.thumbnail
        }));

        // Update cache
        cachedGames = mappedGames;
        lastCacheTime = now;

        res.status(200).json({ success: true, fromCache: false, games: mappedGames });

    } catch (error) {
        console.error("Error fetching games list:", error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
}
