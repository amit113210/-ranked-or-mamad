import { Redis } from '@upstash/redis'; export default async function handler(req, res) {
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

    // Initialize inside the handler to ensure Vercel env vars are fully loaded at runtime
    let redis = null;
    try {
        if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
            redis = new Redis({
                url: process.env.UPSTASH_REDIS_REST_URL,
                token: process.env.UPSTASH_REDIS_REST_TOKEN,
            });
        } else {
            // Also accept standard kv environment variables in case Upstash linked as KV
            if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
                redis = new Redis({
                    url: process.env.KV_REST_API_URL,
                    token: process.env.KV_REST_API_TOKEN,
                });
            }
        }
    } catch (e) {
        console.warn("Redis initialization skipped (missing env vars)", e.message);
    }

    try {
        let visits = 1204; // Baseline fallback

        if (redis) {
            // Increment the 'visitor_count' key atomically
            visits = await redis.incr('visitor_count');
        }

        res.status(200).json({
            success: true,
            visits: visits
        });
    } catch (error) {
        console.error("Redis KV Error:", error);
        // Fallback gracefully so the UI doesn't crash
        res.status(200).json({
            success: true,
            visits: 1204
        });
    }
}
