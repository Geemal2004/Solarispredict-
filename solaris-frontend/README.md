# SolarisPredict-SL Frontend

Next.js 14 dashboard for Sri Lankan **net-load** forecasting (demand − solar). Talks to the FastAPI backend via `NEXT_PUBLIC_API_URL`.

## Setup

```bash
cp .env.local.example .env.local
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Backend should be on `http://localhost:7860` (or set the env var to your Hugging Face Space URL).

## Deploy (Netlify)

The GitHub repo is a monorepo. Root [`netlify.toml`](../netlify.toml) sets `base = "solaris-frontend"` and runs `npm run build`.

1. Clear any custom **Publish directory** of `solaris-frontend` in the Netlify UI (the toml uses `.next` via the Next runtime).
2. Add env var **`NEXT_PUBLIC_API_URL`** = your backend URL (e.g. Hugging Face Space), no trailing slash.
3. Trigger a new deploy.

## Stack

- Next.js 14 (App Router) + TypeScript + Tailwind
- Recharts area chart (solar / demand / net load + curtailment-risk band)
- Design: sun-and-monsoon palette — gold solar, indigo demand, clay-red risk only
