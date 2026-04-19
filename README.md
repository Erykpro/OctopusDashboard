# OCTOPUS AGILE DASHBOARD

A sleek, real-time dashboard designed for users of the **Octopus Energy Agile tariff**. This application helps you optimize your electricity usage by visualizing current and upcoming rates, allowing you to shift your heavy energy consumption to the cheapest times of the day.

Perfect for wall-mounted tablets, smart home kiosks, or quick mobile access!

## 🌟 Features

- **Real-Time Pricing:** Instantly see the current electricity rate in pence per kWh.
- **Smart Slot Finder:** Automatically calculates and displays a countdown to the cheapest continuous 3-hour daytime window (between 7 AM and 7 PM)—ideal for running the washing machine, dishwasher, or charging an EV.
- **Interactive Visual Chart:** A horizontally scrollable, color-coded bar chart (Green to Red) showing upcoming rates. Tap or swipe the chart to reveal exact prices, which auto-hide after a few seconds of inactivity.
- **Kiosk & Smart Home Ready:** Built with a dark, high-contrast UI that looks great on dedicated wall-mounted displays (optimized for Android webviews and Fully Kiosk Browser) and includes touch-optimized scrolling.
- **PWA / Offline Resilience:** Uses a Service Worker to cache essential assets so the dashboard loads instantly and gracefully handles spotty network connections.
- **Auto-Updating:** Intelligently schedules updates to fetch new data exactly when the half-hourly Agile rates change.

## 🛠 Tech Stack

- HTML / Vanilla JavaScript
- Tailwind CSS (via CDN)
- Octopus Energy Public API

<img width="1658" height="581" alt="Screenshot 2026-04-19 at 20 04 35" src="https://github.com/user-attachments/assets/9d8182db-92a7-418d-9260-54e25a9ca0d9" />
