## Run App

```bash
cd /Users/apple/Documents/fankaveTask
npm install --cache /Users/apple/Documents/fankaveTask/.npm-cache
npm start
```

Run with custom initial range (optional):

```bash
INITIAL_SCAN_DATE_GT=2026-02-09T00:00:00 \
INITIAL_SCAN_DATE_LT=2026-02-10T00:00:00 \
npm start
```

Default server port: `3000`  
Change port:

```bash
API_PORT=4000 npm start
```

## API Requests

Health:

```bash
curl http://localhost:3000/health
```

Overall stats:

```bash
curl http://localhost:3000/stats/overview
```

All player scan counts:

```bash
curl http://localhost:3000/stats/players
```
Single player scan count:

```bash
curl http://localhost:3000/stats/players/<badgeId>
```