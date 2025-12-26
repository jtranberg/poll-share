/* eslint-disable @typescript-eslint/no-explicit-any */
import React from "react";
import "./index.css";
import paddle from "/paddle.png";

type Category = {
  id: string;
  label: string;
  color: string; // hex/rgb
};

type Poll = {
  id: string;
  title: string;
  categories: Category[];
};

// --- Storage keys (v1) ---
const LS_POLLS_KEY = "pollshare-polls-v1";
const LS_ACTIVE_POLL_KEY = "pollshare-active-poll-v1";

function sharesKey(pollId: string) {
  return `poll:${pollId}:shares:v1`;
}
function baselineKey(pollId: string) {
  return `poll:${pollId}:baseline:v1`;
}
function baselineLabelKey(pollId: string) {
  return `poll:${pollId}:baselineLabel:v1`;
}

// Info alert versioning (global)
const ALERT_VERSION = "v1";
const ALERT_LS_KEY = `pollshare-alert-dismissed:${ALERT_VERSION}`;

// Chart helpers
const GRID_LINES = [25, 50, 75, 100] as const;
const MARKER_TOLERANCE = 1;

function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function clampFloat(n: number, min: number, max: number) {
  if (!Number.isFinite(n)) return min;
  const v = Math.round(n * 10) / 10;
  return Math.max(min, Math.min(max, v));
}

function safeColor(c?: string) {
  const v = (c || "").trim();
  return v ? v : "#64748b";
}

function withAlpha(hexOrColor: string, alpha: number) {
  const raw = (hexOrColor || "").trim();
  const h = raw.startsWith("#") ? raw.slice(1) : raw;

  // #RGB
  if (/^[0-9a-fA-F]{3}$/.test(h)) {
    const r = parseInt(h[0] + h[0], 16);
    const g = parseInt(h[1] + h[1], 16);
    const b = parseInt(h[2] + h[2], 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  // #RRGGBB
  if (/^[0-9a-fA-F]{6}$/.test(h)) {
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  // Non-hex: keep as-is (opacity handled elsewhere if needed)
  return raw || `rgba(100,116,139,${alpha})`;
}

function buildZero(categories: Category[]) {
  const z: Record<string, number> = {};
  categories.forEach((c) => (z[c.id] = 0));
  return z;
}

function sumShares(s: Record<string, number>) {
  return Object.values(s).reduce((a, b) => a + b, 0);
}

function sumOthers(s: Record<string, number>, targetId: string) {
  let total = 0;
  Object.keys(s).forEach((k) => {
    if (k !== targetId) total += s[k] || 0;
  });
  return total;
}

function sanitizeLoaded(parsed: any, categories: Category[]): Record<string, number> {
  const next = buildZero(categories);

  categories.forEach((c) => {
    const val = Number(parsed?.[c.id]);
    next[c.id] = Number.isFinite(val) ? clampFloat(val, 0, 100) : 0;
  });

  const total = sumShares(next);
  if (total <= 100) return next;

  // trim overflow from last category backward
  let overflow = clampFloat(total - 100, 0, 1000);
  for (let i = categories.length - 1; i >= 0 && overflow > 0; i--) {
    const id = categories[i].id;
    const take = Math.min(next[id], overflow);
    next[id] = clampFloat(next[id] - take, 0, 100);
    overflow = clampFloat(overflow - take, 0, 1000);
  }

  return next;
}

function isNearMarker(value: number) {
  return GRID_LINES.some((g) => Math.abs(value - g) <= MARKER_TOLERANCE);
}

// Default poll (your Canada one)
const DEFAULT_POLL: Poll = {
  id: "canada-default",
  title: "Canada Poll Share Mixer",
  categories: [
    { id: "cpc", label: "CPC", color: "#3b82f6" },
    { id: "lib", label: "LIB", color: "#ef4444" },
    { id: "ndp", label: "NDP", color: "#f97316" },
    { id: "green", label: "Green", color: "#10b981" },
    { id: "ppc", label: "PPC", color: "#a855f7" },
    { id: "ind", label: "IND", color: "#64748b" },
    { id: "other", label: "Other", color: "#52525b" },
  ],
};

const FALLBACK_COLORS = ["#3b82f6", "#ef4444", "#f97316", "#10b981", "#a855f7", "#64748b", "#52525b"];

function normalizePolls(input: any): Poll[] {
  const raw: any[] = Array.isArray(input) ? input : [];
  const base = raw.length ? raw : [DEFAULT_POLL];

  return base.map((p, pi) => {
    const cats = Array.isArray(p?.categories) ? p.categories : [];
    const fixedCats: Category[] = cats.map((c: any, ci: number) => ({
      id: String(c?.id || uid()),
      label: String((c?.label || `Option ${ci + 1}`).trim()),
      color: safeColor(c?.color || FALLBACK_COLORS[(ci + pi) % FALLBACK_COLORS.length]),
    }));

    if (fixedCats.length < 2) {
      fixedCats.push(
        { id: uid(), label: "Option A", color: FALLBACK_COLORS[0] },
        { id: uid(), label: "Option B", color: FALLBACK_COLORS[1] }
      );
    }

    return {
      id: String(p?.id || uid()),
      title: String((p?.title || "Untitled Poll").trim()),
      categories: fixedCats,
    };
  });
}

/** NO inline styles: set CSS variables via ref */
function useCssVars(ref: React.RefObject<HTMLElement>, vars: Record<string, string>) {
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    for (const [k, v] of Object.entries(vars)) el.style.setProperty(k, v);
  }, [ref, vars]);
}

function Dot({ color }: { color: string }) {
  const r = React.useRef<HTMLSpanElement | null>(null);
  const c = safeColor(color);

  const vars = React.useMemo(() => ({ "--ps-color": c }), [c]);
  useCssVars(r as any, vars);

  return <span ref={r} className="ps-dot" />;
}

function Bar({
  kind,
  height,
  color,
  hit,
  title,
}: {
  kind: "baseline" | "live" | "single";
  height: number;
  color: string;
  hit: boolean;
  title: string;
}) {
  const r = React.useRef<HTMLDivElement | null>(null);

  const h = `${clampFloat(height, 0, 100)}%`;
  const c = safeColor(color);
  const dim = withAlpha(c, 0.35);

  const vars = React.useMemo(
    () => ({
      "--ps-h": h,
      "--ps-color": c,
      "--ps-color-dim": dim,
    }),
    [h, c, dim]
  );

  useCssVars(r as any, vars);

  const cls =
    kind === "baseline"
      ? `ps-bar ps-baseline ${hit ? "ps-hit" : ""}`
      : kind === "single"
      ? `ps-bar ps-single ${hit ? "ps-hit" : ""}`
      : `ps-bar ${hit ? "ps-hit" : ""}`;

  return <div ref={r} className={cls} title={title} />;
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
    <div className="ps-modalOverlay">
      <button className="ps-modalBackdrop" onClick={onClose} aria-label="Close modal" />
      <div className="ps-modalCard" role="dialog" aria-modal="true" aria-label="Poll Share Info">
        <div className="ps-modalHeader">
          <div>
            <div className="ps-modalTitle">Poll-Share Mixer</div>
            <div className="ps-modalSubtitle">Snapshot → Compare → Export</div>
          </div>

          <button onClick={onClose} className="ps-iconBtn" title="Close">
            ✕
          </button>
        </div>

        <div className="ps-modalBody">
          <div className="ps-panel">
            <div className="ps-panelTitle">How to use</div>
            <ol className="ps-olist">
              <li>Use sliders to set the live values.</li>
              <li>
                Press <strong>Snapshot</strong> to lock a baseline (STAT A).
              </li>
              <li>
                Press <strong>Compare</strong> to show STAT B beside STAT A.
              </li>
              <li>
                Press <strong>Export</strong> to save a PNG for thumbnails/overlays.
              </li>
            </ol>
          </div>

          <div className="ps-tip">
            Tip: You can create custom polls (municipality, favorability, anything) under <strong>Create Poll</strong>.
          </div>
        </div>

        <div className="ps-modalActions">
          <button onClick={onClose} className="ps-btn">
            Dismiss
          </button>
          <button onClick={onDismissForever} className="ps-btn ps-btnGhost" title="Don’t show this version again">
            Dismiss forever
          </button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  // ----------------------------
  // Polls + Active poll
  // ----------------------------
  const [polls, setPolls] = React.useState<Poll[]>(() => {
    const saved = localStorage.getItem(LS_POLLS_KEY);
    if (!saved) return [DEFAULT_POLL];
    try {
      return normalizePolls(JSON.parse(saved));
    } catch {
      return [DEFAULT_POLL];
    }
  });

  // one-time “heal” in case old storage was missing colors
  React.useEffect(() => {
    setPolls((prev) => normalizePolls(prev));
  }, []);

  const [activePollId, setActivePollId] = React.useState<string>(() => {
    return localStorage.getItem(LS_ACTIVE_POLL_KEY) || DEFAULT_POLL.id;
  });

  React.useEffect(() => {
    localStorage.setItem(LS_POLLS_KEY, JSON.stringify(polls));
  }, [polls]);

  React.useEffect(() => {
    localStorage.setItem(LS_ACTIVE_POLL_KEY, activePollId);
  }, [activePollId]);

  const activePoll = React.useMemo(() => {
    return polls.find((p) => p.id === activePollId) || DEFAULT_POLL;
  }, [polls, activePollId]);

  // ----------------------------
  // YouTube subs (Netlify function)
  // ----------------------------
  const [subs, setSubs] = React.useState<number | null>(null);
  const [subsError, setSubsError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setSubsError(null);
        const r = await fetch("/.netlify/functions/youtube-subs?channelId=UCdlKQfnSA5TvtsxjWq7PGmw");
        const data = await r.json();
        if (!alive) return;

        if (data?.ok && typeof data.subscriberCount === "number") {
          setSubs(data.subscriberCount);
        } else {
          setSubs(null);
          setSubsError(data?.error || "Could not load subscribers");
        }
      } catch (e: any) {
        if (!alive) return;
        setSubs(null);
        setSubsError(e?.message || "Network error");
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  // ----------------------------
  // Header UI controls
  // ----------------------------
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [showInfo, setShowInfo] = React.useState(() => localStorage.getItem(ALERT_LS_KEY) !== "true");

  // Create Poll UI
  const [createOpen, setCreateOpen] = React.useState(false);
  const [draftTitle, setDraftTitle] = React.useState("");
  const [draftCats, setDraftCats] = React.useState<Category[]>([
    { id: uid(), label: "Option A", color: "#3b82f6" },
    { id: uid(), label: "Option B", color: "#ef4444" },
  ]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Export target (chart area only)
  const exportRef = React.useRef<HTMLDivElement | null>(null);

  // ----------------------------
  // Shares (per poll)
  // ----------------------------
  const [shares, setShares] = React.useState<Record<string, number>>(() => {
    const saved = localStorage.getItem(sharesKey(activePollId));
    if (!saved) return buildZero(activePoll.categories);
    try {
      return sanitizeLoaded(JSON.parse(saved), activePoll.categories);
    } catch {
      return buildZero(activePoll.categories);
    }
  });

  // When poll changes, load its shares/baseline label/baseline
  React.useEffect(() => {
    const saved = localStorage.getItem(sharesKey(activePollId));
    if (!saved) {
      setShares(buildZero(activePoll.categories));
    } else {
      try {
        setShares(sanitizeLoaded(JSON.parse(saved), activePoll.categories));
      } catch {
        setShares(buildZero(activePoll.categories));
      }
    }
    setCompareOn(false);
    setCreateOpen(false);
  }, [activePollId, activePoll.categories]);

  React.useEffect(() => {
    localStorage.setItem(sharesKey(activePollId), JSON.stringify(shares));
  }, [shares, activePollId]);

  // ----------------------------
  // Greeting audio
  // ----------------------------
  const greetingAudioRef = React.useRef<HTMLAudioElement | null>(null);
  const greetTimerRef = React.useRef<number | null>(null);

  React.useEffect(() => {
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

    if (greetTimerRef.current) window.clearTimeout(greetTimerRef.current);
    audio.pause();
    audio.currentTime = 0;

    try {
      await audio.play();
      greetTimerRef.current = window.setTimeout(() => {
        audio.pause();
        audio.currentTime = 0;
      }, 4000);
    } catch {
      console.warn("Audio play blocked. Tap the button to allow audio.");
    }
  }, []);

  // ----------------------------
  // Baseline (per poll)
  // ----------------------------
  const [baseline, setBaseline] = React.useState<Record<string, number> | null>(() => {
    const saved = localStorage.getItem(baselineKey(activePollId));
    if (!saved) return null;
    try {
      return sanitizeLoaded(JSON.parse(saved), activePoll.categories);
    } catch {
      return null;
    }
  });

  React.useEffect(() => {
    const saved = localStorage.getItem(baselineKey(activePollId));
    if (!saved) {
      setBaseline(null);
      return;
    }
    try {
      setBaseline(sanitizeLoaded(JSON.parse(saved), activePoll.categories));
    } catch {
      setBaseline(null);
    }
  }, [activePollId, activePoll.categories]);

  React.useEffect(() => {
    if (baseline) localStorage.setItem(baselineKey(activePollId), JSON.stringify(baseline));
    else localStorage.removeItem(baselineKey(activePollId));
  }, [baseline, activePollId]);

  const [baselineLabel, setBaselineLabel] = React.useState<string>(() => {
    return localStorage.getItem(baselineLabelKey(activePollId)) || "STAT";
  });

  React.useEffect(() => {
    setBaselineLabel(localStorage.getItem(baselineLabelKey(activePollId)) || "STAT");
  }, [activePollId]);

  React.useEffect(() => {
    localStorage.setItem(baselineLabelKey(activePollId), baselineLabel || "STAT");
  }, [baselineLabel, activePollId]);

  const [compareOn, setCompareOn] = React.useState(false);

  const total = React.useMemo(() => sumShares(shares), [shares]);

  // ----------------------------
  // Info modal helpers
  // ----------------------------
  const dismissInfo = React.useCallback(() => setShowInfo(false), []);
  const dismissInfoForever = React.useCallback(() => {
    localStorage.setItem(ALERT_LS_KEY, "true");
    setShowInfo(false);
  }, []);

  // ----------------------------
  // Export PNG
  // ----------------------------
  const onExport = React.useCallback(async () => {
    const node = exportRef.current;
    if (!node) return;

    const html2canvasMod = await import("html2canvas");
    const html2canvas = html2canvasMod.default;

    const rect = node.getBoundingClientRect();
    const width = Math.ceil(rect.width);
    const height = Math.ceil(rect.height);

    const canvas = await html2canvas(node, {
      backgroundColor: "#18181b",
      scale: Math.max(2, window.devicePixelRatio || 2),
      useCORS: true,
      width,
      height,
    });

    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const filename = `poll-${activePoll.title.replace(/\s+/g, "-").toLowerCase()}-${stamp}.png`;

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
  }, [activePoll.title]);

  // ----------------------------
  // Slider math (per poll)
  // ----------------------------
  const maxFor = React.useCallback(
    (targetId: string) => {
      const others = sumOthers(shares, targetId);
      return clampFloat(100 - others, 0, 100);
    },
    [shares]
  );

  const setCategoryShare = React.useCallback((targetId: string, raw: number) => {
    setShares((prev) => {
      const others = sumOthers(prev, targetId);
      const max = Math.max(0, 100 - others);
      const nextVal = clampFloat(raw, 0, max);

      const next = { ...prev, [targetId]: nextVal };

      const t = sumShares(next);
      if (t > 100) {
        const overflow = t - 100;
        next[targetId] = clampFloat(next[targetId] - overflow, 0, 100);
      }
      return next;
    });
  }, []);

  const resetAll = React.useCallback(() => {
    setShares(buildZero(activePoll.categories));
  }, [activePoll.categories]);

  const normalizeTo100 = React.useCallback(() => {
    setShares((prev) => {
      const sum = sumShares(prev);
      if (sum === 0) return prev;

      const cats = activePoll.categories;
      const scaled: Record<string, number> = buildZero(cats);
      let accum = 0;

      cats.forEach((c, i) => {
        if (i < cats.length - 1) {
          const v = clampFloat(((prev[c.id] || 0) / sum) * 100, 0, 100);
          scaled[c.id] = v;
          accum = clampFloat(accum + v, 0, 200);
        } else {
          scaled[c.id] = clampFloat(100 - accum, 0, 100);
        }
      });

      return sanitizeLoaded(scaled, cats);
    });
  }, [activePoll.categories]);

  const snapshotBaseline = React.useCallback(() => {
    setBaseline(sanitizeLoaded(shares, activePoll.categories));
    setCompareOn(true);
  }, [shares, activePoll.categories]);

  const clearBaseline = React.useCallback(() => {
    setBaseline(null);
    setCompareOn(false);
  }, []);

  // ----------------------------
  // Create Poll actions
  // ----------------------------
  const savePollFromDraft = React.useCallback(() => {
    const title = (draftTitle || "").trim();
    const cats = draftCats
      .map((c) => ({ ...c, label: (c.label || "").trim(), color: safeColor(c.color) }))
      .filter((c) => c.label.length > 0);

    const uniqueLabels = new Set(cats.map((c) => c.label.toLowerCase()));

    if (!title) {
      alert("Please enter a poll title.");
      return;
    }
    if (cats.length < 2) {
      alert("Please add at least 2 categories.");
      return;
    }
    if (uniqueLabels.size !== cats.length) {
      alert("Category labels must be unique.");
      return;
    }

    const poll: Poll = { id: uid(), title, categories: cats };

    setPolls((prev) => normalizePolls([poll, ...prev]));
    setActivePollId(poll.id);

    // initialize storage for new poll
    localStorage.setItem(sharesKey(poll.id), JSON.stringify(buildZero(poll.categories)));
    localStorage.removeItem(baselineKey(poll.id));
    localStorage.setItem(baselineLabelKey(poll.id), "STAT");

    // reset draft + close panel
    setDraftTitle("");
    setDraftCats([
      { id: uid(), label: "Option A", color: "#3b82f6" },
      { id: uid(), label: "Option B", color: "#ef4444" },
    ]);

    setCompareOn(false);
    setCreateOpen(false);
  }, [draftTitle, draftCats]);

  return (
    <div className="ps-page">
      <div className="ps-container">
        <div className="ps-sticky">
          <div className="ps-stripe" />

          <div className="ps-stickyInner">
            <header className="ps-header">
              <div className="ps-headLeft">
                <div className="ps-brandRow">
                  <img src={paddle} alt="Paddle" className="ps-brandImg" draggable={false} />
                  <h1 className="ps-title">{activePoll.title}</h1>
                </div>

                <div className="ps-subrow">
  <span className="ps-muted">The National Telegraph • Wyatt Claypool</span>

  {/* YouTube Subscribers */}
  {typeof subs === "number" ? (
    <span className="ps-pill ps-subsPill">
      Subs: <strong className="ps-pillStrong">{subs.toLocaleString()}</strong>
    </span>
  ) : subsError ? (
    <span
      className="ps-pill ps-pillEmpty ps-subsPill"
      title={subsError}
    >
      Subs unavailable
    </span>
  ) : (
    <span className="ps-pill ps-pillEmpty ps-subsPill">
      Loading subs…
    </span>
  )}

  {/* Baseline */}
  {baseline ? (
    <span className="ps-pill">
      Baseline: <strong className="ps-pillStrong">{baselineLabel || "STAT"}</strong>
    </span>
  ) : (
    <span className="ps-pill ps-pillEmpty">No baseline saved</span>
  )}
</div>

              </div>

              {/* Desktop controls */}
              <div className="ps-controls ps-desktopOnly">
                <select className="ps-select" value={activePollId} onChange={(e) => setActivePollId(e.target.value)} title="Select poll">
                  {polls.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
                </select>

                <button onClick={() => setCreateOpen((v) => !v)} className="ps-btn ps-btnGhost" title="Create a new poll">
                  Create Poll
                </button>

                <button onClick={playGreeting} className="ps-btn" title="Play greeting">
                  Greeting
                </button>

                <button onClick={resetAll} className="ps-btn">
                  Reset
                </button>

                <button onClick={normalizeTo100} className="ps-btn" title="Scale current values so total becomes 100.0%">
                  Normalize
                </button>

                <button onClick={snapshotBaseline} className="ps-btn" title="Save a baseline snapshot">
                  Snapshot
                </button>

                <button
                  onClick={() => setCompareOn((v) => !v)}
                  disabled={!baseline}
                  className={`ps-btn ${baseline ? (compareOn ? "ps-btnActive" : "") : "ps-btnDisabled"}`}
                  title={baseline ? "Toggle comparison view" : "Take a snapshot first"}
                >
                  Compare
                </button>

                {baseline && (
                  <button onClick={clearBaseline} className="ps-btn ps-btnGhost" title="Remove baseline snapshot">
                    Clear
                  </button>
                )}

                <button onClick={onExport} className="ps-btn" title="Export chart as PNG">
                  Export
                </button>

                <button onClick={() => setShowInfo(true)} className="ps-btn ps-btnGhost" title="How this works">
                  Info
                </button>
              </div>

              {/* Mobile controls */}
              <div className="ps-mobileOnly ps-mobileControls">
                <button onClick={() => setShowInfo(true)} className="ps-btn" title="How this works">
                  Info
                </button>
                <button onClick={() => setMenuOpen(true)} className="ps-btn" aria-label="Open menu">
                  ☰
                </button>
              </div>
            </header>

            {/* Create Poll panel */}
            {createOpen && (
              <div className="ps-createPoll">
                <div className="ps-createTitle">Create a Poll</div>

                <div className="ps-createRow">
                  <label className="ps-createLabel">Poll title</label>
                  <input
                    className="ps-input ps-wFull"
                    value={draftTitle}
                    onChange={(e) => setDraftTitle(e.target.value)}
                    placeholder="e.g., Victoria Mayor Favorability"
                  />
                </div>

                <div className="ps-createRow">
                  <div className="ps-createLabel">Categories</div>

                  <div className="ps-catList">
                    {draftCats.map((cat, idx) => (
                      <div key={cat.id} className="ps-catItem">
                        <input
                          className="ps-input ps-wFull"
                          value={cat.label}
                          onChange={(e) => {
                            const v = e.target.value;
                            setDraftCats((prev) => prev.map((x) => (x.id === cat.id ? { ...x, label: v } : x)));
                          }}
                          placeholder={`Option ${idx + 1}`}
                        />

                        <input
                          type="color"
                          value={cat.color}
                          onChange={(e) => {
                            const v = e.target.value;
                            setDraftCats((prev) => prev.map((x) => (x.id === cat.id ? { ...x, color: v } : x)));
                          }}
                          className="ps-color"
                          aria-label="Category color"
                          title="Category color"
                        />

                        <button
                          className="ps-iconBtn"
                          onClick={() => setDraftCats((prev) => prev.filter((x) => x.id !== cat.id))}
                          disabled={draftCats.length <= 2}
                          title={draftCats.length <= 2 ? "Need at least 2 categories" : "Remove category"}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>

                  <div className="ps-createActions">
                    <button
                      className="ps-btn"
                      onClick={() =>
                        setDraftCats((prev) => [
                          ...prev,
                          { id: uid(), label: `Option ${prev.length + 1}`, color: FALLBACK_COLORS[prev.length % FALLBACK_COLORS.length] },
                        ])
                      }
                    >
                      + Add Category
                    </button>

                    <button
                      className="ps-btn ps-btnGhost"
                      onClick={() => {
                        setDraftTitle("");
                        setDraftCats([
                          { id: uid(), label: "Option A", color: "#3b82f6" },
                          { id: uid(), label: "Option B", color: "#ef4444" },
                        ]);
                      }}
                      title="Reset draft"
                    >
                      Reset Draft
                    </button>

                    <button className="ps-btn ps-btnActive" onClick={savePollFromDraft}>
                      Save Poll
                    </button>
                  </div>

                  <div className="ps-tip">
                    Tip: Totals hard-cap at <strong>100%</strong>. Perfect for municipality splits or favorability buckets.
                  </div>
                </div>
              </div>
            )}

            {/* Mobile menu drawer */}
            {menuOpen && (
              <div className="ps-drawerWrap ps-mobileOnly">
                <button className="ps-drawerBackdrop" onClick={() => setMenuOpen(false)} aria-label="Close menu" />
                <div className="ps-drawer">
                  <div className="ps-drawerTop">
                    <div className="ps-drawerTitle">Menu</div>
                    <button onClick={() => setMenuOpen(false)} className="ps-iconBtn" title="Close">
                      ✕
                    </button>
                  </div>

                  <div className="ps-drawerButtons">
                    <select className="ps-select ps-wFull" value={activePollId} onChange={(e) => setActivePollId(e.target.value)} title="Select poll">
                      {polls.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.title}
                        </option>
                      ))}
                    </select>

                    <button
                      onClick={() => {
                        setCreateOpen(true);
                        setMenuOpen(false);
                      }}
                      className="ps-btn ps-btnGhost ps-wFull"
                    >
                      Create Poll
                    </button>

                    <button onClick={playGreeting} className="ps-btn ps-wFull">
                      Greeting
                    </button>
                    <button onClick={resetAll} className="ps-btn ps-wFull">
                      Reset
                    </button>
                    <button onClick={normalizeTo100} className="ps-btn ps-wFull">
                      Normalize
                    </button>
                    <button onClick={snapshotBaseline} className="ps-btn ps-wFull">
                      Snapshot
                    </button>

                    <button
                      onClick={() => setCompareOn((v) => !v)}
                      disabled={!baseline}
                      className={`ps-btn ps-wFull ${baseline ? (compareOn ? "ps-btnActive" : "") : "ps-btnDisabled"}`}
                    >
                      Compare
                    </button>

                    {baseline && (
                      <button onClick={clearBaseline} className="ps-btn ps-btnGhost ps-wFull">
                        Clear
                      </button>
                    )}

                    <button onClick={onExport} className="ps-btn ps-wFull">
                      Export
                    </button>
                    <button onClick={() => setShowInfo(true)} className="ps-btn ps-btnGhost ps-wFull">
                      Info
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* baseline label input */}
            <div className="ps-baselineRow">
              <span className="ps-baselineLabel">Baseline label:</span>
              <input value={baselineLabel} onChange={(e) => setBaselineLabel(e.target.value)} placeholder="STAT" className="ps-input" />
              <span className="ps-baselineHint">(Snapshot uses this label)</span>
            </div>

            {/* Export Root */}
            <div id="export-root" ref={exportRef} className="ps-export export-safe">
              <div className="ps-exportTop">
                <span className="ps-muted">
                  Total{" "}
                  {compareOn && baseline ? <span className="ps-subtle">• comparing “{baselineLabel || "STAT"}” vs Live</span> : null}
                </span>

                <span className={`ps-total ${total === 100 ? "ps-totalGood" : "ps-totalBad"}`}>
                  {total.toFixed(1)}% {total < 100 ? `(Remaining: ${(100 - total).toFixed(1)}%)` : ""}
                </span>
              </div>

              <div className="ps-chart">
                <div className="ps-chartInner">
                  <div className="ps-grid">
                    {GRID_LINES.map((g) => (
                      <div key={g} className={`ps-gridLine ps-gridLine-${g}`}>
                        <span className="ps-gridLabel">{g}%</span>
                      </div>
                    ))}
                  </div>

                  <div className="ps-bars">
                    {activePoll.categories.map((c) => {
                      const live = shares[c.id] || 0;
                      const base = baseline?.[c.id] ?? 0;

                      const liveHit = isNearMarker(live);
                      const baseHit = isNearMarker(base);
                      const showCompare = compareOn && !!baseline;

                      return (
                        <div key={c.id} className="ps-barCol">
                          <div className="ps-barBox">
                            {showCompare ? (
                              <div className="ps-compare">
                                <div className="ps-compareHalf">
                                  <Bar kind="baseline" height={base} color={c.color} hit={baseHit} title={`${baselineLabel || "STAT"} • ${c.label}: ${base.toFixed(1)}%`} />
                                </div>
                                <div className="ps-compareHalf">
                                  <Bar kind="live" height={live} color={c.color} hit={liveHit} title={`Live • ${c.label}: ${live.toFixed(1)}%`} />
                                </div>
                              </div>
                            ) : (
                              <Bar kind="single" height={live} color={c.color} hit={liveHit} title={`${c.label}: ${live.toFixed(1)}%`} />
                            )}
                          </div>

                          <div className="ps-barMeta">
                            <div className="ps-barLabel">{c.label}</div>

                            {compareOn && baseline ? (
                              <div className="ps-barNums">
                                <span className={baseHit ? "ps-good" : ""}>{base.toFixed(1)}%</span>
                                <span className="ps-sep">|</span>
                                <span className={liveHit ? "ps-good" : ""}>{live.toFixed(1)}%</span>
                              </div>
                            ) : (
                              <div className={`ps-barNums ${liveHit ? "ps-good" : ""}`}>{live.toFixed(1)}%</div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="ps-axis">
                    <span>0%</span>
                    <span>100%</span>
                  </div>

                  {compareOn && baseline ? (
                    <div className="ps-legendCompare">
                      <span className="ps-legendItem">
                        <span className="ps-legendSwatch ps-legendSwatchDim" />
                        {baselineLabel || "STAT"}
                      </span>
                      <span className="ps-legendItem">
                        <span className="ps-legendSwatch" />
                        Live
                      </span>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="ps-legend">
                {activePoll.categories.map((c) => (
                  <div key={c.id} className="ps-legendItem">
                    <Dot color={c.color} />
                    <span className="ps-legendText">
                      {c.label}: <strong>{(shares[c.id] || 0).toFixed(1)}%</strong>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Sliders */}
        <div className="ps-bottom">
          <div className="ps-sliderCard">
            {activePoll.categories.map((c) => {
              const max = maxFor(c.id);
              const value = shares[c.id] || 0;

              return (
                <div key={c.id} className="ps-sliderRow">
                  <div className="ps-sliderTop">
                    <div className="ps-sliderLeft">
                      <Dot color={c.color} />
                      <span className="ps-sliderName">{c.label}</span>
                    </div>
                    <span className="ps-sliderValue">{value.toFixed(1)}%</span>
                  </div>

                  <input
                    aria-label={`${c.label} share`}
                    type="range"
                    min={0}
                    max={max}
                    step={0.1}
                    value={value}
                    onChange={(e) => setCategoryShare(c.id, Number(e.target.value))}
                    className="ps-range"
                  />

                  <div className="ps-sliderFoot">
                    <span>0%</span>
                    <span>Max: {max.toFixed(1)}%</span>
                  </div>
                </div>
              );
            })}
          </div>

          <footer className="ps-footer">
            <div>© {new Date().getFullYear()} The National Telegraph — Wyatt Claypool</div>
            <div className="ps-footerSub">Tool design &amp; engineering by Jay Tranberg</div>
          </footer>
        </div>
      </div>

      <InfoModal open={showInfo} onClose={dismissInfo} onDismissForever={dismissInfoForever} />
    </div>
  );
}
