# Indian Stock Morning Advisor (Angular)

This is an Angular app scaffold focused on your use-case:
- Add Indian stocks to a watchlist.
- Generate simple BUY/SELL/HOLD signals each morning.
- Show **Top stocks to buy** at the bottom.
- Send a daily morning browser notification and allow a test notification instantly.

## Current behavior
- Watchlist is stored in browser `localStorage`.
- Signals are generated using a simple rules engine (`20-day average`, `daily momentum`, `RSI`).
- Notifications use the browser Notification API and schedule at **9:00 AM local time** while the app is active.

## Important for real production alerts
For true daily alerts even when app is closed (especially for Android), add:
1. A backend scheduler (cron/Cloud Functions) to run every market morning.
2. Real market data integration (NSE/BSE or broker API).
3. Push notifications via Firebase Cloud Messaging.
4. Convert Angular app to Android package with Capacitor.

## Run locally
```bash
npm install
npm start
```

> In this environment, npm registry access may be blocked. If install fails here, run the commands on your local machine.
