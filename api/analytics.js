// A simple mock analytics endpoint to keep track of visits.
// In a real Vercel environment, you would connect this to Redis/KV.
// Here we return a static but slightly growing number for demonstration.

let visitsBase = 1204; // Started at some arbitrary number
let lastUpdate = Date.now();

export default function handler(req, res) {
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

    // Simulate growth based on time passed
    const now = Date.now();
    const hoursPassed = (now - lastUpdate) / (1000 * 60 * 60);
    
    // Increment visit by a random factor over time
    visitsBase += Math.floor(hoursPassed * (Math.random() * 10 + 5)); 
    // And add 1 for this actual visit
    visitsBase += 1;
    lastUpdate = now;

    res.status(200).json({
        success: true,
        visits: visitsBase
    });
}
