# ephemeris-worker

Free Swiss Ephemeris natal chart API running on Cloudflare Workers.

**Live:** https://ephemeris.myastralshop.com  
**License:** AGPL-3.0  
**Stack:** Cloudflare Workers · Hono · swisseph-wasm · Nominatim

## API

### POST /api/chart

```
Headers: X-API-Key: <your-key>
         Content-Type: application/json

Body: {
  "date":        "1984-07-05",   // YYYY-MM-DD
  "time":        "23:00",        // HH:MM local time
  "city":        "Santiago",     // OR provide lat+lng directly
  "country":     "Chile",
  "utcOffset":   -4,             // hours from UTC
  "houseSystem": "P",            // P=Placidus K=Koch W=Whole E=Equal R=Regiomontanus
  "zodiac":      "tropical"      // or "sidereal"
}
```

### GET /api/geocode?city=Santiago&country=Chile

Resolve coordinates without calculating a chart.

### GET /health

Service health check (no auth required).

## Self-hosting

```bash
pnpm install
wrangler secret put API_SECRET   # paste a strong random secret
wrangler deploy
```

Local dev:
```bash
pnpm dev
# test: curl http://localhost:8787/health
```

## Notes

- Requires Cloudflare Workers **Paid plan** — the swisseph-wasm binary is ~2MB and the free plan has a 1MB worker size limit.
- Geocoding via Nominatim (1 req/sec). For high-volume production, cache results in KV.
- See `EPHEMERIS_WORKER_PLAN.md` for full deployment and WAF configuration instructions.
