import { createClient } from 'redis';

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

    let visits = 1204; // Baseline fallback
    let debugMsg = "All good";
    let client = null;

    try {
        const redisUrl = process.env.REDIS_URL || 'redis://default:rFSKE5eRQtMB9QAsIyqBUfpQWCwWv8zN@redis-17593.crce218.eu-central-1-1.ec2.cloud.redislabs.com:17593';

        client = createClient({
            url: redisUrl
        });

        client.on('error', (err) => {
            console.error('Redis Client Error', err);
            debugMsg = `Client Err: ${err.message}`;
        });

        await client.connect();

        // Atomically INCR the 'visitor_count'
        const newValue = await client.incr('visitor_count');
        if (newValue) {
            visits = newValue;
        }

        res.status(200).json({
            success: true,
            visits: visits,
            debug: debugMsg
        });

    } catch (error) {
        console.error("Redis Connection Error:", error);
        res.status(200).json({
            success: true,
            visits: visits,
            debug: `Code Error: ${error.message}`
        });
    } finally {
        if (client) {
            try {
                // Ensure connection is closed so Vercel function can exit gracefully
                await client.disconnect();
            } catch (e) {
                // Ignore disconnect errors
            }
        }
    }
}
