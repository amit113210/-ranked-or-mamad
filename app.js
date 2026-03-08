// State variables
let riskData = {
    gameName: '',
    gameLengthScore: 0,
    gameReasoning: '',
    cityName: '',
    locationScore: 0,
    locationReasoning: [],
    rankMultiplier: 1.0,
    rankReasoning: '',
    alarmsToday: 0,
    finalScore: 0,
    resultTheme: ''
};

const RED_SOUND = document.getElementById('sfx-failed');

// Game autocomplete data
let gameList = [];
let cityList = [];
let cityAlarms = {}; // Stores our dynamic risk map
let dailyHourlyBuckets = new Array(24).fill(0); // Stores the 24 hour trend map

// Fetch Live Data on Load
document.addEventListener('DOMContentLoaded', () => {
    fetchAlertData();
    fetchGameDatabase();
    fetchCityDatabase();
    fetchAnalytics();

    // Check local storage for Quick Scan
    checkLocalStorageParams();
});

function checkLocalStorageParams() {
    const savedDataStr = localStorage.getItem('rankedMamadData');
    if (savedDataStr) {
        try {
            const savedData = JSON.parse(savedDataStr);
            if (savedData.gameName && savedData.cityName) {
                const qsContainer = document.getElementById('quick-scan-container');
                const qsInfo = document.getElementById('quick-scan-info');

                if (qsContainer && qsInfo) {
                    qsInfo.innerText = `${savedData.gameName} ב-${savedData.cityName}`;
                    qsContainer.style.display = 'block';
                }
            }
        } catch (e) {
            console.error("Error reading locastorage", e);
        }
    }
}

function runQuickScan() {
    const savedDataStr = localStorage.getItem('rankedMamadData');
    if (savedDataStr) {
        try {
            const savedData = JSON.parse(savedDataStr);
            riskData = { ...riskData, ...savedData }; // Merge saved data into current state

            // Assume default rank pressure of 5 if bypassing Q3
            if (!riskData.rankMultiplier) {
                riskData.rankMultiplier = 1.0;
            }
            // Trigger calculation directly based on saved city
            calculateRiskLogicFromSaved();

        } catch (e) {
            console.error(e);
            startSurvey();
        }
    } else {
        startSurvey();
    }
}

async function fetchAnalytics() {
    try {
        const res = await fetch('/api/analytics');
        const data = await res.json();
        if (data.success && data.visits) {
            const visitorEl = document.getElementById('visitor-count-display');
            if (visitorEl) {
                // Add commas for thousands
                const visitsStr = data.visits.toLocaleString('en-US');
                visitorEl.innerHTML = `👥 <strong>${visitsStr}</strong> אנשים בדקו ביממה האחרונה`;
            }
        }
    } catch (e) {
        console.error("Failed to load analytics", e);
        // Silently fail if analytics is down
        const visitorEl = document.getElementById('visitor-count-display');
        if (visitorEl) visitorEl.style.display = 'none';
    }
}

function calculateRiskLogicFromSaved() {
    // Re-run the city selection logic to populate immediate risk data before jumping to calc
    const cityName = riskData.cityName;
    const nafa = riskData.nafa || '';
    const moatza = riskData.moatza || '';

    // Risk Calculation based on location (Pure Time & Radius Model)
    let risk = 0; // Pure starting point
    let locationReasons = ["אזור המגורים מתחיל מ-0 סיכון, תלוי בנתוני אזעקות בלבד!"];

    const nowSeconds = Math.floor(Date.now() / 1000);
    const twoHoursLimit = nowSeconds - (2 * 60 * 60);
    const twelveHoursLimit = nowSeconds - (12 * 60 * 60);

    // 1. Splash Damage
    let splashDamage = 0;

    if (moatza && moatza !== "חסר" && moatza !== " ") {
        for (const [cName, cData] of Object.entries(cityAlarms)) {
            if (cData.count > 0 && cName !== cityName) {
                const neighborCityInfo = cityList.find(c => c.name === cName);
                if (neighborCityInfo && neighborCityInfo.moatza === moatza) {
                    splashDamage = 15;
                    locationReasons.push(`נזק היקפי: בוצע ירי לעבר ${cName} (שנמצאת איתך באותה מועצה אזורית - ${moatza}), זה מוסיף בסביבה הקרובה עוד +15 נק'.`);
                    break;
                }
            }
        }
    }
    risk += splashDamage;

    // 2. Direct Hit Volume & Freshness
    let directRisk = 0;
    let localAlarmsCount = 0;
    let localLastAlert = 0;

    const baseCityName = (cityName || '').split('-')[0].trim();

    // Cities like Tel Aviv appear as "תל אביב - מרכז" in the API but "תל אביב - יפו" in the DB.
    // We check for substring matches in both directions
    for (const [cName, cData] of Object.entries(cityAlarms)) {
        if (!cName) continue;
        const baseCName = cName.split('-')[0].trim();
        if (baseCName === baseCityName || cName.includes(baseCityName) || (cityName && cityName.includes(cName))) {
            localAlarmsCount += cData.count;
            if (cData.lastAlert > localLastAlert) {
                localLastAlert = cData.lastAlert;
            }
        }
    }

    if (localAlarmsCount > 0) {
        const volumeScore = Math.min(localAlarmsCount * 8, 40);
        directRisk += volumeScore;
        locationReasons.push(`תיעוד חי: נרשמו ${localAlarmsCount} אזעקות היום באזורך (+${volumeScore} נק').`);

        if (localLastAlert >= twoHoursLimit) {
            directRisk += 50;
            locationReasons.push(`התרעה חמה: האזעקה האחרונה הייתה בשעתיים האחרונות! מוסיף אזהרה קריטית (+50 נק').`);
        } else if (localLastAlert >= twelveHoursLimit) {
            directRisk += 25;
            locationReasons.push(`שרידי ירי: נרשמו אזעקות ב-12 השעות האחרונות. עירנות נדרשת (+25 נק').`);
        }
    }

    risk += directRisk;

    if (risk > 85) risk = 85;

    // IMPORTANT: In Quick Scan, we must preserve the overall structure 
    // to match calculateResult's expectation.
    riskData.locationScore = risk;
    riskData.locationReasoning = locationReasons;

    // Run final calculation
    calculateResult(true);
}

async function fetchCityDatabase() {
    try {
        const res = await fetch('https://data.gov.il/api/3/action/datastore_search?resource_id=d4901968-dad3-4845-a9b0-a57d027f11ab&limit=1500');
        const data = await res.json();
        if (data.success && data.result && data.result.records) {
            cityList = data.result.records.map(record => ({
                name: (record['שם_ישוב'] || '').trim().replace(/ \)\w+\(/g, ''), // Clean name
                nafa: (record['שם_נפה'] || '').trim(),
                moatza: (record['שם_מועצה'] || '').trim()
            })).filter(c => c.name);
            setupCityAutocomplete();
        }
    } catch (e) {
        console.error("Failed to load cities db", e);
    }
}

async function fetchGameDatabase() {
    try {
        const res = await fetch('/api/games');
        const data = await res.json();
        if (data.success && data.games) {
            gameList = data.games;
            setupAutocomplete();
        }
    } catch (e) {
        console.error("Failed to load games db", e);
        // Fallback to manual selection
        document.getElementById('manual-select-desc').style.display = 'block';
        document.getElementById('manual-options').style.display = 'flex';
    }
}

function setupAutocomplete() {
    const inp = document.getElementById("game-name");

    inp.addEventListener("input", function (e) {
        let a, b, i, val = this.value;
        closeAllLists();

        if (!val) {
            document.getElementById('manual-select-desc').style.display = 'block';
            document.getElementById('manual-options').style.display = 'flex';
            return false;
        }

        // Hide manual options while typing
        document.getElementById('manual-select-desc').style.display = 'none';
        document.getElementById('manual-options').style.display = 'none';

        a = document.getElementById("autocomplete-list");
        a.innerHTML = '';

        let matches = 0;
        for (i = 0; i < gameList.length; i++) {
            // Find matches (limit to 6)
            if (matches < 6 && gameList[i].title.toLowerCase().includes(val.toLowerCase())) {
                b = document.createElement("DIV");

                // Highlight matching part
                const matchIndex = gameList[i].title.toLowerCase().indexOf(val.toLowerCase());
                const prefix = gameList[i].title.substring(0, matchIndex);
                const match = gameList[i].title.substring(matchIndex, matchIndex + val.length);
                const suffix = gameList[i].title.substring(matchIndex + val.length);

                b.innerHTML = `<span>${prefix}<strong>${match}</strong>${suffix}</span>`;
                b.innerHTML += `<span class="genre-badge">${gameList[i].genre}</span>`;
                b.innerHTML += `<input type='hidden' value='${gameList[i].title.replace(/'/g, "&#39;")}' data-genre='${gameList[i].genre}'>`;

                b.addEventListener("click", function (e) {
                    const inputElement = this.getElementsByTagName("input")[0];
                    inp.value = inputElement.value;
                    const genre = inputElement.getAttribute('data-genre');

                    // Auto Select Logic Based on Genre
                    let score = 30; // default medium
                    const g = genre.toLowerCase();

                    if (g.includes('card') || g.includes('puzzle') || g.includes('casual') || g.includes('board') || g.includes('social')) {
                        score = 10;
                    } else if (g.includes('moba') || g.includes('strategy') || g.includes('mmorpg') || g.includes('mmo')) {
                        score = 50;
                    } else if (g.includes('shooter') || g.includes('battle royale') || g.includes('fighting') || g.includes('sports') || g.includes('racing') || g.includes('arpg') || g.includes('action')) {
                        score = 30;
                    }

                    closeAllLists();
                    selectQ1Autocomplete(inp.value, score);
                });
                a.appendChild(b);
                matches++;
            }
        }

        // If no matches, fallback
        if (matches === 0) {
            document.getElementById('manual-select-desc').style.display = 'block';
            document.getElementById('manual-options').style.display = 'flex';
        }
    });

    function closeAllLists(elmnt) {
        const x = document.getElementById("autocomplete-list");
        if (x) x.innerHTML = '';
    }

    document.addEventListener("click", function (e) {
        if (e.target.id !== "game-name") {
            closeAllLists();
        }
    });
}

function setupCityAutocomplete() {
    const inp = document.getElementById("city-name");

    inp.addEventListener("input", function (e) {
        let a, b, i, val = this.value;
        const listDiv = document.getElementById("city-autocomplete-list");
        if (listDiv) listDiv.innerHTML = '';

        if (!val) return false;

        a = document.getElementById("city-autocomplete-list");
        a.innerHTML = '';

        let matches = 0;
        for (i = 0; i < cityList.length; i++) {
            if (matches < 6 && cityList[i].name.startsWith(val)) {
                b = document.createElement("DIV");

                const prefix = cityList[i].name.substring(0, val.length);
                const suffix = cityList[i].name.substring(val.length);

                b.innerHTML = `<strong>${prefix}</strong>${suffix}`;
                b.innerHTML += `<span class="genre-badge">${cityList[i].nafa}</span>`;
                b.innerHTML += `<input type='hidden' value='${cityList[i].name.replace(/'/g, "&#39;")}' data-nafa='${cityList[i].nafa}' data-moatza='${cityList[i].moatza}'>`;

                b.addEventListener("click", function (e) {
                    const inputElement = this.getElementsByTagName("input")[0];
                    inp.value = inputElement.value;
                    inp.setAttribute('data-nafa', inputElement.getAttribute('data-nafa'));
                    inp.setAttribute('data-moatza', inputElement.getAttribute('data-moatza'));

                    const x = document.getElementById("city-autocomplete-list");
                    if (x) x.innerHTML = '';
                });
                a.appendChild(b);
                matches++;
            }
        }
    });

    document.addEventListener("click", function (e) {
        if (e.target.id !== "city-name") {
            const x = document.getElementById("city-autocomplete-list");
            if (x) x.innerHTML = '';
        }
    });
}

function locateUserGPS() {
    const btn = document.getElementById('locate-me-btn');
    const inp = document.getElementById('city-name');

    if (!navigator.geolocation) {
        alert("דפדפן זה אינו תומך באיתור מיקום.");
        return;
    }

    btn.innerText = "⏳";
    btn.disabled = true;

    navigator.geolocation.getCurrentPosition(async (position) => {
        const lat = position.coords.latitude;
        const lon = position.coords.longitude;

        try {
            // Use a free reverse geocoding API (BigDataCloud is free for client-side without API key)
            const res = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=he`);
            const data = await res.json();

            // Extract the city/locality in Hebrew
            const resolvedCityName = data.locality || data.city;

            if (resolvedCityName) {
                // Try to find it in our exact cityList to get Nafa and Moatza
                const matchedCity = cityList.find(c => resolvedCityName.includes(c.name) || c.name.includes(resolvedCityName));

                if (matchedCity) {
                    inp.value = matchedCity.name;
                    inp.setAttribute('data-nafa', matchedCity.nafa);
                    inp.setAttribute('data-moatza', matchedCity.moatza);
                    btn.innerText = "✅";
                } else {
                    inp.value = resolvedCityName; // Fallback to string if no exact metadata
                    btn.innerText = "✅";
                }
            } else {
                alert("לא הצלחנו לאתר עיר מדויקת לפי המיקום שלך.");
                btn.innerText = "📍";
            }
        } catch (e) {
            console.error("GPS Reverse Geocode Error", e);
            alert("שגיאה בפענוח מיקום ה-GPS.");
            btn.innerText = "📍";
        }
        btn.disabled = false;

        setTimeout(() => { btn.innerText = "📍"; }, 3000);

    }, (error) => {
        alert("לא אישרת גישה למיקום או שיש בעיית GPS.");
        btn.innerText = "📍";
        btn.disabled = false;
    }, { timeout: 10000 });
}

async function fetchAlertData() {
    const statusEl = document.getElementById('live-status');
    const startBtn = document.getElementById('start-btn');

    try {
        // Fetch from our Serverless function. 
        // In local dev without vercel CLI this might fail if not proxying, 
        // but in production it maps to /api/alerts
        const res = await fetch('/api/alerts');
        const data = await res.json();

        if (data.success) {
            riskData.alarmsToday = data.totalRecentAlerts || 0;
            if (data.cityAlarms) cityAlarms = data.cityAlarms;
            if (data.hourlyBuckets) dailyHourlyBuckets = data.hourlyBuckets;

            // Format time if available
            let lastAlarmStr = "אין";
            if (data.lastUpdateTimestamp) {
                const alarmDate = new Date(data.lastUpdateTimestamp * 1000);
                lastAlarmStr = alarmDate.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
            }

            const nowStr = new Date().toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });

            statusEl.innerHTML = `✅ מחובר. סה"כ אזעקות: ${riskData.alarmsToday} <span style="font-size: 0.8rem; opacity: 0.8; display: block; margin-top: 5px;">(סונכרן כעת: ${nowStr} | אזעקה אחרונה: ${lastAlarmStr})</span>`;
            statusEl.style.color = 'var(--neon-green)';

            document.getElementById('q2-desc').innerText = `מערכת מחוברת: ${riskData.alarmsToday} התרעות נרשמו עד כה.`;
        } else {
            throw new Error("API returned false success");
        }
    } catch (e) {
        console.error("Failed to load live data:", e);
        statusEl.innerText = `⚠️ לא ניתן למשוך נתוני אמת כרגע. משתמש בהערכה בסיסית.`;
        statusEl.style.color = 'var(--neon-yellow)';
    } finally {
        // Enable button regardless
        startBtn.disabled = false;
        startBtn.innerHTML = `<div class="btn-content">בדוק סטטוס 🎯</div><div class="btn-glitch"></div>`;
    }
}

// Game detection dictionary
const gameDictionary = {
    // Short games (10 pts)
    'brawl': 10, 'rocket': 10, 'rl': 10, 'fifa': 10, 'fc': 10, 'clash': 10, 'snap': 10, 'fall guys': 10, 'hearthstone': 10, 'minecraft': 10, 'roblox': 10,
    // Medium games (30 pts)
    'val': 30, 'cs': 30, 'counter': 30, 'fortnite': 30, 'apex': 30, 'cod': 30, 'warzone': 30, 'call': 30, 'pubg': 30, 'overwatch': 30, 'ow': 30, 'rainbow': 30, 'r6': 30, 'dbd': 30, 'dead': 30, 'gta': 30,
    // Long games (50 pts)
    'lol': 50, 'league': 50, 'dota': 50, 'tft': 50, 'teamfight': 50, 'wow': 50, 'world of': 50, 'civ': 50, 'rust': 50, 'ark': 50, 'tarkov': 50
};

function handleGameInputKey(e) {
    if (e.key === 'Enter') {
        autoDetectGame();
    }
}

function autoDetectGame() {
    const gameInput = document.getElementById('game-name').value.trim();
    if (!gameInput) {
        alert("נא להזין שם משחק או לבחור ידנית מהרשימה למטה.");
        return;
    }

    const lowerInput = gameInput.toLowerCase();

    // Check match
    let detectedScore = 0;

    for (const [key, score] of Object.entries(gameDictionary)) {
        if (lowerInput.includes(key) || key === lowerInput) {
            detectedScore = score;
            break;
        }
    }

    if (detectedScore > 0) {
        // Auto select and move to next screen
        riskData.gameName = gameInput;
        riskData.gameLengthScore = detectedScore;
        showScreen('screen-q2');
    } else {
        alert(`לא הצלחנו לזהות אוטומטית את אורך המשחק של "${gameInput}". אנא בחר את סוג המשחק מהרשימה למטה 👇`);
    }
}

// UI functions
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
}

function startSurvey() {
    showScreen('screen-q1');
}

// Q1 Selection Autocomplete Helper
function selectQ1Autocomplete(gameName, score) {
    riskData.gameName = gameName;
    riskData.gameLengthScore = score;
    riskData.gameReasoning = `סגנון משחק מוסיף ${score} נק' בסיס.`;
    showScreen('screen-q2');
}

// Old Q1 Selection (Manual)
function selectQ1(score) {
    let gameInput = document.getElementById('game-name').value.trim();
    if (!gameInput) {
        if (score === 10) gameInput = "משחק קצר";
        if (score === 30) gameInput = "תחרותי קלאסי";
        if (score === 50) gameInput = "MOBA / ארוך";
    }
    riskData.gameName = gameInput;
    riskData.gameLengthScore = score;
    riskData.gameReasoning = `סגנון משחק מוסיף ${score} נק' בסיס.`;
    showScreen('screen-q2');
}

// Q2 Selection
function selectQ2() {
    const inp = document.getElementById('city-name');
    const cityName = inp.value.trim();
    if (!cityName) {
        alert("נא להזין עיר או אזור כדי להמשיך.");
        return;
    }

    const nafa = inp.getAttribute('data-nafa') || '';
    const moatza = inp.getAttribute('data-moatza') || '';

    // Risk Calculation based on location (Pure Time & Radius Model)
    let risk = 0; // Pure starting point
    let locationReasons = ["אזור המגורים מתחיל מ-0 סיכון, תלוי בנתוני אזעקות בלבד!"];

    const nowSeconds = Math.floor(Date.now() / 1000);
    const twoHoursLimit = nowSeconds - (2 * 60 * 60);
    const twelveHoursLimit = nowSeconds - (12 * 60 * 60);

    // 1. Splash Damage (Is the surrounding region under attack today?)
    // We check if any city with the exact same 'moatza' (Regional Council) has an alarm today.
    // 'nafa' (District) like Beer Sheva is too large (covers half the country including Eilat).
    let splashDamage = 0;

    if (moatza && moatza !== "חסר" && moatza !== " ") {
        for (const [cName, cData] of Object.entries(cityAlarms)) {
            if (cData.count > 0 && cName !== cityName) {
                // Find this city in the general city database to match its moatza
                const neighborCityInfo = cityList.find(c => c.name === cName);
                if (neighborCityInfo) {
                    // Only apply splash damage if they belong to the EXACT SAME regional council
                    if (neighborCityInfo.moatza === moatza) {
                        splashDamage = 15; // Collateral Risk
                        locationReasons.push(`נזק היקפי: בוצע ירי לעבר ${cName} (שנמצאת איתך באותה מועצה אזורית - ${moatza}), זה מוסיף בסביבה הקרובה עוד +15 נק'.`);
                        break;
                    }
                }
            }
        }
    }
    risk += splashDamage;

    // 2. Direct Hit Volume & Freshness
    let directRisk = 0;
    let localAlarmsCount = 0;
    let localLastAlert = 0;

    const baseCityName = (cityName || '').split('-')[0].trim();

    for (const [cName, cData] of Object.entries(cityAlarms)) {
        if (!cName) continue;
        const baseCName = cName.split('-')[0].trim();
        if (baseCName === baseCityName || cName.includes(baseCityName) || (cityName && cityName.includes(cName))) {
            localAlarmsCount += cData.count;
            if (cData.lastAlert > localLastAlert) {
                localLastAlert = cData.lastAlert;
            }
        }
    }

    if (localAlarmsCount > 0) {
        // Volume: +5 points per alarm today (Up to +40, increased weight)
        const volumeScore = Math.min(localAlarmsCount * 8, 40);
        directRisk += volumeScore;
        locationReasons.push(`תיעוד חי: נרשמו ${localAlarmsCount} אזעקות היום באזורך (+${volumeScore} נק').`);

        // Freshness
        if (localLastAlert >= twoHoursLimit) {
            directRisk += 50; // Critical Red
            locationReasons.push(`התרעה חמה: האזעקה האחרונה הייתה בשעתיים האחרונות! מוסיף אזהרה קריטית (+50 נק').`);
        } else if (localLastAlert >= twelveHoursLimit) {
            directRisk += 25; // Tense Yellow
            locationReasons.push(`שרידי ירי: נרשמו אזעקות ב-12 השעות האחרונות. עירנות נדרשת (+25 נק').`);
        }
    }

    risk += directRisk;

    // Safety cap: Location risk cannot exceed 85 to prevent completely overriding the game and rank multipliers, but let it be influential.
    if (risk > 85) risk = 85;

    riskData.cityName = cityName;
    riskData.locationScore = risk;
    riskData.locationReasoning = locationReasons;
    showScreen('screen-q3');
}

// Q3 Slider Update UI
function updateSliderUI(val) {
    document.getElementById('slider-value').innerText = val;
}

// Calculate logic
function calculateResult(isQuickScan = false) {
    if (!isQuickScan) {
        const rankVal = parseInt(document.getElementById('rank-slider').value, 10);

        // Convert 1-10 to multiplier 0.5 - 1.5
        riskData.rankMultiplier = 0.5 + ((rankVal - 1) * (1.0 / 9));

        if (riskData.rankMultiplier > 1.0) {
            riskData.rankReasoning = `לחץ ראנק מחושב כמכפיל חומרה של x${riskData.rankMultiplier.toFixed(2)}`;
        } else {
            riskData.rankReasoning = `אתה לא לחוץ על הראנק ולכן מקבל הקלה בסיכון פי x${riskData.rankMultiplier.toFixed(2)}`;
        }
    } else {
        // Construct the reasoning if it was missing from an older LocalStorage save
        if (!riskData.rankReasoning) {
            if (riskData.rankMultiplier > 1.0) {
                riskData.rankReasoning = `לחץ ראנק מחושב כמכפיל חומרה של x${riskData.rankMultiplier.toFixed(2)}`;
            } else if (riskData.rankMultiplier < 1.0) {
                riskData.rankReasoning = `אתה לא לחוץ על הראנק ולכן מקבל הקלה בסיכון פי x${riskData.rankMultiplier.toFixed(2)}`;
            } else {
                riskData.rankReasoning = `לחץ ראנק על הגדרות ברירת מחדל (סיכון רגיל).`;
            }
        }
    }

    // Base score from answers
    let baseScore = riskData.gameLengthScore + riskData.locationScore;

    // We no longer add generic "alarmsToday" risk, because locationScore is now highly accurate via the new model
    riskData.finalScore = baseScore * riskData.rankMultiplier;

    // Save to Local Storage for Quick Scan 
    if (riskData.cityName && riskData.gameName) {
        localStorage.setItem('rankedMamadData', JSON.stringify({
            gameName: riskData.gameName,
            gameLengthScore: riskData.gameLengthScore,
            gameReasoning: riskData.gameReasoning,
            cityName: riskData.cityName,
            nafa: riskData.nafa,
            moatza: riskData.moatza,
            rankMultiplier: riskData.rankMultiplier,
            rankReasoning: riskData.rankReasoning
        }));
    }

    startLoading();
}

function startLoading() {
    showScreen('screen-loading');

    // Simulate bomb defuse / server check animation
    let progress = 0;
    const bar = document.querySelector('.progress-bar-fill');
    const timerText = document.querySelector('.bomb-timer');

    const duration = 2500; // 2.5 seconds
    const intervalTime = 50;
    const steps = duration / intervalTime;
    const increment = 100 / steps;

    let timerMilli = 99;
    let timerSec = 2;

    const interval = setInterval(() => {
        progress += increment;
        bar.style.width = `${progress}%`;

        timerMilli -= 2;
        if (timerMilli <= 0) {
            timerMilli = 99;
            timerSec--;
        }

        // Format fake timer
        timerText.innerText = `00:00:0${Math.max(0, timerSec)}:${timerMilli.toString().padStart(2, '0')}`;

        if (progress >= 100) {
            clearInterval(interval);
            showResult();
        }
    }, intervalTime);
}

function showResult() {
    const resultBox = document.getElementById('result-box');
    const statusTitle = document.getElementById('result-status');
    const statusDesc = document.getElementById('result-desc');
    const statusPercentage = document.getElementById('result-percentage');

    // Reset classes
    resultBox.className = 'result-card';

    let theme = '';
    let title = '';
    let desc = '';

    const score = riskData.finalScore;
    const percentage = Math.min(99, Math.max(1, Math.round(score)));

    statusPercentage.innerText = `${percentage}% סיכון`;

    if (score < 40) {
        theme = 'theme-green';
        title = 'CLEAR TO ENGAGE';
        desc = "כנס גבר, מקסימום הבוט יחליף אותך. הפינג שלך יותר מסוכן מהמצב בחוץ. תביא את הניצחון!";
    } else if (score < 75) {
        theme = 'theme-yellow';
        title = 'PLAY WITH CAUTION';
        desc = "שמע, גבולי. שים אוזניות רק על חצי אוזן, תשאיר את הדלת פתוחה, ותודיע לדיסקורד שאתה עלול לדפוק להם AFK הירואי אל הממ\"ד.";
    } else {
        theme = 'theme-red';
        title = 'ABORT MISSION';
        desc = "אחי, שחרר. עדיף שתשחק מיינקראפט קריאייטיב עכשיו או סימס. הראנק שלך יתרסק ואתה תמצא את עצמך בממ\"ד עם אוזניות על הראש, בוכה גם על המצב וגם על ה-ELO.";

        // Play red audio
        if (RED_SOUND) {
            RED_SOUND.currentTime = 0;
            RED_SOUND.play().catch(e => console.log("Audio playback prevented by browser:", e));
        }
    }

    riskData.resultTheme = title;

    resultBox.classList.add(theme);
    statusTitle.innerText = title;
    statusDesc.innerText = desc;

    const gameInfoElement = document.getElementById('result-game-info');
    gameInfoElement.innerText = `המשחק שלך: ${riskData.gameName}`;

    // Set Breakdown
    const breakdownBox = document.getElementById('risk-breakdown');
    breakdownBox.innerHTML = `
        <strong style="color:white; display:block; margin-bottom:5px;">📊 איך הגענו לזה?</strong>
        <div>&bull; ${riskData.gameReasoning}</div>
        ${riskData.locationReasoning.map(reason => `<div>&bull; ${reason}</div>`).join('')}
        <div>&bull; ${riskData.rankReasoning}</div>
    `;

    renderTrendGraph();
    showScreen('screen-result');
}

let trendChartInstance = null;

function renderTrendGraph() {
    const container = document.getElementById('trend-graph-container');
    const ctx = document.getElementById('trendChart');

    // Only render if we have data to show (sum of array > 0)
    const totalBuckets = dailyHourlyBuckets.reduce((a, b) => a + b, 0);
    if (totalBuckets === 0) {
        container.style.display = 'none';
        return;
    }

    container.style.display = 'block';

    if (trendChartInstance) {
        trendChartInstance.destroy();
    }

    // Create labels for hours (00:00 to 23:00)
    const hourlyLabels = Array.from({ length: 24 }, (_, i) => `${i.toString().padStart(2, '0')}:00`);

    // Determine colors based on risk severity (green for 0, red for high, yellow for mid)
    const backgroundColors = dailyHourlyBuckets.map(count => {
        if (count === 0) return 'rgba(57, 255, 20, 0.4)'; // Greenish
        if (count > 5) return 'rgba(255, 7, 58, 0.7)'; // Reddish
        return 'rgba(255, 234, 0, 0.6)'; // Yellowish
    });

    trendChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: hourlyLabels,
            datasets: [{
                label: 'אזעקות בשעה',
                data: dailyHourlyBuckets,
                backgroundColor: backgroundColors,
                borderWidth: 0,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    titleFont: { family: 'Heebo' },
                    bodyFont: { family: 'Heebo' },
                    displayColors: false,
                    callbacks: {
                        label: function (context) {
                            return context.raw === 0 ? 'אין אזעקות - בטוח לשחק' : `${context.raw} התרעות באזור זה`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { display: false, color: 'rgba(255,255,255,0.05)' },
                    ticks: { color: 'rgba(255,255,255,0.5)', maxTicksLimit: 6 }
                },
                y: {
                    display: false,
                    beginAtZero: true
                }
            }
        }
    });
}

function copyToClipboard() {
    let resultHebrew = '';
    if (riskData.resultTheme === 'CLEAR TO ENGAGE') resultHebrew = 'ירוק 🟢';
    if (riskData.resultTheme === 'PLAY WITH CAUTION') resultHebrew = 'צהוב (אזהרה) 🟡';
    if (riskData.resultTheme === 'ABORT MISSION') resultHebrew = 'סכנה אדומה 🔴';

    const textToCopy = `[מחשבון ראנקד או ממ"ד]\nהמשחק: ${riskData.gameName}\nיצא לי '${resultHebrew}'.\n${riskData.resultTheme === 'ABORT MISSION' ? 'אני לא נכנס איתכם ל-Comp עכשיו, תמצאו פילר!' : 'יאללה אני נכנס ללובי.'}\n\n(מבוסס פיקוד העורף לייב: ${riskData.alarmsToday} אזעקות היום)\nבדקו בעצמכם: https://ranked-or-mamad.vercel.app`;

    navigator.clipboard.writeText(textToCopy).then(() => {
        const btn = document.querySelector('.discord-btn');
        const origText = btn.innerHTML;
        btn.innerText = 'הועתק! ✔️';
        setTimeout(() => {
            btn.innerHTML = origText;
        }, 2000);
    });
}

function resetApp() {
    // Reset Data
    riskData = {
        gameName: '',
        gameLengthScore: 0,
        locationScore: 0,
        rankMultiplier: 1.0,
        alarmsToday: riskData.alarmsToday, // keep the fetched alarms
        finalScore: 0,
        resultTheme: ''
    };

    // Reset UI
    document.getElementById('game-name').value = '';
    const cityInput = document.getElementById('city-name');
    if (cityInput) {
        cityInput.value = '';
        cityInput.removeAttribute('data-nafa');
        cityInput.removeAttribute('data-moatza');
    }
    document.getElementById('rank-slider').value = 5;
    updateSliderUI(5);

    if (RED_SOUND) {
        RED_SOUND.pause();
        RED_SOUND.currentTime = 0;
    }

    showScreen('screen-home');
}
