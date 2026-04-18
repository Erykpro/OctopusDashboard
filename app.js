const headlineText = document.getElementById('headline-text');
const headlineValueEl = document.getElementById('headline-value');
const headlineUnitEl = document.getElementById('headline-unit');
const chartContainer = document.getElementById('rate-chart');
const slotInfoEl = document.getElementById('slot-info');
const slotCountdownEl = document.getElementById('slot-countdown');
const refreshBtn = document.getElementById('refresh-btn');
const resetBtn = document.getElementById('reset-btn');

const TARIFF_CODE = 'E-1R-AGILE-24-10-01-M';
const PRODUCT_CODE = 'AGILE-24-10-01';

function init() {
    registerServiceWorker();
    refreshBtn?.addEventListener('click', fetchData);
    resetBtn?.addEventListener('click', resetApp);
    fetchData();
}

function resetApp() {
    localStorage.clear();

    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then(registrations => {
            registrations.forEach(reg => reg.unregister());
        });
    }

    if ('caches' in window) {
        caches.keys().then(keys => Promise.all(keys.map(key => caches.delete(key))));
    }

    location.reload();
}

async function fetchData() {
    headlineValueEl.innerText = '--';
    headlineUnitEl.innerText = 'Loading...';
    slotInfoEl.innerText = 'Querying Octopus API...';
    slotCountdownEl.innerText = '';
    chartContainer.innerHTML = '';

    try {
        const now = new Date();
        const periodFrom = new Date(now.getTime() - 60 * 60 * 1000).toISOString().split('.')[0] + 'Z';
        const periodTo = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString().split('.')[0] + 'Z';
        const ratesUrl = `https://api.octopus.energy/v1/products/${PRODUCT_CODE}/electricity-tariffs/${TARIFF_CODE}/standard-unit-rates/?period_from=${periodFrom}&period_to=${periodTo}`;

        const response = await fetch(ratesUrl);
        if (!response.ok) {
            throw new Error(`API returned ${response.status}`);
        }

        const data = await response.json();
        const rates = Array.isArray(data.results) ? data.results : [];

        if (!rates.length) {
            throw new Error('No rates returned from API');
        }

        updateUI(rates);
        scheduleNextUpdate();
    } catch (error) {
        console.error(error);
        headlineValueEl.innerText = '--';
        headlineUnitEl.innerText = 'p/kWh';
        slotInfoEl.innerText = 'Please retry or check network access.';
        slotCountdownEl.innerText = '';
        chartContainer.innerHTML = '<div class="text-sm text-gray-400">Failed to fetch Octopus pricing.</div>';
    }
}

function updateUI(rates) {
    const now = new Date();
    const sortedRates = [...rates].sort((a, b) => new Date(a.valid_from) - new Date(b.valid_from));
    const currentRate = sortedRates.find(rate => {
        const from = new Date(rate.valid_from);
        const to = new Date(rate.valid_to);
        return now >= from && now < to;
    }) || sortedRates[0];

    const cheapestWindow = findCheapestDaytime3HourSlot(sortedRates);

    headlineValueEl.innerText = currentRate.value_inc_vat.toFixed(0);
    headlineUnitEl.innerText = 'p/kWh';
    slotInfoEl.innerText = cheapestWindow.text;
    slotInfoEl.dataset.baseText = cheapestWindow.text;
    startCountdown(cheapestWindow.start);

    renderChartRates(sortedRates, now, currentRate);
}

function formatTime(isoString) {
    return new Date(isoString).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function formatSlotTime(date) {
    const minutes = date.getMinutes();
    return date.toLocaleTimeString('en-GB', {
        hour: 'numeric',
        minute: minutes === 0 ? undefined : '2-digit',
        hour12: true
    }).replace(/\s/g, '').toLowerCase();
}

function formatCountdownHours(hours) {
    return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
}

function formatCountdown(diffMs) {
    const totalMinutes = Math.floor(diffMs / (60 * 1000));

    if (totalMinutes < 60) {
        return `${totalMinutes} ${totalMinutes === 1 ? 'minute' : 'minutes'}`;
    }

    const hours = Math.floor(diffMs / (60 * 60 * 1000));
    return formatCountdownHours(hours);
}

let countdownTimer = null;

function startCountdown(startTime) {
    if (countdownTimer) {
        clearInterval(countdownTimer);
    }

    if (!startTime) {
        slotCountdownEl.innerText = '';
        return;
    }

    function updateCountdown() {
        const now = new Date();
        const diff = startTime - now;

        if (diff <= 0) {
            clearInterval(countdownTimer);
            slotCountdownEl.innerText = '';
            return;
        }

        slotCountdownEl.innerText = `In ${formatCountdown(diff)}`;
    }

    updateCountdown();
    countdownTimer = setInterval(updateCountdown, 60000);
}

function renderChartRates(rates, now, currentRate) {
    const currentIndex = rates.findIndex(rate => {
        const from = new Date(rate.valid_from);
        const to = new Date(rate.valid_to);
        return now >= from && now < to;
    });

    const currentIncluded = currentIndex !== -1;
    let chartRates;
    if (currentIncluded) {
        chartRates = rates.slice(currentIndex);
    } else {
        chartRates = rates.filter(rate => new Date(rate.valid_from) >= now);
    }

    if (!chartRates.length) {
        chartRates = rates.slice(0);
    }

    if (!chartRates.length) {
        chartContainer.innerHTML = '<div class="text-sm text-gray-400">No chart data available.</div>';
        return;
    }

    const values = chartRates.map(rate => rate.value_inc_vat);
    const maxPrice = Math.max(...values, 1);

    chartContainer.innerHTML = '';

    chartRates.forEach((rate, index) => {
        const height = Math.max(10, (rate.value_inc_vat / maxPrice) * 100);
        const colorClass = getTierClass(rate.value_inc_vat);
        const label = (currentIncluded && index === 0) ? 'NOW' : formatTime(rate.valid_from);

        const bar = document.createElement('div');
        bar.className = `relative shrink-0 rounded-t-sm z-10 ${colorClass}`;
        bar.style.height = `${height}%`;
        bar.style.width = '3.8rem';

        const labelEl = document.createElement('span');
        labelEl.className = 'absolute -bottom-6 left-1/2 transform -translate-x-1/2 text-white text-[12px] whitespace-nowrap';
        labelEl.textContent = label;
        bar.appendChild(labelEl);

        chartContainer.appendChild(bar);
    });
}

function getTierClass(price) {
    if (price <= 15.9) return 'bar-green';
    if (price <= 20) return 'bar-yellow';
    if (price <= 25) return 'bar-orange';
    return 'bar-red';
}

function findCheapestDaytime3HourSlot(rates) {
    const now = new Date();
    const daytimeRates = rates.filter(rate => {
        const from = new Date(rate.valid_from);
        const hour = from.getHours();
        return from > now && hour >= 7 && hour < 19;
    }).sort((a, b) => new Date(a.valid_from) - new Date(b.valid_from));

    let bestWindow = null;
    let bestSum = Infinity;

    for (let i = 0; i <= daytimeRates.length - 6; i++) {
        const window = daytimeRates.slice(i, i + 6);
        const windowSum = window.reduce((sum, entry) => sum + entry.value_inc_vat, 0);
        if (windowSum < bestSum) {
            bestSum = windowSum;
            bestWindow = window;
        }
    }

    if (!bestWindow) {
        return { text: 'No daytime 3h window', start: null };
    }

    const start = new Date(bestWindow[0].valid_from);
    const end = new Date(bestWindow[bestWindow.length - 1].valid_to);
    const isTomorrow = start.toDateString() !== now.toDateString();
    const slotText = `${formatSlotTime(start)} - ${formatSlotTime(end)}`;

    const text = isTomorrow
        ? `Tomorrow ${slotText}`
        : slotText;

    return { text, start };
}

function scheduleNextUpdate() {
    const now = new Date();
    const nextHalfHour = new Date(now);
    nextHalfHour.setMinutes(now.getMinutes() < 30 ? 30 : 60, 5, 0);
    const delay = nextHalfHour.getTime() - now.getTime();
    setTimeout(fetchData, delay);
}

function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').catch(err => console.error('Sw registration failed', err));
    }
}

init();
