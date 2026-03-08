import { Redis } from '@upstash/redis';

// Initialize Redis client. It will automatically use UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN from environment variables.
// We wrap it in a try-catch to allow local development to gracefully fall back if keys aren't set yet.
let redis;
try {
    if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
        redis = new Redis({
            url: process.env.UPSTASH_REDIS_REST_URL,
            token: process.env.UPSTASH_REDIS_REST_TOKEN,
        });
    }
} catch (e) {
    console.warn("Redis initialization skipped (missing env vars)");
}

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
