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
        let visits = 1204; // Baseline fallback

        // In Vercel, when you link Upstash Redis / Vercel KV, it exposes these two variables natively
        const kvUrl = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
        const kvToken = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

        if (kvUrl && kvToken) {
            // Use native fetch to hit the Upstash REST API directly to avoid Edge SDK runtime mismatches
            const cleanUrl = kvUrl.endsWith('/') ? kvUrl.slice(0, -1) : kvUrl;

            // Atomically INCR the 'visitor_count'
            const response = await fetch(`${cleanUrl}/INCR/visitor_count`, {
                headers: {
                    Authorization: `Bearer ${kvToken}`,
                },
                method: 'POST',
            });

            if (response.ok) {
                const data = await response.json();
                if (data.result) {
                    visits = parseInt(data.result, 10);
                }
            } else {
                console.error("KV REST Failed:", await response.text());
            }
        } else {
            console.warn("Analytics: No KV environment variables detected.");
        }

        res.status(200).json({
            success: true,
            visits: visits
        });
    } catch (error) {
        console.error("Redis REST Error:", error);
        // Fallback gracefully so the UI doesn't crash
        res.status(200).json({
            success: true,
            visits: 1204
        });
    }
}
