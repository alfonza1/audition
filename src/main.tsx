import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";

type Control = { role: string; name: string; disabled?: boolean };
type Mapping = { lane: number; source: Control; target: Control };
type Lane = {
  id: number;
  name: string;
  url: string;
  currentUrl: string;
  image: string;
  status: string;
  detail: string;
  blocked: number;
  controls: Control[];
};
type Event = {
  id: number;
  time: string;
  action: { kind: string; target?: Control; value?: string };
  outcomes: { name: string; status: string; detail: string }[];
};
type Session = {
  mappings: Mapping[];
  lanes: Lane[];
  events: Event[];
  viewport: string;
  dimensions: { width: number; height: number };
};
const EMPTY: Session = {
  mappings: [],
  lanes: [],
  events: [],
  viewport: "desktop",
  dimensions: { width: 1000, height: 720 },
};
async function api<T>(path: string, data?: unknown): Promise<T> {
  const response = await fetch("/api/" + path, {
    method: data === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json", "X-Audition": "1" },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "The request failed.");
  return result as T;
}
function download(name: string, text: string) {
  const url = URL.createObjectURL(
    new Blob([text], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function App() {
  const running = useRef(true);
  const [session, setSession] = useState<Session>(EMPTY);
  const [busy, setBusy] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [targets, setTargets] = useState([
    { name: "Branch A", url: "http://localhost:3000" },
    { name: "Branch B", url: "http://localhost:3001" },
    { name: "Branch C", url: "" },
  ]);
  const [selected, setSelected] = useState<Control | null>(null),
    [text, setText] = useState(""),
    [feedback, setFeedback] = useState("");
  const [winner, setWinner] = useState<number | null>(null);
  useEffect(() => {
    let mounted = true;
    api<Session>("session")
      .then((data) => {
        if (mounted) {
          setSession(data);
          if (data.lanes.length)
            setTargets([
              ...data.lanes.map(({ name, url }) => ({ name, url })),
              ...Array.from({ length: 3 - data.lanes.length }, () => ({
                name: "Branch C",
                url: "",
              })),
            ]);
        }
      })
      .catch(() => {
        if (mounted)
          setError(
            "Could not recover the running session. Check the server and refresh.",
          );
      })
      .finally(() => {
        if (mounted) {
          running.current = false;
          setBusy(false);
        }
      });
    return () => {
      mounted = false;
    };
  }, []);
  const connected = session.lanes.length > 0;
  const controls = session.lanes[0]?.controls || [];
  const uniqueControls = controls.filter(
    (c, i, all) =>
      all.findIndex((x) => x.role === c.role && x.name === c.name) === i,
  );
  async function run(operation: () => Promise<void>) {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await operation();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  function connect(demo = false) {
    void run(async () => {
      const apps = demo
        ? ["a", "b", "c"].map((id, i) => ({
            name: ["Fieldnotes", "Daybook", "Taskline"][i],
            url: `${location.origin}/fixtures/${id}`,
          }))
        : targets.filter((t) => t.url.trim());
      const next = await api<Session>("connect", { targets: apps });
      setSession(next);
      setSelected(
        next.lanes[0]?.controls.find((c) => c.role === "textbox") || null,
      );
      setWinner(null);
      setFeedback("");
      setTargets([
        ...apps,
        ...Array.from({ length: 3 - apps.length }, () => ({
          name: "Branch C",
          url: "",
        })),
      ]);
      setNotice(
        demo
          ? "Three live example apps connected. Taskline has an intentional label mismatch."
          : "Your apps are connected in isolated browser sessions.",
      );
    });
  }
  function act(kind: string, target = selected, value = text) {
    void run(async () => {
      setSession(await api<Session>("action", { kind, target, value }));
    });
  }
  async function hit(lane: Lane, event: React.MouseEvent<HTMLImageElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const point = {
      lane: lane.id,
      x: ((event.clientX - rect.left) / rect.width) * session.dimensions.width,
      y: ((event.clientY - rect.top) / rect.height) * session.dimensions.height,
    };
    void run(async () => {
      const target = await api<Control>("hit-test", point);
      setSelected(target);
      if (["textbox", "combobox"].includes(target.role))
        setNotice(
          `Selected “${target.name}”. Enter a value in the action bar to apply it to all previews.`,
        );
      else setSession(await api<Session>("action", { kind: "click", target }));
    });
  }
  function saveDraft() {
    try {
      localStorage.setItem(
        "audition-draft-v1",
        JSON.stringify({
          targets: session.lanes.map(({ name, url }) => ({ name, url })),
          feedback,
          winner,
          mappings: session.mappings,
        }),
      );
      setNotice(
        "Draft saved in this browser. It includes local URLs and your notes, never typed action values.",
      );
    } catch {
      setError(
        "This browser could not save the draft. Export a review instead.",
      );
    }
  }
  function restoreDraft() {
    void run(async () => {
      const raw = localStorage.getItem("audition-draft-v1");
      if (!raw) throw new Error("No saved draft in this browser.");
      const draft = JSON.parse(raw);
      if (
        !Array.isArray(draft.targets) ||
        draft.targets.length > 3 ||
        typeof draft.feedback !== "string" ||
        draft.feedback.length > 4000
      )
        throw new Error("The saved draft is invalid.");
      const next = await api<Session>("connect", {
        targets: draft.targets.filter((t: { url: string }) => t?.url),
        mappings: draft.mappings || [],
      });
      setSession(next);
      setTargets([
        ...next.lanes.map(({ name, url }) => ({ name, url })),
        ...Array.from({ length: 3 - next.lanes.length }, () => ({
          name: "Branch C",
          url: "",
        })),
      ]);
      setFeedback(draft.feedback);
      setWinner(
        Number.isInteger(draft.winner) &&
          draft.winner >= 0 &&
          draft.winner < next.lanes.length
          ? draft.winner
          : null,
      );
      setSelected(null);

      setNotice(
        "Draft restored with fresh browsers. Application data and action history are not restored.",
      );
    });
  }
  function report() {
    void run(async () => {
      const data = await api<Record<string, unknown>>("report");
      download(
        "audition-review.json",
        JSON.stringify(
          {
            ...data,
            selectedVariant:
              winner === null ? null : session.lanes[winner]?.name,
            feedback,
          },
          null,
          2,
        ),
      );
      setNotice(
        "Review exported. It includes typed values and local URLs; review it before sharing.",
      );
    });
  }
  return (
    <div className="app-shell">
      <header className="masthead">
        <a className="brand" href="/" aria-label="Audition home">
          <span className="brand-mark" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          audition<span className="version">0.2</span>
        </a>
        <div className="masthead-right">
          <span className="local-indicator">Local workspace</span>
          <a
            href="https://github.com/alfonza1/audition"
            target="_blank"
            rel="noreferrer"
          >
            Source ↗
          </a>
        </div>
      </header>
      <main>
        <div className="workspace-title">
          <div>
            <p className="eyebrow">PARALLEL APP REVIEW</p>
            <h1>Choose by using.</h1>
            <p className="subtitle">
              One action. Every implementation. See what holds up.
            </p>
          </div>
          <div className="title-actions">
            <button
              className="secondary"
              disabled={busy || !connected}
              onClick={saveDraft}
            >
              Save draft
            </button>
            <button
              className="secondary"
              disabled={busy}
              onClick={restoreDraft}
            >
              Restore draft
            </button>
            <button
              className="secondary"
              disabled={busy}
              onClick={() => {
                try {
                  localStorage.removeItem("audition-draft-v1");
                  setNotice("Saved draft deleted.");
                } catch {
                  setError("Unable to delete the saved draft.");
                }
              }}
            >
              Forget draft
            </button>
            <button
              className="secondary"
              disabled={busy || !connected}
              onClick={() =>
                void run(async () => {
                  setSession(await api<Session>("reset", {}));
                  setSelected(null);
                  setNotice(
                    "Fresh browser sessions created. Application database state is unchanged.",
                  );
                })
              }
            >
              Reset browsers
            </button>
            <button
              className="primary"
              disabled={busy || !connected}
              onClick={report}
            >
              Export review ↗
            </button>
          </div>
        </div>
        <section className="connection" aria-label="Connect app previews">
          <details open={!connected}>
            <summary>
              <span>
                {connected
                  ? `${session.lanes.length} previews connected`
                  : "Connect your branches"}
              </span>
              <span className="summary-help">
                localhost apps · no account · isolated browsers
              </span>
            </summary>
            <div className="target-grid">
              {targets.map((target, i) => (
                <div className="target-input" key={i}>
                  <label htmlFor={`name-${i}`}>
                    Preview {String.fromCharCode(65 + i)}
                    {i === 2 ? " · optional" : ""}
                  </label>
                  <input
                    id={`name-${i}`}
                    aria-label={`Preview ${i + 1} name`}
                    value={target.name}
                    maxLength={60}
                    onChange={(e) =>
                      setTargets((v) =>
                        v.map((t, j) =>
                          j === i ? { ...t, name: e.target.value } : t,
                        ),
                      )
                    }
                  />
                  <input
                    aria-label={`Preview ${i + 1} URL`}
                    type="url"
                    placeholder="http://localhost:3002"
                    value={target.url}
                    onChange={(e) =>
                      setTargets((v) =>
                        v.map((t, j) =>
                          j === i ? { ...t, url: e.target.value } : t,
                        ),
                      )
                    }
                  />
                </div>
              ))}
            </div>
            <div className="connect-actions">
              <button
                className="primary"
                disabled={busy}
                onClick={() => connect()}
              >
                Connect previews
              </button>
              <span>or start with real examples</span>
              <button
                className="secondary"
                disabled={busy}
                onClick={() => connect(true)}
              >
                Try the three-app demo
              </button>
            </div>
            <p className="fine-print">
              Only apps on this computer are supported. External network
              requests and WebSockets are blocked. Connecting replaces the
              current session.
            </p>
          </details>
        </section>
        <div className="messages" aria-live="polite">
          {busy ? (
            <p className="message busy">
              <span className="spinner" />
              Applying to every preview…
            </p>
          ) : null}
          {error ? (
            <p className="message error" role="alert">
              {error}
            </p>
          ) : null}
          {notice ? <p className="message notice">{notice}</p> : null}
        </div>
        {connected ? (
          <>
            <section className="action-bar" aria-label="Synchronized actions">
              <div className="action-main">
                <div className="control-choice">
                  <label htmlFor="control">Control from first preview</label>
                  <select
                    id="control"
                    value={
                      selected
                        ? JSON.stringify({
                            role: selected.role,
                            name: selected.name,
                          })
                        : ""
                    }
                    onChange={(e) =>
                      setSelected(
                        e.target.value ? JSON.parse(e.target.value) : null,
                      )
                    }
                  >
                    <option value="">Choose a named control</option>
                    {uniqueControls.map((c) => (
                      <option
                        key={c.role + c.name}
                        value={JSON.stringify({ role: c.role, name: c.name })}
                      >
                        {c.role} · {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="value-choice">
                  <label htmlFor="value">Text or option label</label>
                  <input
                    id="value"
                    placeholder="A new task to compare…"
                    maxLength={4000}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => {
                      if (
                        e.key === "Enter" &&
                        !busy &&
                        selected?.role === "textbox"
                      )
                        act("fill");
                    }}
                  />
                </div>
                <button
                  className="primary"
                  disabled={busy || !selected}
                  onClick={() =>
                    act(
                      selected?.role === "textbox"
                        ? "fill"
                        : selected?.role === "combobox"
                          ? "select"
                          : "click",
                    )
                  }
                >
                  {selected?.role === "textbox"
                    ? "Fill all"
                    : selected?.role === "combobox"
                      ? "Select in all"
                      : "Click in all"}{" "}
                  →
                </button>
              </div>
              <div className="action-secondary">
                <div className="segmented" aria-label="Preview viewport">
                  {["desktop", "mobile"].map((size) => (
                    <button
                      key={size}
                      aria-pressed={session.viewport === size}
                      disabled={busy}
                      className={session.viewport === size ? "active" : ""}
                      onClick={() =>
                        void run(async () =>
                          setSession(
                            await api<Session>("viewport", { viewport: size }),
                          ),
                        )
                      }
                    >
                      {size === "desktop" ? "Desktop" : "Mobile"}
                    </button>
                  ))}
                </div>
                <span className="divider" />
                <button
                  disabled={busy}
                  onClick={() => act("press", null, "Tab")}
                >
                  Tab
                </button>
                <button
                  disabled={busy}
                  onClick={() => act("press", null, "Enter")}
                >
                  Enter
                </button>
                <button
                  disabled={busy}
                  onClick={() => act("press", null, "Escape")}
                >
                  Esc
                </button>
                <span className="divider" />
                <button
                  disabled={busy}
                  aria-label="Scroll previews up"
                  onClick={() =>
                    void run(async () =>
                      setSession(
                        await api<Session>("action", {
                          kind: "scroll",
                          direction: -1,
                        }),
                      ),
                    )
                  }
                >
                  ↑ Scroll
                </button>
                <button
                  disabled={busy}
                  aria-label="Scroll previews down"
                  onClick={() =>
                    void run(async () =>
                      setSession(
                        await api<Session>("action", {
                          kind: "scroll",
                          direction: 1,
                        }),
                      ),
                    )
                  }
                >
                  ↓ Scroll
                </button>
                <button
                  disabled={busy}
                  onClick={() =>
                    void run(async () =>
                      setSession(await api<Session>("session")),
                    )
                  }
                >
                  Refresh frames
                </button>
                <span className="action-tip">
                  Click a control in any frame to target it in every app.
                </span>
              </div>
            </section>
            <details className="mapping-panel">
              <summary>
                Control mappings · {session.mappings.length} overrides
              </summary>
              <p>
                Choose a control above, then explicitly match different labels.
                Mappings preserve strict, unique accessible-name matching.
              </p>
              {selected ? (
                session.lanes.map((lane) => {
                  const mapping = session.mappings.find(
                    (m) =>
                      m.lane === lane.id &&
                      m.source.role === selected.role &&
                      m.source.name === selected.name,
                  );
                  return (
                    <label key={lane.id}>
                      {lane.name}: {selected.name}
                      <select
                        aria-label={`Map control in ${lane.name}`}
                        disabled={busy}
                        value={mapping ? JSON.stringify(mapping.target) : ""}
                        onChange={(e) => {
                          const value = e.target.value;
                          void run(async () => {
                            const mappings = session.mappings.filter(
                              (m) =>
                                !(
                                  m.lane === lane.id &&
                                  m.source.role === selected.role &&
                                  m.source.name === selected.name
                                ),
                            );
                            if (value)
                              mappings.push({
                                lane: lane.id,
                                source: {
                                  role: selected.role,
                                  name: selected.name,
                                },
                                target: JSON.parse(value),
                              });
                            setSession(
                              await api<Session>("mappings", { mappings }),
                            );
                          });
                        }}
                      >
                        <option value="">Use original name</option>
                        {lane.controls
                          .filter((c) => c.role === selected.role)
                          .filter(
                            (c, i, a) =>
                              a.findIndex((x) => x.name === c.name) === i,
                          )
                          .map((c) => (
                            <option
                              key={c.name}
                              value={JSON.stringify({
                                role: c.role,
                                name: c.name,
                              })}
                            >
                              {c.name}
                            </option>
                          ))}
                      </select>
                    </label>
                  );
                })
              ) : (
                <p>Select a named control to configure its mappings.</p>
              )}
            </details>
            <section
              className={`previews ${session.lanes.length === 2 ? "two" : ""}`}
              aria-label="App previews"
            >
              {session.lanes.map((lane) => (
                <article
                  className={`preview ${winner === lane.id ? "chosen" : ""}`}
                  key={lane.id}
                >
                  <div className="preview-heading">
                    <span className={`lane-letter lane-${lane.id}`}>
                      {String.fromCharCode(65 + lane.id)}
                    </span>
                    <div>
                      <h2>{lane.name}</h2>
                      <p title={lane.currentUrl}>{lane.currentUrl}</p>
                    </div>
                    <button
                      className="pick"
                      disabled={busy}
                      aria-pressed={winner === lane.id}
                      onClick={() =>
                        setWinner(winner === lane.id ? null : lane.id)
                      }
                    >
                      {winner === lane.id ? "✓ Picked" : "Pick"}
                    </button>
                  </div>
                  <div className={`preview-status ${lane.status}`}>
                    <span />
                    {lane.status === "mismatch"
                      ? "Unmatched action"
                      : lane.status === "matched"
                        ? "Action matched"
                        : lane.status === "error"
                          ? "Disconnected"
                          : "Ready"}
                    <span className="blocked">
                      {lane.blocked ? `${lane.blocked} blocked requests` : ""}
                    </span>
                  </div>
                  <div
                    className={`screen ${session.viewport}`}
                    style={{
                      aspectRatio: `${session.dimensions.width}/${session.dimensions.height}`,
                    }}
                  >
                    {lane.image ? (
                      <img
                        src={lane.image}
                        alt={`${lane.name} live screenshot; use the action composer for keyboard access`}
                        draggable={false}
                        onClick={(e) => {
                          if (!busy) void hit(lane, e);
                        }}
                      />
                    ) : (
                      <p>{lane.detail}</p>
                    )}
                  </div>
                  {lane.status === "mismatch" ? (
                    <p className="mismatch-detail">{lane.detail}</p>
                  ) : null}
                </article>
              ))}
            </section>
            <div className="review-bottom">
              <section className="journal">
                <div className="section-heading">
                  <h2>Action journal</h2>
                  <span>{session.events.length} recorded</span>
                </div>
                {session.events.length ? (
                  <ol>
                    {[...session.events].reverse().map((event, i) => (
                      <li key={`${event.time}-${i}`}>
                        <span className="event-number">
                          {String(event.id).padStart(2, "0")}
                        </span>
                        <div>
                          <strong>
                            {event.action.kind}{" "}
                            {event.action.target
                              ? `“${event.action.target.name}”`
                              : event.action.value}
                          </strong>
                          <div className="outcomes">
                            {event.outcomes.map((o) => (
                              <span
                                key={o.name}
                                className={o.status}
                                title={o.detail}
                              >
                                {o.status === "matched" ? "✓" : "!"} {o.name}
                              </span>
                            ))}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="empty-journal">
                    Your first action starts the comparison. Fill “Task title”,
                    then click “Add task”.
                  </p>
                )}
              </section>
              <section className="review-note">
                <div className="section-heading">
                  <h2>Your verdict</h2>
                  <span>
                    {winner === null
                      ? "No pick yet"
                      : session.lanes[winner]?.name}
                  </span>
                </div>
                <label htmlFor="feedback">
                  What should the next iteration keep or change?
                </label>
                <textarea
                  id="feedback"
                  rows={5}
                  maxLength={4000}
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  placeholder="Keep A’s density, B’s clear feedback, and fix the missing action in C…"
                />
                <p>
                  Export your selection, feedback, and action outcomes as a
                  portable JSON review.
                </p>
              </section>
            </div>
          </>
        ) : (
          <section className="empty-stage">
            <div className="stage-illustration" aria-hidden="true">
              <span>A</span>
              <span>B</span>
              <span>C</span>
              <i>↔</i>
            </div>
            <h2>Same task. Different takes.</h2>
            <p>
              Bring two or three working implementations. Audition applies named
              actions across isolated browsers, so you can compare the
              experience before choosing a branch.
            </p>
            <button
              className="primary"
              disabled={busy}
              onClick={() => connect(true)}
            >
              Open the live demo →
            </button>
            <div className="empty-capabilities">
              <span>Semantic actions</span>
              <span>Mobile comparison</span>
              <span>Honest mismatch reporting</span>
            </div>
          </section>
        )}
      </main>
      <footer>
        <span>Audition / choose by using</span>
        <span>
          Snapshots update after actions. Matching an action does not prove
          matching behavior.
        </span>
        {connected ? (
          <button
            disabled={busy}
            onClick={() =>
              void run(async () => {
                setSession(await api<Session>("disconnect", {}));
                setSelected(null);
              })
            }
          >
            Disconnect browsers
          </button>
        ) : null}
      </footer>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
