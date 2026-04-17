// DOM Elements
const setupView = document.getElementById('setup-view');
const dashboardView = document.getElementById('dashboard-view');
const currentPriceEl = document.getElementById('current-price');
const nextTimeEl = document.getElementById('next-time');
const nextPriceEl = document.getElementById('next-price');
const lastUpdatedEl = document.getElementById('last-updated');
const cheapestSlotEl = document.getElementById('cheapest-slot');

// Your specific Regional Agile Tariff (Region M)
const TARIFF_CODE = "E-1R-AGILE-24-10-01-M";
const PRODUCT_CODE = "AGILE-24-10-01";

// App State
let config = {
    apiKey: localStorage.getItem('octoApiKey') || ''
};

function init() {
    registerServiceWorker();
    // We no longer need the Account Number, just the API key
    if (!config.apiKey) {
        setupView.classList.remove('hidden');
        dashboardView.classList.add('hidden');
        document.body.style.backgroundColor = '#111827';
    } else {
        setupView.classList.add('hidden');
        dashboardView.classList.remove('hidden');
        dashboardView.style.display = 'flex';
        fetchData();
    }
}

document.getElementById('save-btn').addEventListener('click', () => {
    config.apiKey = document.getElementById('api-key').value.trim();
    if (!config.apiKey) return alert("Enter your API Key.");

    localStorage.setItem('octoApiKey', config.apiKey);
    init();
});

document.getElementById('reset-btn').addEventListener('click', () => {
    localStorage.clear();
    location.reload();
});

// Ensure data refreshes when the device wakes up or the tab is brought to front
document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
        console.log("Tab became visible - refreshing data.");
        fetchData();
    }
});

async function fetchData() {
    try {
        const now = new Date();
        const periodFrom = new Date(now.getTime() - (3600 * 1000)).toISOString().split('.')[0] + 'Z';
        const periodTo = new Date(now.getTime() + (86400 * 1000)).toISOString().split('.')[0] + 'Z';
        
        // Directly fetch your regional Agile prices
        const ratesUrl = `https://api.octopus.energy/v1/products/${PRODUCT_CODE}/electricity-tariffs/${TARIFF_CODE}/standard-unit-rates/?period_from=${periodFrom}&period_to=${periodTo}`;
        
        const rateRes = await fetch(ratesUrl);
        if (!rateRes.ok) throw new Error(`Rates fetch failed: HTTP ${rateRes.status}`);
        
        const rateData = await rateRes.json();
        updateUI(rateData.results);
        scheduleNextUpdate();

    } catch (error) {
        console.error(error);
        currentPriceEl.innerText = "ERR";
        currentPriceEl.style.fontSize = "8rem";
        setTimeout(fetchData, 60000); 
    }
}

function updateUI(rates) {
    const now = new Date();
    lastUpdatedEl.innerText = `Last Updated: ${now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;

    if (!rates || rates.length === 0) {
        currentPriceEl.innerText = "N/A";
        return;
    }

    const currentRateIndex = rates.findIndex(r => {
        const validFrom = new Date(r.valid_from);
        const validTo = new Date(r.valid_to); 
        return now >= validFrom && now < validTo;
    });

    if (currentRateIndex === -1) {
        currentPriceEl.innerText = "N/A";
        return;
    }

    const currentRate = rates[currentRateIndex];
    const price = currentRate.value_inc_vat;
    currentPriceEl.innerText = Math.ceil(price);
    
    const nextRate = rates[currentRateIndex - 1]; 
    if (nextRate) {
        nextTimeEl.innerText = new Date(nextRate.valid_from).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
        nextPriceEl.innerText = nextRate.value_inc_vat.toFixed(1);
    } else {
        nextTimeEl.innerText = "later";
        nextPriceEl.innerText = "TBC";
    }

    // Calculate cheapest upcoming 3-hour window
    cheapestSlotEl.innerText = findCheapestDaytime3HourSlot(rates);

    // Calculate daily average and apply dynamic colors
    const dailyAverage = calculateDailyAverage(rates);
    applyRAGStatus(price, dailyAverage);
}

function findCheapestDaytime3HourSlot(rates) {
    const now = new Date();
    
    // 1. Filter: Future rates ONLY, and strictly between 07:00 and 19:00
    const futureDaytimeRates = rates.filter(r => {
        const validFrom = new Date(r.valid_from);
        const hour = validFrom.getHours();
        return validFrom > now && hour >= 7 && hour < 19;
    });

    // 2. Sort chronologically
    futureDaytimeRates.sort((a, b) => new Date(a.valid_from) - new Date(b.valid_from));

    let minPrice = Infinity;
    let bestStartTime = null;

    // 3. Sliding Window: Check consecutive blocks of 6 slots (3 hours)
    for (let i = 0; i <= futureDaytimeRates.length - 6; i++) {
        const startSlot = new Date(futureDaytimeRates[i].valid_from);
        const endSlot = new Date(futureDaytimeRates[i + 5].valid_from);
        
        // Safety check: Ensure the 3-hour block falls on the exact same day
        if (startSlot.getDate() !== endSlot.getDate()) continue;

        let windowSum = 0;
        for (let j = 0; j < 6; j++) {
            windowSum += futureDaytimeRates[i + j].value_inc_vat;
        }

        if (windowSum < minPrice) {
            minPrice = windowSum;
            bestStartTime = startSlot;
        }
    }

    if (!bestStartTime) return "--:--";

    // 4. Format the output with AM/PM and end time
    const startTimeStr = bestStartTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase();
    
    const endTime = new Date(bestStartTime.getTime() + 3 * 60 * 60 * 1000);
    const endTimeStr = endTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase();
    
    const isTomorrow = bestStartTime.getDate() !== now.getDate();
    const prefix = isTomorrow ? `Tomorrow ${startTimeStr} - ${endTimeStr}` : `${startTimeStr} - ${endTimeStr}`;
    
    return prefix;
}

function calculateDailyAverage(rates) {
    const today = new Date().toDateString();
    
    // Filter the array to only include slots for the current calendar day
    const todaysRates = rates.filter(r => new Date(r.valid_from).toDateString() === today);
    
    // Fallback just in case the array is empty
    if (todaysRates.length === 0) return 15; 

    // Sum all the rates and divide by the number of slots
    const sum = todaysRates.reduce((acc, curr) => acc + curr.value_inc_vat, 0);
    return sum / todaysRates.length;
}

function applyRAGStatus(price, average) {
    const body = document.body;
    
    // Remove old classes
    body.classList.remove(
        'bg-blue-600', 'bg-green-500', 'bg-yellow-500', 
        'bg-orange-500', 'bg-red-600', 'bg-gray-900'
    );

    // Dynamic 5-Tier Logic
    if (price < 0) {
        body.classList.add('bg-blue-600'); // Plunge: Always blue
    } else if (price <= average * 0.8) {
        body.classList.add('bg-green-500'); // Cheap: 20% below average
    } else if (price <= average * 1.2) {
        body.classList.add('bg-yellow-500'); // Fair: Around the average
    } else if (price <= average * 1.5) {
        body.classList.add('bg-orange-500'); // High: 50% above average
    } else {
        body.classList.add('bg-red-600'); // Peak: Very expensive
    }
}

function scheduleNextUpdate() {
    const now = new Date();
    const minutes = now.getMinutes();
    const seconds = now.getSeconds();
    let minutesToNext = (minutes < 30) ? 30 - minutes : 60 - minutes;
    let msToNext = ((minutesToNext * 60) - seconds) * 1000 - now.getMilliseconds() + 5000; 
    setTimeout(fetchData, msToNext);
}

function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').catch(err => console.error("SW failed:", err));
    }
}

init();
