# SolarisPredict-SL — National Grid Map & Advisory Engine Upgrade

## 0. The honest framing that makes this stronger, not weaker

CEB doesn't publish live SCADA telemetry — so don't claim literal real-time grid data. Instead: **live-weather-driven, clearly labeled as estimated, refreshing on a timer.** A judge who knows the sector will trust "estimated from live weather + published patterns, refreshed every 5 min" far more than an unlabeled "real-time" claim they can poke a hole in during Q&A. Keep the same `ForecastSourceBadges` honesty pattern you already built — extend it to every new panel.

---

## 1. New feature set (in priority order — build top-down if time runs short)

1. **National plant map** — real hydro/coal/oil/wind/solar plant locations as sized dots
2. **Dispatch advisory engine** — merit-order recommendation given forecasted net load (this is literally "helps CEB manage generation plants")
3. **Rooftop solar layer** — statistically distributed dots (not fake addresses) representing distributed capacity
4. **Live-estimate stat cards** — national generation mix, estimated current demand/solar/net
5. **Advanced statistics** — prediction intervals, rolling backtest accuracy, feature importance
6. **Sector breakdown** — industrial / commercial / domestic demand split

---

## 2. Real plant dataset

Verified names and capacities from Wikipedia's "List of power stations in Sri Lanka" and CEB's Long Term Generation Expansion Plan. **Coordinates below are town/area-level approximations from public sources, not survey-grade GPS — say this on the map itself (a small "approximate locations" caption), and spend 15 minutes cross-checking the biggest ones (Lakvijaya, Victoria, Kelanitissa) against satellite imagery before presenting to judges who may know the sites.**

```json
[
  { "name": "Lakvijaya (Norochcholai)", "type": "coal", "capacity_mw": 900, "lat": 8.0362, "lon": 79.8283, "note": "Only coal plant in the country" },
  { "name": "Kelanitissa", "type": "oil", "capacity_mw": 380, "lat": 6.950, "lon": 79.870, "note": "State-owned thermal, Colombo" },
  { "name": "Sapugaskanda", "type": "oil", "capacity_mw": 160, "lat": 6.973, "lon": 79.950, "note": "Near Kelaniya" },
  { "name": "Kerawalapitiya (West Coast Power)", "type": "oil", "capacity_mw": 300, "lat": 6.990, "lon": 79.870, "note": "Combined cycle, west coast" },
  { "name": "Uthuru Janani", "type": "oil", "capacity_mw": 24, "lat": 9.740, "lon": 80.010, "note": "Chunnakam, Jaffna peninsula" },
  { "name": "Victoria", "type": "hydro", "capacity_mw": 210, "lat": 7.231, "lon": 80.794, "note": "Largest hydro station, Mahaweli complex" },
  { "name": "Kotmale", "type": "hydro", "capacity_mw": 201, "lat": 7.052, "lon": 80.598, "note": "Mahaweli complex" },
  { "name": "Upper Kotmale", "type": "hydro", "capacity_mw": 150, "lat": 6.930, "lon": 80.660, "note": "Talawakele area" },
  { "name": "Randenigala", "type": "hydro", "capacity_mw": 126, "lat": 7.263, "lon": 80.859, "note": "Mahaweli complex" },
  { "name": "Samanalawewa", "type": "hydro", "capacity_mw": 120, "lat": 6.680, "lon": 80.750, "note": "Balangoda area" },
  { "name": "Laxapana Complex", "type": "hydro", "capacity_mw": 335, "lat": 6.870, "lon": 80.420, "note": "Old + New Laxapana + Wimalasurendra + Polpitiya combined" },
  { "name": "Kukule Ganga", "type": "hydro", "capacity_mw": 70, "lat": 6.530, "lon": 80.420, "note": "Ratnapura area" },
  { "name": "Moragahakanda", "type": "hydro", "capacity_mw": 25, "lat": 7.850, "lon": 80.720, "note": "Matale area, irrigation + power" },
  { "name": "Thambapavani", "type": "wind", "capacity_mw": 100, "lat": 8.980, "lon": 79.900, "note": "Largest wind farm, Mannar" },
  { "name": "Mampuri / Madurankuliya cluster", "type": "wind", "capacity_mw": 30, "lat": 8.120, "lon": 79.810, "note": "Puttalam wind cluster" },
  { "name": "Ambewela (Aitken Spence)", "type": "wind", "capacity_mw": 3, "lat": 6.860, "lon": 80.780, "note": "Nuwara Eliya highlands" },
  { "name": "Buruthakanda Solar Park", "type": "solar", "capacity_mw": 1.2, "lat": 6.150, "lon": 81.150, "note": "First commercial solar park, Hambantota — your uploaded IEEE paper's dataset" },
  { "name": "Welikanda Solar Park", "type": "solar", "capacity_mw": 10, "lat": 7.860, "lon": 81.050, "note": "Hayleys, largest at commissioning" },
  { "name": "Siyambalanduwa Solar Park", "type": "solar", "capacity_mw": 10, "lat": 6.850, "lon": 81.350, "note": "Moneragala area" }
]
```

---

## 3. Rooftop solar layer

Real rooftop total is documented at 750+ MW across roughly 50,000 installations — far too many to place individually and dishonest to fake individual addresses. Generate **weighted random points** instead: sample locations proportional to district population density, capped so total simulated capacity matches the published national aggregate. Label it plainly: *"Illustrative distribution — modeled from provincial population density and the published national rooftop total, not individual GPS records."* This is good practice, not a weakness — say so in the demo.

---

## 4. Cursor prompts — copy these in order

**Prompt A — plant map**
```
Add a Sri Lanka national plant map to solaris-frontend. Create data/plants.json using this exact dataset: [paste the JSON from section 2]. Build a MapPanel component using react-simple-maps with a Sri Lanka province-level TopoJSON (fetch a public Sri Lanka ADM1 boundary file — check geoBoundaries.org's Sri Lanka dataset — and vendor it into public/sri-lanka-provinces.json since we can't hotlink it at runtime). Render each plant as a dot sized by sqrt(capacity_mw) and colored by type: hydro = indigo #1B2A4A, coal = charcoal #2E2E2E, oil = clay-red #B5533C, wind = teal #2E7D6B, solar = gold #E8A33D. Add a hover tooltip showing name, type, and capacity. Add a small caption: "Locations are approximate (town-level), sourced from public records — not survey-grade GPS." Add a legend.
```

**Prompt B — rooftop layer**
```
Add a toggleable rooftop solar layer to MapPanel. Write app/rooftop_generator.py on the backend: given each province's population share (hardcode approximate 2024 census shares) and a target national rooftop total of 750 MW, generate ~400 random points weighted by population density within each province's boundary, each carrying a small capacity value (0.5-10 kW to 500 kW range, log-distributed to represent mostly small residential systems with occasional commercial rooftops) summing to the target. Expose GET /rooftop/sample. On the frontend, render these as small low-opacity gold dots beneath the main plant dots, with a legend line: "Illustrative distribution, not individual installations — see methodology."
```

**Prompt C — live-estimate stat cards + sector split**
```
Add a stat card row above the existing net-load chart: "Estimated national solar now" (sum of all zone live solar estimates), "Estimated national demand now" (sum of zone demand models scaled to national total), "Estimated net load now", and a small generation-mix donut chart (hydro/coal/oil/wind/solar shares — hardcode approximate current CEB installed-capacity shares as a static reference ring, then overlay today's live estimated solar contribution as a dynamic slice). Add a SectorBreakdown component below it splitting total demand into domestic/industrial/commercial/other using CEB's published category shares — pull the current figures from CEB's latest Statistical Digest before hardcoding, don't guess. Label every card "Estimated" in the card footer, matching the existing badge pattern.
```

**Prompt D — advanced statistics**
```
Extend app/train_solar_model.py to also fit quantile regressors (10th/50th/90th percentile) per zone using XGBoost's quantile objective, alongside the existing point-forecast model. Add GET /forecast/solar/quantiles?zone=&hours=48 returning all three bands. On the frontend, add a shaded confidence band around the solar line in NetLoadChart using the 10th/90th percentiles. Add a BacktestAccuracyPanel showing a small line chart of rolling MAE over the last 14 days of backtested predictions vs NASA POWER ground truth, refreshed from the existing /backtest endpoint. Add a FeatureImportancePanel showing each zone's top 5 XGBoost feature importances as a horizontal bar chart, to make the "advanced statistics" claim concrete rather than decorative.
```

**Prompt E — dispatch advisory engine (this is the actual differentiator)**
```
Add app/dispatch_advisor.py implementing a merit-order advisory: rank generation types by indicative marginal cost, must-run status, and ramp flexibility — hydro and wind/solar are must-run/near-zero marginal cost and dispatched first when available, coal runs as baseload with slow ramp, oil/diesel is the flexible peaking margin and most expensive, so it should be the first thing curtailed or ramped down as net load falls. Given a forecasted net-load series, output an ordered list of plain-English recommendations, e.g. "Net load falls below 50 MW at 13:00 — reduce Kerawalapitiya and Sapugaskanda oil output first; hold Lakvijaya coal at minimum stable load; no solar curtailment needed if thermal ramps down 60-90 minutes ahead of the dip." Add GET /advisory/dispatch?zone=&hours=48. On the frontend, add a DispatchAdvisoryPanel below the curtailment banner listing these recommendations as a timeline, each tagged with the plant(s) affected. Add a methodology note: "Advisory logic based on published merit-order economics (hydro/RE must-run, coal baseload, oil peaking) — not connected to CEB's actual dispatch system."
```

**Prompt F — layout integration**
```
Reorganize app/page.tsx into tabbed sections: "Forecast" (existing net-load hero chart + curtailment banner + new stat cards), "National Map" (MapPanel + rooftop toggle), "Dispatch Advisory" (DispatchAdvisoryPanel), "Methodology" (existing panel, extended with new data sources). Keep the net-load chart as the default landing tab — it's still the hero. Preserve the existing gold/indigo/clay-red palette across every new component so it reads as one product, not bolted-on features.
```

---

## 5. If you're tight on time — build in this order and stop wherever you run out

1. Dispatch advisory engine (Prompt E) — this is the actual "helps CEB manage generation" substance, highest judging value per hour spent
2. National plant map (Prompt A) — highest visual impact
3. Live-estimate stat cards (Prompt C, skip sector breakdown if rushed)
4. Prediction intervals only from Prompt D (skip backtest/feature-importance panels if rushed)
5. Rooftop layer (Prompt B) — nice-to-have, cut first if needed

A working map + advisory engine + your existing honest forecast chart is a complete, coherent story even without the rooftop layer or feature-importance panel. Don't sacrifice the net-load chart's polish to fit everything in — it's still your strongest single visual.