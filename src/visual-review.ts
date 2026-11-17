export type VisualReview = {
  viewport: string;
  lanes: { name: string; currentUrl: string; image: string; status: string }[];
  events: {
    id: number;
    action: { kind: string; target?: { name: string }; value?: string };
    outcomes: {
      name: string;
      status: string;
      detail: string;
      mapped?: boolean;
    }[];
  }[];
};
const escape = (value: unknown) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export function visualReviewHtml(
  review: VisualReview,
  options: { privateContent: boolean; winner: number | null; feedback: string },
) {
  const { privateContent, winner, feedback } = options;
  const name = (index: number) =>
    privateContent
      ? review.lanes[index]?.name || `Preview ${index + 1}`
      : `Preview ${String.fromCharCode(65 + index)}`;
  const mismatches = review.events.reduce(
    (total, event) =>
      total + event.outcomes.filter((o) => o.status !== "matched").length,
    0,
  );
  const previews = review.lanes
    .map(
      (lane, i) =>
        `<article><h2>${escape(name(i))}${winner === i ? ' <span class="pick">Chosen</span>' : ""}</h2>${privateContent ? `<p class="url">${escape(lane.currentUrl)}</p>` : ""}${privateContent && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(lane.image) ? `<img alt="${escape(name(i))} final captured screen" src="${lane.image}">` : '<p class="placeholder">Screenshot omitted</p>'}<p>Final status: ${escape(lane.status)}</p></article>`,
    )
    .join("");
  const rows = review.events
    .map(
      (event) =>
        `<tr><th scope="row">${escape(event.id)}</th><td>${escape(event.action.kind)}${privateContent && event.action.target ? ` · ${escape(event.action.target.name)}` : ""}${privateContent && event.action.value !== undefined ? `<small>${escape(event.action.value)}</small>` : ""}</td>${review.lanes
          .map((_, i) => {
            const outcome = event.outcomes[i];
            return `<td>${escape(outcome?.status || "not recorded")}${outcome?.mapped ? " · mapped" : ""}${privateContent && outcome ? `<small>${escape(outcome.detail)}</small>` : ""}</td>`;
          })
          .join("")}</tr>`,
    )
    .join("");
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>Audition · Comparison review</title><style>
*{box-sizing:border-box}body{margin:0;background:#f3f6f4;color:#173f43;font:16px/1.6 system-ui,sans-serif}main{max-width:1400px;margin:auto;padding:32px}header{border-bottom:3px solid #173f43;padding-bottom:24px}h1{font-size:clamp(30px,5vw,56px);line-height:1.1;margin:12px 0}h2{font-size:18px}.eyebrow{font-size:12px;font-weight:700;letter-spacing:.15em}.summary{display:flex;gap:24px;flex-wrap:wrap}.summary strong{font-size:26px;display:block}.previews{display:grid;grid-template-columns:repeat(${review.lanes.length},minmax(0,1fr));gap:18px;margin:28px 0}article{background:white;border:1px solid #becfc6;border-radius:8px;padding:16px;min-width:0}img{width:100%;height:auto;border:1px solid #d7e0de}.url,small{font-size:12px;display:block;overflow-wrap:anywhere}.pick{font-size:12px;background:#d2eadc;padding:4px 8px}.placeholder{padding:50px 10px;background:#edf2ee;text-align:center;color:#52685e}.privacy{border-left:4px solid #875322;padding:12px 16px;background:#fff4e6;color:#583c20}table{border-collapse:collapse;width:100%;background:white}td,th{text-align:left;vertical-align:top;padding:12px;border-bottom:1px solid #d7e0de;overflow-wrap:anywhere}th{font-size:13px}.evidence{overflow:auto}blockquote{margin:16px 0;white-space:pre-wrap;overflow-wrap:anywhere;padding:16px;background:white;border-left:4px solid #32664e}footer{margin-top:28px;font-size:13px;color:#52685e}a{color:#173f43}@media(max-width:700px){main{padding:16px}.previews{grid-template-columns:1fr}td,th{padding:8px}.evidence table{min-width:540px}}@media print{body{background:white}main{padding:0}article{break-inside:avoid}.evidence{overflow:visible}a{color:inherit}}
</style><main><header><p class="eyebrow">AUDITION / COMPARISON REVIEW</p><h1>Implementation review</h1><p>${escape(review.viewport)} viewport · final snapshots, recorded action attempts</p><div class="summary"><div><strong>${review.lanes.length}</strong>implementations</div><div><strong>${review.events.length}</strong>recorded actions</div><div><strong>${mismatches}</strong>unmatched outcomes</div><div><strong>${winner === null ? "No pick" : escape(name(winner))}</strong>reviewer selection</div></div></header><p class="privacy">${privateContent ? "Private content included: screenshots, local URLs, control labels, typed values and review notes. Inspect this file before sharing." : "Private content omitted: no screenshots, URLs, app names, control labels, typed values or notes."}</p><section class="previews" aria-label="Compared implementations">${previews}</section>${privateContent && feedback ? `<section><h2>Reviewer notes</h2><blockquote>${escape(feedback)}</blockquote></section>` : ""}<section><h2>Action evidence</h2><p>Outcomes record whether actions applied, not whether implementations behaved correctly. Only the most recent 100 actions are retained.</p>${rows ? `<div class="evidence"><table><thead><tr><th scope="col">#</th><th scope="col">Action</th>${review.lanes.map((_, i) => `<th scope="col">${escape(name(i))}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table></div>` : "<p>No actions recorded in this session.</p>"}</section><footer>Created with <a href="https://github.com/alfonza1/audition" rel="noreferrer">Audition</a>. This self-contained file loads without network requests and contains no scripts. Screenshots show the final capture, not every historical action.</footer></main></html>`;
}
