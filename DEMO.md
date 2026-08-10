# SolarisPredict-SL — 5-Minute Demonstration

Speak like a person who built this for operators, not a pitch deck. Pause after hard numbers. Point at the UI; don’t narrate every label.

---

## Run of show

| Time | Segment | What happens |
|------|---------|--------------|
| **0:00–1:30** | Pitch video | Play Remotion `SolarisPitch` (mute OK — captions carry it; optional VO below) |
| **1:30–4:30** | Live product | Walk the running app using the script below |
| **4:30–5:00** | Close | One-sentence impact + offer Q&A |

---

## Preflight (10 minutes before)

1. Backend up (`uvicorn` on `:7860` or HF Space URL in `.env.local`).
2. Frontend: `cd solaris-frontend && npm run dev` → http://localhost:3000
3. Confirm Forecast tab loads Hambantota, 48h, no error banner.
4. Remotion studio ready if you’ll play from Studio: `cd solaris-demo && npm run dev` → open **SolarisPitch**.
   - Or render once: `npx remotion render SolarisPitch out/solaris-pitch.mp4` and play the file.
5. Browser zoom 90–100%; hide bookmarks bar; close Discord/Slack.

**Start state for live section:** Forecast tab · zone **Hambantota** · horizon **48h** · map not playing yet.

---

## Part A — Video voiceover (optional, ~1:30)

Record once if judges want audio. ~140 words. Calm, mid tempo.

> Sri Lanka’s grid hit a real crisis in February 2025 — a blackout when solar was meeting over half of national demand. Since then, curtailment spread from Sunny Sundays into holidays and weekdays. Developers say that’s costing them around two billion rupees.
>
> The bottleneck isn’t solar itself. It’s that operators can’t see *net load* — demand minus solar — far enough ahead to manage the dip with thermal plant instead of cutting renewables.
>
> Academic work here forecasts solar or demand as separate problems. Operators need them together — and a recommended action.
>
> SolarisPredict-SL is a net-load co-pilot: zone forecasts, a national plant map you can play through time, and a merit-order dispatch advisory — reduce oil first, hold coal at minimum stable, don’t curtail solar by default.
>
> Everything is labeled estimated: live weather plus published demand patterns. Not SCADA. Honest about that — so you can trust the method.

---

## Part B — Live walkthrough (~3:00)

### 1:30–1:45 · Hook (15s)

**Do:** Point at the header chips: **EST mode** and **NOT SCADA**.

**Say:**  
“Before anything else — this is estimated, not live CEB telemetry. We built it that way on purpose: public weather and published patterns, so judges and operators can poke the methodology instead of chasing a fake SCADA claim.”

### 1:45–2:30 · Forecast + advisory (45s)

**Do:**  
- Gesture at **State of grid** / Digest strip briefly.  
- Point at **Dispatch advisory** (risk LED if red).  
- Scroll to **Zone net-load forecast**. Hover solar / demand / net if tooltips help.  
- Optional: switch zone to **Colombo** for 5 seconds (“wet-zone cloud volatility”), then back to **Hambantota**.

**Say:**  
“Here’s the product idea in one chart: solar, demand, and net load on the same timeline, with a net-load risk band when the midday dip gets dangerous. The advisory above isn’t a chart decoration — it’s the first place an operator should look: what to do in the next hours.”

### 2:30–3:20 · National map (50s)

**Do:**  
- Click **National Map**.  
- Hit **Play** on the timeline. Let solar dots pulse for ~15s.  
- Toggle **rooftop** layer on, then off.  
- Mention one named plant (e.g. Lakvijaya or Buruthakanda) on hover if visible.

**Say:**  
“This is the national picture — hydro, coal, oil, wind, solar at approximate public locations. Playback ties the forecast hour to plant output estimates. Rooftop is an *illustrative* distribution from published national capacity and population shares — not fake GPS addresses. We say that on the map.”

### 3:20–4:10 · Advisory as the product (50s)

**Do:**  
- Open **Dispatch Advisory** tab (or stay on the panel if already strong).  
- Read **one** concrete recommendation aloud — plant name + MW or hold-min-stable.  
- Point at confidence if shown.

**Say:**  
“This is the differentiator. Merit-order logic: oil and diesel flex first; coal holds minimum stable; hydro conserved for the evening TOU peak; solar stays must-run when net load allows. We’re not plugged into CEB’s actual dispatch system — and we label that. The point of the demo is decision support with lead time, not pretending we own the control room.”

### 4:10–4:30 · Methodology honesty (20s)

**Do:** Click **Methodology**. Don’t scroll the whole page — land on sources / model choice.

**Say:**  
“Solar model is gradient boosting on NASA POWER history, driven at forecast time by Open-Meteo. Demand follows published calendar patterns — weekday, weekend, Poya, New Year — the same effects documented in the Jaffna load-forecasting work. Net load is the combination. That’s the gap we closed.”

### 4:30–5:00 · Close (30s)

**Do:** Return to Forecast so the chart is on screen when you finish.

**Say:**  
“So the story is simple: see the net-load dip early, ramp the expensive flexible thermal first, keep solar online when the grid can take it. Happy to take questions on data limits, zones, or the advisory rules.”

---

## If something breaks live

| Problem | Recovery line |
|---------|----------------|
| API error on forecast | “Backend cold start — retry.” Click Retry. Shift to Methodology + Map static plants. |
| Map slow | Stay on Forecast/Advisory; “Map is the spatial view of the same advisory.” |
| Blank advisory | Stay on chart: “Even without the list, the net-load risk band is the operator signal.” |
| Wrong zone cached | Switch Hambantota → Colombo → Hambantota to force reload. |

---

## Remotion commands

```bash
cd solaris-demo
npm install
npm run dev          # Studio preview — composition SolarisPitch
npm run render
# same as: npx remotion render SolarisPitch out/solaris-pitch.mp4
```

If `npm install` fails under a path with spaces, use the junction: `cd C:\Users\lakit\tmp-solaris-demo` (points at this folder).

---

## Timing check (practice once with a phone timer)

- Video ends ≤ 1:30  
- Live section lands on close by 4:30  
- Final sentence finished by 5:00  
- If running long: skip Colombo zone switch and rooftop toggle first
