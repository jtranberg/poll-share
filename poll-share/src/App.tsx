import React from "react";

type PartyKey = "cpc" | "lib" | "ndp" | "green" | "ppc" | "ind" | "other";

type Party = {
  key: PartyKey;
  label: string;
  color: string; // Tailwind bg color class
};

const PARTIES: Party[] = [
  { key: "cpc", label: "CPC", color: "bg-blue-500" },
  { key: "lib", label: "LIB", color: "bg-red-500" },
  { key: "ndp", label: "NDP", color: "bg-orange-500" },
  { key: "green", label: "Green", color: "bg-emerald-500" },
  { key: "ppc", label: "PPC", color: "bg-purple-500" },
  { key: "ind", label: "IND", color: "bg-slate-500" },
  { key: "other", label: "Other", color: "bg-zinc-600" },
];

const LS_KEY = "poll-shares-v1";

const ZERO: Record<PartyKey, number> = {
  cpc: 0,
  lib: 0,
  ndp: 0,
  green: 0,
  ppc: 0,
  ind: 0,
  other: 0,
};

const GRID_LINES = [25, 50, 75, 100] as const;
const MARKER_TOLERANCE = 1; // glow when within ±1%

function clampFloat(n: number, min: number, max: number) {
  if (!Number.isFinite(n)) return min;
  const v = Math.round(n * 10) / 10; // one decimal
  return Math.max(min, Math.min(max, v));
}

function sumShares(s: Record<PartyKey, number>) {
  return (Object.values(s) as number[]).reduce((a, b) => a + b, 0);
}

function sumOthers(s: Record<PartyKey, number>, target: PartyKey) {
  let total = 0;
  (Object.keys(s) as PartyKey[]).forEach((k) => {
    if (k !== target) total += s[k];
  });
  return total;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function sanitizeLoaded(parsed: any): Record<PartyKey, number> {
  const next: Record<PartyKey, number> = { ...ZERO };

  (Object.keys(next) as PartyKey[]).forEach((k) => {
    const val = Number(parsed?.[k]);
    next[k] = Number.isFinite(val) ? clampFloat(val, 0, 100) : 0;
  });

  // Ensure total <= 100 (trim overflow from "other", then from end)
  const total = sumShares(next);
  if (total <= 100) return next;

  let overflow = total - 100;

  const takeFromOther = Math.min(next.other, overflow);
  next.other = clampFloat(next.other - takeFromOther, 0, 100);
  overflow = clampFloat(overflow - takeFromOther, 0, 100);

  for (let i = PARTIES.length - 1; i >= 0 && overflow > 0; i--) {
    const key = PARTIES[i].key;
    const take = Math.min(next[key], overflow);
    next[key] = clampFloat(next[key] - take, 0, 100);
    overflow = clampFloat(overflow - take, 0, 100);
  }

  return next;
}

function isNearMarker(value: number) {
  return GRID_LINES.some((g) => Math.abs(value - g) <= MARKER_TOLERANCE);
}

export default function App() {
  const [shares, setShares] = React.useState<Record<PartyKey, number>>(() => {
    const saved = localStorage.getItem(LS_KEY);
    if (!saved) return { ...ZERO };

    try {
      const parsed = JSON.parse(saved);
      return sanitizeLoaded(parsed);
    } catch (err) {
      console.warn("Invalid saved poll data, using defaults.", err);
      return { ...ZERO };
    }
  });

  const total = React.useMemo(() => clampFloat(sumShares(shares), 0, 100), [shares]);

  React.useEffect(() => {
    localStorage.setItem(LS_KEY, JSON.stringify(shares));
  }, [shares]);

  const maxFor = React.useCallback(
    (target: PartyKey) => {
      const others = sumOthers(shares, target);
      return clampFloat(Math.max(0, 100 - others), 0, 100);
    },
    [shares]
  );

  // Belt + suspenders setter (0.1 precision)
  const setParty = React.useCallback((target: PartyKey, raw: number) => {
    setShares((prev) => {
      const others = sumOthers(prev, target);
      const max = clampFloat(Math.max(0, 100 - others), 0, 100);
      const nextVal = clampFloat(raw, 0, max);

      const next = { ...prev, [target]: nextVal };

      // final safety: never allow overflow
      const t = sumShares(next);
      if (t > 100) {
        const overflow = clampFloat(t - 100, 0, 100);
        next[target] = clampFloat(next[target] - overflow, 0, max);
      }

      return next;
    });
  }, []);

  const resetAll = React.useCallback(() => setShares({ ...ZERO }), []);

  const normalizeTo100 = React.useCallback(() => {
    setShares((prev) => {
      const sum = sumShares(prev);
      if (sum === 0) return prev;

      const scaled: Record<PartyKey, number> = { ...ZERO };
      let accum = 0;

      PARTIES.forEach((p, i) => {
        if (i < PARTIES.length - 1) {
          const v = Math.round(((prev[p.key] / sum) * 100) * 10) / 10; // 1 decimal
          scaled[p.key] = clampFloat(v, 0, 100);
          accum = clampFloat(accum + scaled[p.key], 0, 100);
        } else {
          // remainder to last so total is exactly 100.0
          scaled[p.key] = clampFloat(Math.round((100 - accum) * 10) / 10, 0, 100);
        }
      });

      return sanitizeLoaded(scaled);
    });
  }, []);

  return (
    <div className="min-h-screen px-4 md:px-8 pt-0 bg-linear-to-b from-zinc-800 via-zinc-850 to-zinc-950 text-zinc-100">

      <div className="mx-auto max-w-5xl">
        {/* Sticky top */}
        <div className="sticky top-0 z-50 -mx-4 md:-mx-8 px-4 md:px-8 py-3 bg-zinc-950/80 backdrop-blur border-b border-zinc-800">
          {/* Stripe overlay (doesn't affect layout / no sticky jump) */}
          <div className="pointer-events-none absolute left-0 right-0 top-0 h-4 bg-linear-to-r from-red-600 via-white to-blue-600" />

          <div className="space-y-3">
            <header className="flex items-center justify-between gap-3">
              <div className="flex flex-col">
                <h1 className="mt-2 text-xl md:text-2xl font-semibold tracking-tight text-white">
                  Canada Poll Share Mixer
                </h1>
                <div className="flex items-center gap-2 text-xs md:text-sm text-zinc-400">
                  <span>The National Telegraph • Wyatt Claypool</span>
                  <img
                    src="/maple-leaf.jpg"
                    alt="Canada"
                    className="h-4 w-4 opacity-80"
                  />
                </div>

              </div>

              <div className="flex gap-2 shrink-0">
                <button
                  onClick={resetAll}
                  className="rounded-xl px-3 py-2 text-sm bg-zinc-800 hover:bg-zinc-700 border border-zinc-700"
                >
                  Reset
                </button>
                <button
                  onClick={normalizeTo100}
                  className="rounded-xl px-3 py-2 text-sm bg-zinc-800 hover:bg-zinc-700 border border-zinc-700"
                  title="Scale current values so the total becomes 100.0%"
                >
                  Normalize
                </button>
              </div>
            </header>

            {/* Compact Total + Chart */}
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-2 md:p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-zinc-400">Total</span>
                <span
                  className={`font-semibold ${total === 100 ? "text-emerald-400" : "text-red-400"
                    }`}
                >
                  {total.toFixed(1)}%
                  {total < 100 ? ` (Remaining: ${(100 - total).toFixed(1)}%)` : ""}
                </span>
              </div>

              {/* Chart */}
              <div className="mt-2 rounded-xl border border-zinc-800 bg-zinc-950/40 p-2">
                <div className="relative">
                  {/* gridlines */}
                  <div className="pointer-events-none absolute inset-x-0 top-0 bottom-6">
                    {GRID_LINES.map((g) => (
                      <div
                        key={g}
                        className="absolute left-0 right-0 border-t border-zinc-700/40"
                        style={{ bottom: `${g}%` }}
                      >
                        <span className="absolute -top-2 right-0 text-[10px] text-zinc-500">
                          {g}%
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* bars */}
                  <div className="grid grid-cols-7 gap-2">
                    {PARTIES.map((p) => {
                      const v = shares[p.key];
                      const hitsMarker = isNearMarker(v);

                      return (
                        <div key={p.key} className="min-w-0">
                          <div className="relative h-28 md:h-32 w-full rounded-xl bg-zinc-800/60 overflow-hidden border border-zinc-800">
                            <div
                              className={[
                                p.color,
                                "absolute bottom-0 left-0 w-full",
                                "transition-[height] duration-300 ease-out",
                                hitsMarker ? "brightness-110" : "",
                              ].join(" ")}
                              style={{
                                height: `${v}%`,
                                boxShadow: hitsMarker ? "0 0 18px rgba(255,255,255,0.25)" : undefined,
                              }}
                              title={`${p.label}: ${v.toFixed(1)}%`}
                            />
                            <div
                              className="absolute left-0 w-full h-1 bg-white/10"
                              style={{ bottom: `calc(${v}% - 1px)` }}
                            />
                          </div>

                          <div className="mt-1 text-center">
                            <div className="text-[11px] md:text-xs font-medium text-zinc-200 truncate">
                              {p.label}
                            </div>
                            <div
                              className={`text-[11px] tabular-nums ${hitsMarker ? "text-emerald-300" : "text-zinc-400"
                                }`}
                            >
                              {v.toFixed(1)}%
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-2 flex items-center justify-between text-[11px] text-zinc-500">
                    <span>0%</span>
                    <span>100%</span>
                  </div>
                </div>
              </div>

              {/* Legend */}
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-zinc-300">
                {PARTIES.map((p) => (
                  <div key={p.key} className="flex items-center gap-2">
                    <span className={`inline-block h-2.5 w-2.5 rounded ${p.color}`} />
                    <span className="tabular-nums">
                      {p.label}: <strong>{shares[p.key].toFixed(1)}%</strong>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Sliders (page scrolls normally) */}
        <div className="mt-4 space-y-4 pb-10">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 md:p-8 space-y-6">
            {PARTIES.map((p) => {
              const max = maxFor(p.key);
              return (
                <div key={p.key} className="space-y-3 py-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`inline-block h-3 w-3 rounded ${p.color}`} />
                      <span className="font-medium">{p.label}</span>
                    </div>
                    <span className="tabular-nums text-sm text-zinc-300">
                      {shares[p.key].toFixed(1)}%
                    </span>
                  </div>

                  <input
                    aria-label={`${p.label} share`}
                    type="range"
                    min={0}
                    max={max}
                    step={0.1}
                    value={shares[p.key]}
                    onChange={(e) => setParty(p.key, Number(e.target.value))}
                    className="w-full accent-blue-500"
                  />

                  <div className="flex justify-between text-xs text-zinc-400">
                    <span>0%</span>
                    <span>Max: {max.toFixed(1)}%</span>
                  </div>
                </div>
              );
            })}
          </div>

          <footer className="text-center text-xs text-zinc-500 space-y-1">
            <div>© {new Date().getFullYear()} The National Telegraph — Wyatt Claypool</div>
            <div className="text-[11px] text-zinc-600">
              Tool design &amp; engineering by Jay Tranberg
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}
