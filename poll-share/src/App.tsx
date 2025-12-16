/* eslint-disable @typescript-eslint/no-explicit-any */
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

// Baseline snapshot
const LS_BASELINE_KEY = "poll-shares-baseline-v1";
const LS_BASELINE_LABEL_KEY = "poll-shares-baseline-label-v1";

// Info alert versioning
const ALERT_VERSION = "v1";
const ALERT_LS_KEY = `pollshare-alert-dismissed:${ALERT_VERSION}`;

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
const MARKER_TOLERANCE = 1;

function clampFloat(n: number, min: number, max: number) {
  if (!Number.isFinite(n)) return min;
  const v = Math.round(n * 10) / 10;
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


function sanitizeLoaded(parsed: any): Record<PartyKey, number> {
  const next: Record<PartyKey, number> = { ...ZERO };

  (Object.keys(next) as PartyKey[]).forEach((k) => {
    const val = Number(parsed?.[k]);
    next[k] = Number.isFinite(val) ? clampFloat(val, 0, 100) : 0;
  });

  const total = sumShares(next);
  if (total <= 100) return next;

  // trim overflow from "other", then from the end
  let overflow = clampFloat(total - 100, 0, 1000);

  const takeFromOther = Math.min(next.other, overflow);
  next.other = clampFloat(next.other - takeFromOther, 0, 100);
  overflow = clampFloat(overflow - takeFromOther, 0, 1000);

  for (let i = PARTIES.length - 1; i >= 0 && overflow > 0; i--) {
    const key = PARTIES[i].key;
    const take = Math.min(next[key], overflow);
    next[key] = clampFloat(next[key] - take, 0, 100);
    overflow = clampFloat(overflow - take, 0, 1000);
  }

  return next;
}

function isNearMarker(value: number) {
  return GRID_LINES.some((g) => Math.abs(value - g) <= MARKER_TOLERANCE);
}

function InfoModal({
  open,
  onClose,
  onDismissForever,
}: {
  open: boolean;
  onClose: () => void;
  onDismissForever: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative w-full max-w-lg rounded-2xl border border-zinc-800 bg-zinc-900 p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-semibold text-white">Poll-Share Mixer</div>
            <div className="mt-1 text-xs text-zinc-400">
              Snapshot → Compare → Export
            </div>
          </div>

          <button
            onClick={onClose}
            className="rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-700"
          >
            ✕
          </button>
        </div>

        <div className="mt-4 space-y-3 text-sm text-zinc-200">
          <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-3">
            <div className="font-medium">How to use</div>
            <ol className="mt-2 list-decimal space-y-2 pl-5 text-zinc-300">
              <li>Use sliders to set the live poll shares.</li>
              <li>
                Press <span className="font-semibold text-white">Snapshot</span>{" "}
                to lock a baseline (STAT A).
              </li>
              <li>
                Press <span className="font-semibold text-white">Compare</span>{" "}
                to show STAT B beside STAT A.
              </li>
              <li>
                Press <span className="font-semibold text-white">Export</span>{" "}
                to save a PNG for thumbnails/overlays.
              </li>
            </ol>
          </div>

          <div className="text-xs text-zinc-400">
            Tip: When new features ship, we’ll bump the alert version and show a new
            message automatically.
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            onClick={onClose}
            className="rounded-xl border border-zinc-700 bg-zinc-800 px-4 py-2 text-sm text-zinc-100 hover:bg-zinc-700"
          >
            Dismiss
          </button>
          <button
            onClick={onDismissForever}
            className="rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-2 text-sm text-zinc-100 hover:bg-zinc-900"
            title="Don’t show this version again"
          >
            Dismiss forever
          </button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  // Info alert (versioned)
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [showInfo, setShowInfo] = React.useState(() => {
    return localStorage.getItem(ALERT_LS_KEY) !== "true";
  });

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Export target (chart area only)
  const exportRef = React.useRef<HTMLDivElement | null>(null);

  // Shares (live)
  const [shares, setShares] = React.useState<Record<PartyKey, number>>(() => {
    const saved = localStorage.getItem(LS_KEY);
    if (!saved) return { ...ZERO };
    try {
      return sanitizeLoaded(JSON.parse(saved));
    } catch {
      return { ...ZERO };
    }
  });
  // Greeting (4s)
  const greetingAudioRef = React.useRef<HTMLAudioElement | null>(null);
  const greetTimerRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    // preload once
    greetingAudioRef.current = new Audio("/audio/greeting.mp3");
    greetingAudioRef.current.preload = "auto";

    return () => {
      if (greetTimerRef.current) window.clearTimeout(greetTimerRef.current);
      greetingAudioRef.current?.pause();
      greetingAudioRef.current = null;
    };
  }, []);

  const playGreeting = React.useCallback(async () => {
    const audio = greetingAudioRef.current;
    if (!audio) return;

    // stop any previous play
    if (greetTimerRef.current) window.clearTimeout(greetTimerRef.current);
    audio.pause();
    audio.currentTime = 0;

    try {
      await audio.play();

      // hard-stop at 4 seconds (even if the file is longer)
      greetTimerRef.current = window.setTimeout(() => {
        audio.pause();
        audio.currentTime = 0;
      }, 4000);
    } catch {
      // Most common cause: autoplay blocked if not triggered by a click/tap
      console.warn("Audio play blocked. Tap the button to allow audio.");
    }
  }, []);


  // Baseline snapshot
  const [baseline, setBaseline] = React.useState<Record<PartyKey, number> | null>(() => {
    const saved = localStorage.getItem(LS_BASELINE_KEY);
    if (!saved) return null;
    try {
      return sanitizeLoaded(JSON.parse(saved));
    } catch {
      return null;
    }
  });

  const [baselineLabel, setBaselineLabel] = React.useState<string>(() => {
    return localStorage.getItem(LS_BASELINE_LABEL_KEY) || "STAT";
  });

  const [compareOn, setCompareOn] = React.useState(false);

  const total = React.useMemo(() => sumShares(shares), [shares]);

  // Persist live
  React.useEffect(() => {
    localStorage.setItem(LS_KEY, JSON.stringify(shares));
  }, [shares]);

  // Persist baseline
  React.useEffect(() => {
    if (baseline) localStorage.setItem(LS_BASELINE_KEY, JSON.stringify(baseline));
    else localStorage.removeItem(LS_BASELINE_KEY);
  }, [baseline]);

  // Persist baseline label
  React.useEffect(() => {
    localStorage.setItem(LS_BASELINE_LABEL_KEY, baselineLabel || "STAT");
  }, [baselineLabel]);

  const dismissInfo = React.useCallback(() => setShowInfo(false), []);
  const dismissInfoForever = React.useCallback(() => {
    localStorage.setItem(ALERT_LS_KEY, "true");
    setShowInfo(false);
  }, []);

  const onExport = React.useCallback(async () => {
    const node = exportRef.current;
    if (!node) return;

    const html2canvasMod = await import("html2canvas");
    const html2canvas = html2canvasMod.default;

    // lock capture size to the export node
    const rect = node.getBoundingClientRect();
    const width = Math.ceil(rect.width);
    const height = Math.ceil(rect.height);

    const canvas = await html2canvas(node, {
      backgroundColor: "#18181b",
      scale: Math.max(2, window.devicePixelRatio || 2),
      useCORS: true,
      width,
      height,

      onclone: (doc: Document) => {
        // 1) Disable stylesheets (removes oklch)
        Array.from(doc.styleSheets).forEach((ss) => {
          try {
            (ss as CSSStyleSheet).disabled = true;
          } catch {
            // ignore
          }
        });

        // 2) Force base RGB on html/body
        const html = doc.documentElement as HTMLElement;
        const body = doc.body as HTMLElement;
        html.style.background = "rgb(24,24,27)";
        body.style.background = "rgb(24,24,27)";
        body.style.color = "rgb(244,244,245)";
        body.style.margin = "0";

        // 3) Restore JUST the utilities used inside export-root
        const style = doc.createElement("style");
        style.textContent = `
        /* sizing */
        #export-root{ box-sizing:border-box; width:${width}px; font-family:system-ui, -apple-system, Segoe UI, Roboto, Arial; }
        #export-root, #export-root *{ box-sizing:border-box; }

        /* layout utils */
        .relative{position:relative;}
        .absolute{position:absolute;}
        .pointer-events-none{pointer-events:none;}

        .inset-0{top:0;right:0;bottom:0;left:0;}
        .inset-1{top:.25rem;right:.25rem;bottom:.25rem;left:.25rem;}

        .top-0{top:0;}
        .bottom-0{bottom:0;}
        .bottom-1{bottom:.25rem;}
        .bottom-6{bottom:1.5rem;}
        .left-0{left:0;}
        .left-1{left:.25rem;}
        .right-0{right:0;}
        .right-1{right:.25rem;}
        .-top-2{top:-.5rem;}

        .w-full{width:100%;}
        .h-full{height:100%;}
        .h-28{height:7rem;}
        .h-32{height:8rem;}
        .md\\:h-32{height:8rem;}
        .overflow-hidden{overflow:hidden;}

        .flex{display:flex;}
        .items-center{align-items:center;}
        .items-end{align-items:flex-end;}
        .justify-between{justify-content:space-between;}
        .justify-end{justify-content:flex-end;}
        .gap-1{gap:.25rem;}
        .gap-2{gap:.5rem;}
        .gap-3{gap:.75rem;}
        .flex-1{flex:1 1 0%;}

        .grid{display:grid;}
        .grid-cols-7{grid-template-columns:repeat(7,minmax(0,1fr));}
        .min-w-0{min-width:0;}

        /* spacing */
        .p-1{padding:.25rem;}
        .p-2{padding:.5rem;}
        .p-3{padding:.75rem;}
        .mt-1{margin-top:.25rem;}
        .mt-2{margin-top:.5rem;}
        .mt-3{margin-top:.75rem;}
        .mx-1{margin-left:.25rem;margin-right:.25rem;}

        /* typography */
        .text-sm{font-size:.875rem; line-height:1.25rem;}
        .text-xs{font-size:.75rem; line-height:1rem;}
        .text-\\[10px\\]{font-size:10px; line-height:1rem;}
        .text-\\[11px\\]{font-size:11px; line-height:1rem;}

        .font-semibold{font-weight:600;}
        .font-medium{font-weight:500;}
        .tabular-nums{font-variant-numeric:tabular-nums;}
        .truncate{overflow:hidden; text-overflow:ellipsis; white-space:nowrap;}
        .text-center{text-align:center;}

        /* borders / radius */
        .border{border-width:1px; border-style:solid;}
        .border-t{border-top-width:1px; border-top-style:solid;}
        .rounded-xl{border-radius:.75rem;}
        .rounded-2xl{border-radius:1rem;}
        .rounded-md{border-radius:.375rem;}

        .pr-6{padding-right:1.5rem;}


        /* ---- RGB “export-safe” colors (no oklch) ---- */
        /* force text/border everywhere, but DON'T flatten bg on .bg-* (so party colors survive) */
        #export-root, #export-root *{
          color: rgb(244,244,245) !important;
          border-color: rgb(39,39,42) !important;
          box-shadow:none !important;
          text-shadow:none !important;
          filter:none !important;
          backdrop-filter:none !important;
          background-image:none !important;
        }
        #export-root,
        #export-root *:not([class*="bg-"]) {
          background-color: rgb(24,24,27) !important;
        }

        /* common surfaces you use */
        #export-root .bg-zinc-950\\/40{background:rgba(9,9,11,.4)!important;}
        #export-root .bg-zinc-800\\/60{background:rgba(39,39,42,.6)!important;}

        /* restore party bar colors */
       #export-root .bg-blue-500{background-color:rgb(59,130,246)!important; background:rgb(59,130,246)!important;}
#export-root .bg-red-500{background-color:rgb(239,68,68)!important; background:rgb(239,68,68)!important;}
#export-root .bg-orange-500{background-color:rgb(249,115,22)!important; background:rgb(249,115,22)!important;}
#export-root .bg-emerald-500{background-color:rgb(16,185,129)!important; background:rgb(16,185,129)!important;}
#export-root .bg-purple-500{background-color:rgb(168,85,247)!important; background:rgb(168,85,247)!important;}
#export-root .bg-slate-500{background-color:rgb(100,116,139)!important; background:rgb(100,116,139)!important;}
#export-root .bg-zinc-600{background-color:rgb(82,82,91)!important; background:rgb(82,82,91)!important;}

        /* missing positioning helpers used by inset-x-0 */
.inset-x-0{left:0;right:0;}
.inset-y-0{top:0;bottom:0;}

/* spacing helpers your markup uses */
.mb-3{margin-bottom:.75rem;}
.flex-col{flex-direction:column;}
.flex-wrap{flex-wrap:wrap;}
.gap-x-4{column-gap:1rem;}
.gap-y-2{row-gap:.5rem;}

/* little blocks in legend */
.inline-block{display:inline-block;}
.h-2{height:.5rem;}
.w-2{width:.5rem;}
.h-2.5{height:.625rem;}
.w-2.5{width:.625rem;}

/* responsive typography helpers */
.md\\:text-xs{font-size:.75rem; line-height:1rem;}
.md\\:text-sm{font-size:.875rem; line-height:1.25rem;}

/* give the bars row some breathing room (even if JSX doesn't have mb-3) */
#export-root .grid.grid-cols-7{ margin-bottom:.75rem; }

      `;
        doc.head.appendChild(style);
      },
    });

    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const filename = `poll-share-${stamp}.png`;

    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
    }, "image/png");
  }, []);



  const maxFor = React.useCallback(
    (target: PartyKey) => {
      const others = sumOthers(shares, target);
      return clampFloat(100 - others, 0, 100);
    },
    [shares]
  );

  // Setter (float, 0.1)
  const setParty = React.useCallback((target: PartyKey, raw: number) => {
    setShares((prev) => {
      const others = sumOthers(prev, target);
      const max = Math.max(0, 100 - others);
      const nextVal = clampFloat(raw, 0, max);

      const next = { ...prev, [target]: nextVal };

      // Final safety: never overflow
      const t = sumShares(next);
      if (t > 100) {
        const overflow = t - 100;
        next[target] = clampFloat(next[target] - overflow, 0, 100);
      }

      return next;
    });
  }, []);

  const resetAll = React.useCallback(() => setShares({ ...ZERO }), []);

  // Normalize button: scales current values so total becomes exactly 100%
  const normalizeTo100 = React.useCallback(() => {
    setShares((prev) => {
      const sum = sumShares(prev);
      if (sum === 0) return prev;

      const scaled: Record<PartyKey, number> = { ...ZERO };
      let accum = 0;

      PARTIES.forEach((p, i) => {
        if (i < PARTIES.length - 1) {
          const v = clampFloat((prev[p.key] / sum) * 100, 0, 100);
          scaled[p.key] = v;
          accum = clampFloat(accum + v, 0, 200);
        } else {
          scaled[p.key] = clampFloat(100 - accum, 0, 100);
        }
      });

      return sanitizeLoaded(scaled);
    });
  }, []);

  const snapshotBaseline = React.useCallback(() => {
    setBaseline(sanitizeLoaded(shares));
    setCompareOn(true);
  }, [shares]);

  const clearBaseline = React.useCallback(() => {
    setBaseline(null);
    setCompareOn(false);
  }, []);

  return (
    <div className="min-h-screen px-4 md:px-8 pt-0 bg-zinc-900 text-zinc-100">
      <div className="mx-auto max-w-5xl">
        {/* Sticky mixer */}
        <div className="sticky top-0 z-50 -mx-4 md:-mx-8 px-4 md:px-8 py-3 bg-zinc-950/80 backdrop-blur border-b border-zinc-800">
          {/* Anchor for absolute stripe */}
          <div className="relative ">
            {/* Canada stripe */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-linear-to-r from-red-600 via-white to-blue-600" />

            <div className="space-y-3 pt-2">
              <header className="flex items-start justify-between gap-3">
                <div className="flex flex-col">
                  <h1 className="mt-1 text-xl md:text-2xl font-semibold tracking-tight text-white">
                    Canada Poll Share Mixer
                  </h1>

                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs md:text-sm text-zinc-400">
                      The National Telegraph • Wyatt Claypool
                    </span>

                    {baseline ? (
                      <span className="text-[11px] md:text-xs px-2 py-1 rounded-full border border-zinc-700 bg-zinc-900/60 text-zinc-200">
                        Baseline: <strong className="ml-1">{baselineLabel || "STAT"}</strong>
                      </span>
                    ) : (
                      <span className="text-[11px] md:text-xs px-2 py-1 rounded-full border border-zinc-800 bg-zinc-900/40 text-zinc-500">
                        No baseline saved
                      </span>
                    )}
                  </div>
                </div>

                <div className="hidden md:flex gap-2 shrink-0 flex-wrap justify-end">
                  <button
                    onClick={playGreeting}
                    className="rounded-xl px-3 py-2 text-sm bg-zinc-800 hover:bg-zinc-700 border border-zinc-700"
                    title="Play greeting"
                  >
                    Greeting
                  </button>

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

                  <button
                    onClick={snapshotBaseline}
                    className="rounded-xl px-3 py-2 text-sm bg-zinc-800 hover:bg-zinc-700 border border-zinc-700"
                    title="Save a baseline snapshot of the current chart"
                  >
                    Snapshot
                  </button>

                  <button
                    onClick={() => setCompareOn((v) => !v)}
                    disabled={!baseline}
                    className={[
                      "rounded-xl px-3 py-2 text-sm border",
                      baseline
                        ? compareOn
                          ? "bg-blue-600/30 border-blue-500/60 hover:bg-blue-600/40"
                          : "bg-zinc-800 hover:bg-zinc-700 border-zinc-700"
                        : "bg-zinc-900 border-zinc-800 text-zinc-600 cursor-not-allowed",
                    ].join(" ")}
                    title={baseline ? "Toggle comparison view" : "Take a snapshot first"}
                  >
                    Compare
                  </button>

                  {baseline && (
                    <button
                      onClick={clearBaseline}
                      className="rounded-xl px-3 py-2 text-sm bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300"
                      title="Remove baseline snapshot"
                    >
                      Clear
                    </button>
                  )}

                  <button
                    onClick={onExport}
                    className="rounded-xl px-3 py-2 text-sm bg-zinc-800 hover:bg-zinc-700 border border-zinc-700"
                    title="Export chart as PNG"
                  >
                    Export
                  </button>

                  <button
                    onClick={() => setShowInfo(true)}
                    className="rounded-xl px-3 py-2 text-sm bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300"
                    title="How this works"
                  >
                    Info
                  </button>
                </div>
                {/* Mobile controls */}
                <div className="flex md:hidden items-center gap-2">
                  <button
                    onClick={() => setShowInfo(true)}
                    className="rounded-xl px-3 py-2 text-sm bg-zinc-800 hover:bg-zinc-700 border border-zinc-700"
                    title="How this works"
                  >
                    Info
                  </button>

                  <button
                    onClick={() => setMenuOpen(true)}
                    className="rounded-xl px-3 py-2 text-sm bg-zinc-800 hover:bg-zinc-700 border border-zinc-700"
                    aria-label="Open menu"
                  >
                    ☰
                  </button>
                </div>

              </header>

              {/* Mobile menu drawer */}
              {menuOpen && (
                <div className="md:hidden fixed inset-0 z-90">
                  <button
                    className="absolute inset-0 bg-black/60"
                    onClick={() => setMenuOpen(false)}
                    aria-label="Close menu"
                  />

                  <div className="absolute right-0 top-0 h-full w-[320px] max-w-[85vw] bg-zinc-950 border-l border-zinc-800 p-4 overflow-y-auto">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-semibold text-white">Menu</div>
                      <button
                        onClick={() => setMenuOpen(false)}
                        className="rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-700"
                      >
                        ✕
                      </button>
                    </div>

                    <div className="mt-4 space-y-2">
                      <button onClick={playGreeting} className="w-full rounded-xl px-3 py-2 text-sm bg-zinc-800 hover:bg-zinc-700 border border-zinc-700">Greeting</button>
                      <button onClick={resetAll} className="w-full rounded-xl px-3 py-2 text-sm bg-zinc-800 hover:bg-zinc-700 border border-zinc-700">Reset</button>
                      <button onClick={normalizeTo100} className="w-full rounded-xl px-3 py-2 text-sm bg-zinc-800 hover:bg-zinc-700 border border-zinc-700">Normalize</button>
                      <button onClick={snapshotBaseline} className="w-full rounded-xl px-3 py-2 text-sm bg-zinc-800 hover:bg-zinc-700 border border-zinc-700">Snapshot</button>

                      <button
                        onClick={() => setCompareOn((v) => !v)}
                        disabled={!baseline}
                        className={[
                          "w-full rounded-xl px-3 py-2 text-sm border",
                          baseline
                            ? compareOn
                              ? "bg-blue-600/30 border-blue-500/60 hover:bg-blue-600/40"
                              : "bg-zinc-800 hover:bg-zinc-700 border-zinc-700"
                            : "bg-zinc-900 border-zinc-800 text-zinc-600 cursor-not-allowed",
                        ].join(" ")}
                      >
                        Compare
                      </button>

                      {baseline && (
                        <button onClick={clearBaseline} className="w-full rounded-xl px-3 py-2 text-sm bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300">
                          Clear
                        </button>
                      )}

                      <button onClick={onExport} className="w-full rounded-xl px-3 py-2 text-sm bg-zinc-800 hover:bg-zinc-700 border border-zinc-700">Export</button>
                      <button onClick={() => setShowInfo(true)} className="w-full rounded-xl px-3 py-2 text-sm bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300">Info</button>
                    </div>
                  </div>
                </div>
              )}


              {/* baseline label input */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-zinc-500">Baseline label:</span>
                <input
                  value={baselineLabel}
                  onChange={(e) => setBaselineLabel(e.target.value)}
                  placeholder="STAT"
                  className="h-8 w-36 rounded-lg border border-zinc-800 bg-zinc-900/60 px-2 text-sm text-zinc-100 placeholder:text-zinc-600 outline-none focus:ring-2 focus:ring-blue-500/40"
                />
                <span className="text-[11px] text-zinc-600">(Snapshot uses this label)</span>
              </div>

              {/* Total + Chart (export this area only) */}
              <div
                id="export-root"
                ref={exportRef}
                className="export-safe rounded-2xl border border-zinc-800 bg-zinc-900 p-2 md:p-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm text-zinc-400">
                    Total{" "}
                    {compareOn && baseline ? (
                      <span className="text-xs text-zinc-500">
                        • comparing “{baselineLabel || "STAT"}” vs Live
                      </span>
                    ) : null}
                  </span>

                  <span className={`font-semibold ${total === 100 ? "text-emerald-400" : "text-red-400"}`}>
                    {total.toFixed(1)}%{" "}
                    {total < 100 ? `(Remaining: ${(100 - total).toFixed(1)}%)` : ""}
                  </span>
                </div>

                {/* Chart */}
                <div className="mt-2 rounded-xl border border-zinc-800 bg-zinc-950/40 p-2">
                  <div className="relative pr-6">
                    {/* gridlines */}
                    <div className="pointer-events-none absolute inset-x-0 top-0 bottom-6">
                      {GRID_LINES.map((g) => (
                        <div
                          key={g}
                          className="absolute left-0 right-0 border-t border-zinc-700/40"
                          style={{ bottom: `${g}%` }}
                        >
                          <span className="gridline-label absolute -top-2 right-0 text-[10px] text-zinc-500">
  {g}%
</span>
                        </div>
                      ))}
                    </div>

                    {/* bars */}
                    <div className="grid grid-cols-7 gap-2">
                      {PARTIES.map((p) => {
                        const live = shares[p.key];
                        const base = baseline?.[p.key] ?? 0;

                        const liveHit = isNearMarker(live);
                        const baseHit = isNearMarker(base);

                        const showCompare = compareOn && !!baseline;

                        return (
                          <div key={p.key} className="min-w-0">
                            <div className="relative h-28 md:h-32 w-full rounded-xl bg-zinc-800/60 overflow-hidden border border-zinc-800 p-1">
                              {showCompare ? (
                                <div className="absolute inset-1 flex items-end gap-1">
                                  {/* baseline */}
                                  <div className="relative flex-1 h-full">
                                    <div
                                      className={[
                                        p.color,
                                        "absolute bottom-0 left-0 w-full rounded-md",
                                        "transition-[height] duration-300 ease-out",
                                        baseHit ? "brightness-110" : "",
                                      ].join(" ")}
                                      style={{
                                        height: `${base}%`,
                                        opacity: 0.35,
                                        boxShadow: baseHit
                                          ? "0 0 18px rgba(255,255,255,0.18)"
                                          : undefined,
                                      }}
                                      title={`${baselineLabel || "STAT"} • ${p.label}: ${base.toFixed(1)}%`}
                                    />
                                  </div>

                                  {/* live */}
                                  <div className="relative flex-1 h-full">
                                    <div
                                      className={[
                                        p.color,
                                        "absolute bottom-0 left-0 w-full rounded-md",
                                        "transition-[height] duration-300 ease-out",
                                        liveHit ? "brightness-110" : "",
                                      ].join(" ")}
                                      style={{
                                        height: `${live}%`,
                                        boxShadow: liveHit
                                          ? "0 0 18px rgba(255,255,255,0.25)"
                                          : undefined,
                                      }}
                                      title={`Live • ${p.label}: ${live.toFixed(1)}%`}
                                    />
                                  </div>
                                </div>
                              ) : (
                                <div
                                  className={[
                                    p.color,
                                    "absolute bottom-1 left-1 right-1 rounded-md",
                                    "transition-[height] duration-300 ease-out",
                                    liveHit ? "brightness-110" : "",
                                  ].join(" ")}
                                  style={{
                                    height: `${live}%`,
                                    boxShadow: liveHit
                                      ? "0 0 18px rgba(255,255,255,0.25)"
                                      : undefined,
                                  }}
                                  title={`${p.label}: ${live.toFixed(1)}%`}
                                />
                              )}
                            </div>

                            <div className="mt-1 text-center">
                              <div className="text-[11px] md:text-xs font-medium text-zinc-200 truncate">
                                {p.label}
                              </div>

                              {compareOn && baseline ? (
                                <div className="text-[11px] tabular-nums text-zinc-400">
                                  <span className={baseHit ? "text-emerald-300" : ""}>
                                    {base.toFixed(1)}%
                                  </span>
                                  <span className="mx-1 text-zinc-600">|</span>
                                  <span className={liveHit ? "text-emerald-300" : ""}>
                                    {live.toFixed(1)}%
                                  </span>
                                </div>
                              ) : (
                                <div
                                  className={`text-[11px] tabular-nums ${liveHit ? "text-emerald-300" : "text-zinc-400"
                                    }`}
                                >
                                  {live.toFixed(1)}%
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="mt-2 flex items-center justify-between text-[11px] text-zinc-500">
                      <span>0%</span>
                      <span>100%</span>
                    </div>

                    {compareOn && baseline ? (
                      <div className="mt-2 flex items-center justify-end gap-3 text-[11px] text-zinc-500">
                        <span className="flex items-center gap-2">
                          <span className="inline-block h-2 w-2 rounded bg-white/30" />
                          {baselineLabel || "STAT"}
                        </span>
                        <span className="flex items-center gap-2">
                          <span className="inline-block h-2 w-2 rounded bg-white/70" />
                          Live
                        </span>
                      </div>
                    ) : null}
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
        </div>

        {/* Sliders: page scrolls normally; mixer stays sticky */}
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

      <InfoModal open={showInfo} onClose={dismissInfo} onDismissForever={dismissInfoForever} />
    </div>
  );
}
