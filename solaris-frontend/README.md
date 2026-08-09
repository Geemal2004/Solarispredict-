# SolarisPredict-SL Frontend

Next.js 14 dashboard for Sri Lankan **net-load** forecasting (demand − solar). Talks to the FastAPI backend via `NEXT_PUBLIC_API_URL`.

## Setup

```bash
cp .env.local.example .env.local
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Backend should be on `http://localhost:7860` (or set the env var to your Hugging Face Space URL).

## Stack

- Next.js 14 (App Router) + TypeScript + Tailwind
- Recharts area chart (solar / demand / net load + curtailment-risk band)
- Design: sun-and-monsoon palette — gold solar, indigo demand, clay-red risk only
