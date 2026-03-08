export default async function handler(req, res) {
    // Set CORS headers so the frontend can easily hit this wrapper
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
        // Fetch data from the public tzevaadom API (which holds history of alerts)
        const response = await fetch('https://api.tzevaadom.co.il/alerts-history');

        if (!response.ok) {
            throw new Error(`Failed to fetch alerts: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();

        // Count total alerts in the current data payload (typically recent history)
        let totalAlerts = 0;
        let latestAlertTime = 0;
        let cityAlarms = {}; // Map: {"city": { count: 2, lastAlert: timestamp }}

        if (Array.isArray(data)) {
            data.forEach(eventGroup => {
                if (eventGroup.alerts && Array.isArray(eventGroup.alerts)) {
                    totalAlerts += eventGroup.alerts.length;

                    // Parse each alert
                    eventGroup.alerts.forEach(alert => {
                        const alertTime = alert.time;
                        if (alertTime > latestAlertTime) {
                            latestAlertTime = alertTime;
                        }

                        // Keep track per city
                        if (alert.cities && Array.isArray(alert.cities)) {
                            alert.cities.forEach(city => {
                                // sometimes cities have extras like "תל אביב - דרום העיר ויפו", extract the main city name for easier matching
                                // However, keeping the full name is safer. The frontend will match substring.
                                if (!cityAlarms[city]) {
                                    cityAlarms[city] = { count: 0, lastAlert: 0 };
                                }
                                cityAlarms[city].count += 1;
                                if (alertTime > cityAlarms[city].lastAlert) {
                                    cityAlarms[city].lastAlert = alertTime;
                                }
                            });
                        }
                    });
                }
            });
        }

        res.status(200).json({
            success: true,
            totalRecentAlerts: totalAlerts,
            lastUpdateTimestamp: latestAlertTime,
            cityAlarms: cityAlarms,
            message: "Data fetched successfully from api.tzevaadom.co.il"
        });

    } catch (error) {
        console.error("Error fetching red alerts:", error);
        res.status(500).json({
            success: false,
            error: error.message,
            totalRecentAlerts: 15 // Fallback generic number so the app doesn't break if the API is down
        });
    }
}
