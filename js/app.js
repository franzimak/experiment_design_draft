/* =================================================================
   NOVA AI – app logic
   Loads content.json, runs the screen flow, assigns the condition,
   records the decision and sends the data to serve.py at the end.
   You normally don't need to edit this file.
   ================================================================= */
(async function () {
  "use strict";

  const params = new URLSearchParams(location.search);
  const DEBUG = params.has("debug");
  if (DEBUG) document.body.classList.add("debug");

  /* ---------- Load content.json ---------- */
  let C;
  try {
    const res = await fetch("content.json", { cache: "no-store" });
    C = await res.json();
  } catch (err) {
    document.body.innerHTML =
      '<div style="font:16px/1.5 system-ui;max-width:560px;margin:80px auto;padding:0 20px">' +
      "<h2>Could not load content.json</h2><p>Start the local server with <code>python serve.py</code> " +
      "and open <a href=\"http://localhost:8000\">http://localhost:8000</a>. " +
      "Opening index.html by double-click does not work. If the server is running, check content.json for a typo " +
      "(e.g. a missing comma).</p><pre style=\"white-space:pre-wrap;color:#8f2424\">" + String(err) + "</pre></div>";
    return;
  }

  const S = C.screens;
  const state = { email: "", name: "" };   // typed values, only kept in memory (never saved)

  /* ---------- Condition ---------- */
  const forced = params.get("cond");
  const conditionId = C.conditions.list[forced]
    ? forced
    : String(C.conditions.active[Math.floor(Math.random() * C.conditions.active.length)]);
  const cond = C.conditions.list[conditionId];
  const frame = C.conditions.frames[cond.frame];

  /* ---------- Data ---------- */
  const data = {
    participant_id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    condition_id: Number(conditionId),
    condition_label: cond.label,
    default_share: cond.default_share,
    frame: cond.frame,
    ui: cond.ui,
    forced_condition: Boolean(C.conditions.list[forced]),
    started_at: new Date().toISOString(),
    finished_at: null,
    screen_order: [],
    screen_times_ms: {},
    decision: {
      toggle_initial: null,
      toggle_final: null,
      toggle_changes: 0,
      choice: null,
      consent_to_share: null,      // TRUE = chats may be used for training  <- main DV
      changed_default: null,
      learn_more_clicks: 0,
      first_interaction_ms: null,
      decision_time_ms: null
    },
    onboarding: {},                // role, usage, promo emails
    answers: {},                   // questionnaire
    user_agent: navigator.userAgent,
    screen_size: `${screen.width}x${screen.height}`
  };

  /* ---------- Text helpers ---------- */
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fill = (s) => String(s ?? "")
    .replaceAll("{brand}", esc(C.brand))
    .replaceAll("{email}", esc(state.email))
    .replaceAll("{name}", esc(state.name));
  const get = (key) => key.split(".").reduce((o, k) => (o == null ? o : o[k]), S);

  function renderTexts(root = document) {
    root.querySelectorAll("[data-t]").forEach((el) => {
      const v = get(el.dataset.t);
      if (v === undefined) { el.innerHTML = `<mark>missing: ${el.dataset.t}</mark>`; return; }
      el.innerHTML = fill(v);
    });
    root.querySelectorAll("[data-ph]").forEach((el) => { el.placeholder = fill(get(el.dataset.ph) ?? ""); });
    root.querySelectorAll("[data-list]").forEach((el) => {
      el.innerHTML = (get(el.dataset.list) || []).map((t) => `<li>${fill(t)}</li>`).join("");
    });
    root.querySelectorAll("[data-var]").forEach((el) => { el.textContent = state[el.dataset.var] || ""; });
    root.querySelectorAll("[data-brand]").forEach((el) => { el.textContent = C.brand; });
  }

  /* ---------- Build dynamic parts ---------- */
  document.title = C.brand;
  const logoTpl = document.getElementById("logo-tpl");
  document.querySelectorAll(".logo-slot").forEach((slot) => slot.appendChild(logoTpl.content.cloneNode(true)));

  // Role select
  const roleSel = document.getElementById("role-select");
  roleSel.innerHTML = `<option value="" disabled selected hidden>${fill(S.role.placeholder)}</option>` +
    S.role.options.map((o) => `<option value="${esc(o)}">${fill(o)}</option>`).join("");
  roleSel.classList.add("is-placeholder");
  roleSel.addEventListener("change", () => roleSel.classList.remove("is-placeholder"));

  // Birthday: insert slashes while typing
  const bday = document.querySelector("input[name='_birthday']");
  bday.addEventListener("input", () => {
    const d = bday.value.replace(/\D/g, "").slice(0, 8);
    bday.value = [d.slice(0, 2), d.slice(2, 4), d.slice(4)].filter(Boolean).join("/");
  });

  // Questionnaire from content.json
  const qBox = document.getElementById("questionnaire-items");
  qBox.innerHTML = C.questionnaire.map((q) => {
    const req = q.required ? "required" : "";
    const label = fill(q.label);
    if (q.type === "radio") {
      return `<fieldset class="q" data-q="${q.id}"><legend>${label}</legend>` +
        q.options.map(([v, t], i) => `<label class="q-option"><input type="radio" name="${q.id}" value="${esc(v)}" ${i === 0 ? req : ""}><span>${fill(t)}</span></label>`).join("") +
        `</fieldset>`;
    }
    if (q.type === "likert") {
      const n = q.points || 7;
      const cells = Array.from({ length: n }, (_, i) =>
        `<label><input type="radio" name="${q.id}" value="${i + 1}" ${i === 0 ? req : ""}><span>${i + 1}</span></label>`).join("");
      return `<fieldset class="q" data-q="${q.id}"><legend>${label}</legend>` +
        `<div class="likert" style="grid-template-columns:repeat(${n},1fr)">${cells}</div>` +
        `<div class="likert-anchors"><span>${fill(q.anchors?.[0] ?? "")}</span><span>${fill(q.anchors?.[1] ?? "")}</span></div></fieldset>`;
    }
    if (q.type === "number") {
      return `<label class="q" data-q="${q.id}"><span class="q-label">${label}</span>` +
        `<input class="input input-white" type="number" name="${q.id}" min="${q.min ?? ""}" max="${q.max ?? ""}" ${req}></label>`;
    }
    if (q.type === "select") {
      return `<label class="q" data-q="${q.id}"><span class="q-label">${label}</span><div class="select-wrap" style="max-width:260px">` +
        `<select class="input input-white" name="${q.id}" ${req}><option value="">Please select</option>` +
        q.options.map(([v, t]) => `<option value="${esc(v)}">${fill(t)}</option>`).join("") + `</select></div></label>`;
    }
    if (q.type === "text") {
      return `<label class="q" data-q="${q.id}"><span class="q-label">${label}</span>` +
        `<textarea class="input input-white" style="height:90px;padding:10px 14px" name="${q.id}" ${req}></textarea></label>`;
    }
    return `<p><mark>Unknown question type: ${esc(q.type)}</mark></p>`;
  }).join("");

  /* ---------- Treatment ---------- */
  const tRow = document.getElementById("treatment-row");
  const learnBox = document.getElementById("learn-more-box");
  let switchEl = null;
  const settingText = `${fill(frame.body)} <a href="#" data-action="learn-more">${fill(S.treatment.learn_more)}</a>`;

  if (cond.ui === "toggle") {
    // gain: ON = share · loss ("Do NOT …"): ON = don't share
    const initialOn = cond.frame === "gain" ? cond.default_share : !cond.default_share;
    tRow.innerHTML = `<span class="row-lead"><button type="button" class="switch" role="switch" aria-checked="${initialOn}" aria-labelledby="setting-text"></button>` +
      `<span class="switch-state" aria-hidden="true"></span></span><p id="setting-text">${settingText}</p>`;
    switchEl = tRow.querySelector(".switch");
    const switchState = tRow.querySelector(".switch-state");
    const setSwitchLabel = (on) => { switchState.textContent = fill(on ? S.treatment.switch_on : S.treatment.switch_off); };
    setSwitchLabel(initialOn);
    data.decision.toggle_initial = initialOn;
    switchEl.addEventListener("click", () => {
      const on = switchEl.getAttribute("aria-checked") !== "true";
      switchEl.setAttribute("aria-checked", String(on));
      setSwitchLabel(on);
      data.decision.toggle_changes += 1;
      firstInteraction();
      debugBar();
    });
  } else {
    const yesShares = cond.frame === "gain";
    tRow.innerHTML = `<span class="row-icon" style="background:#d3ddf0"><svg viewBox="0 0 24 24"><path d="M4 7h10M18 7h2M4 17h4M12 17h8" stroke="#1a1a1a" stroke-width="1.5" stroke-linecap="round"/><circle cx="16" cy="7" r="2" fill="none" stroke="#1a1a1a" stroke-width="1.5"/><circle cx="10" cy="17" r="2" fill="none" stroke="#1a1a1a" stroke-width="1.5"/></svg></span>
      <div><p>${settingText}</p>
        <div class="choice-pills" role="radiogroup">
          <label class="choice-pill"><input type="radio" name="_choice" value="yes" data-share="${yesShares}" required><span>${fill(frame.choice_yes)}</span></label>
          <label class="choice-pill"><input type="radio" name="_choice" value="no" data-share="${!yesShares}"><span>${fill(frame.choice_no)}</span></label>
        </div></div>`;
    tRow.querySelectorAll("input").forEach((r) => r.addEventListener("change", () => {
      firstInteraction();
      document.querySelector("[data-error='_choice']").hidden = true;
    }));
  }

  function firstInteraction() {
    if (data.decision.first_interaction_ms === null) data.decision.first_interaction_ms = Math.round(performance.now() - screenStart);
  }

  function leaveTreatment(ms) {
    const d = data.decision;
    d.decision_time_ms = ms;
    if (cond.ui === "toggle") {
      d.toggle_final = switchEl.getAttribute("aria-checked") === "true";
      d.consent_to_share = cond.frame === "gain" ? d.toggle_final : !d.toggle_final;
      d.changed_default = d.consent_to_share !== cond.default_share;
    } else {
      const picked = tRow.querySelector("input[name='_choice']:checked");
      d.choice = picked.value;
      d.consent_to_share = picked.dataset.share === "true";
    }
  }

  /* ---------- Navigation ---------- */
  const screens = Array.from(document.querySelectorAll(".screen"));
  const idx = (id) => screens.findIndex((s) => s.dataset.screen === id);
  let current = 0;
  let screenStart = performance.now();

  function show(i) {
    screens.forEach((s, j) => s.classList.toggle("is-active", j === i));
    current = i;
    screenStart = performance.now();
    data.screen_order.push(screens[i].dataset.screen);
    renderTexts(screens[i]);
    window.scrollTo(0, 0);
    const h = screens[i].querySelector("h1");
    if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }); }
    if (i === screens.length - 1) finish();
    debugBar();
    if (screens[i].dataset.screen === "verify") openCodeModal();
  }

  /* ---------- Verification code pop-up ---------- */
  const codeModal = document.getElementById("code-modal");
  const codeInput = document.querySelector("[data-screen='verify'] input[name='_code']");
  const verifyCode = String(Math.floor(100000 + Math.random() * 900000));   // 6 digits, never saved
  codeInput.pattern = `\\s*${verifyCode}\\s*`;   // only the shown code is accepted

  function openCodeModal() {
    renderTexts(codeModal);
    document.getElementById("code-value").textContent = verifyCode;
    codeModal.hidden = false;
    codeModal.querySelector("button").focus();
  }
  function closeCodeModal() {
    if (codeModal.hidden) return;
    codeModal.hidden = true;
    codeInput.focus();
  }
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeCodeModal(); });

  function logTime() {
    const id = screens[current].dataset.screen;
    const ms = Math.round(performance.now() - screenStart);
    data.screen_times_ms[id] = (data.screen_times_ms[id] || 0) + ms;
    return ms;
  }

  function next() { if (current < screens.length - 1) show(current + 1); }

  /* ---------- Validation ---------- */
  function validate(form) {
    let ok = true;
    form.querySelectorAll("[data-error]").forEach((e) => { e.hidden = true; });
    form.querySelectorAll(".is-invalid").forEach((e) => e.classList.remove("is-invalid"));
    form.querySelectorAll(".q.has-error").forEach((e) => e.classList.remove("has-error"));

    for (const el of form.querySelectorAll("input, select, textarea")) {
      if (el.checkValidity()) continue;
      const custom = form.querySelector(`[data-error="${el.name}"]`);
      if (custom) { custom.hidden = false; ok = false; continue; }
      el.classList.add("is-invalid");
      el.closest(".q")?.classList.add("has-error");
      if (ok) el.reportValidity();     // native bubble for the first problem
      ok = false;
    }
    return ok;
  }

  // Clear the custom error as soon as the box is ticked
  document.addEventListener("change", (e) => {
    const err = e.target.name && document.querySelector(`[data-error="${e.target.name}"]`);
    if (err && e.target.checkValidity()) err.hidden = true;
    e.target.classList?.remove("is-invalid");
    e.target.closest?.(".q")?.classList.remove("has-error");
  });

  function collect(form, target) {
    const fd = new FormData(form);
    for (const key of new Set(fd.keys())) {
      if (key.startsWith("_")) continue;          // "_" fields are never saved
      const v = fd.getAll(key);
      target[key] = v.length > 1 ? v : v[0];
    }
    form.querySelectorAll("input[type=checkbox]").forEach((cb) => {
      if (!cb.name.startsWith("_") && !fd.has(cb.name)) target[cb.name] = "no";
    });
  }

  screens.forEach((screen) => {
    const form = screen.querySelector("form");
    if (!form) return;
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      if (!validate(form)) return;
      const id = screen.dataset.screen;
      const ms = logTime();
      if (id === "register") state.email = form.elements["_email"].value.trim();
      if (id === "name") state.name = form.elements["_name"].value.trim();
      if (id === "treatment") leaveTreatment(ms);
      else collect(form, id === "questionnaire" ? data.answers : data.onboarding);
      next();
    });
  });

  // Enable / show buttons depending on a field
  document.querySelectorAll("[data-enable-when]").forEach((btn) => {
    const field = btn.form.elements[btn.dataset.enableWhen];
    field.addEventListener("input", () => { btn.disabled = !field.value.trim(); });
  });
  document.querySelectorAll("[data-show-when]").forEach((btn) => {
    const field = btn.form.elements[btn.dataset.showWhen];
    field.addEventListener("change", () => { btn.hidden = !field.value; });
  });

  // Clicks: skip / goto / resend / learn more / dead links
  document.addEventListener("click", (e) => {
    const dead = e.target.closest("[data-dead-link]");
    if (dead) { e.preventDefault(); return; }
    const el = e.target.closest("[data-action]");
    if (!el) return;
    const action = el.dataset.action;
    if (el.tagName === "A") e.preventDefault();

    if (action === "skip") {
      if (el.dataset.record) {
        const [k, v] = el.dataset.record.split("=");
        data.onboarding[k] = v;
      }
      logTime();
      next();
    } else if (action === "goto") {
      logTime();
      show(idx(el.dataset.target));
    } else if (action === "show-code") {
      openCodeModal();
    } else if (action === "close-code") {
      closeCodeModal();
    } else if (action === "learn-more") {
      data.decision.learn_more_clicks += 1;
      firstInteraction();
      learnBox.innerHTML = fill(S.treatment.learn_more_text);
      learnBox.hidden = !learnBox.hidden;
    }
  });

  /* ---------- Finish & save ---------- */
  async function finish() {
    if (data.finished_at) return;
    data.finished_at = new Date().toISOString();
    let saved = false;
    try {
      const r = await fetch("api/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      });
      saved = r.ok;
    } catch (_) { /* not running on serve.py (e.g. GitHub Pages) */ }
    console.log(saved ? "Data saved." : "Data NOT saved (no server).", data);
    if (DEBUG) showDebugData(saved);
  }

  function showDebugData(saved) {
    const out = document.getElementById("debug-output");
    const json = JSON.stringify(data, null, 2);
    out.innerHTML = `<p style="margin-top:20px;font-weight:600">${saved ? "✓ Saved to the data folder" : "✗ Not saved – no server"}</p><pre class="debug-json"></pre>`;
    out.querySelector("pre").textContent = json;
  }

  /* ---------- Debug bar (?debug) ---------- */
  function debugBar() {
    if (!DEBUG) return;
    const bar = document.getElementById("debug-bar");
    bar.hidden = false;
    const links = Object.keys(C.conditions.list)
      .map((id) => `<a href="?debug&cond=${id}"${id === conditionId ? ' class="active"' : ""}>${id}</a>`).join(" ");
    const jump = screens.map((s, i) => `<option value="${i}"${i === current ? " selected" : ""}>${i + 1} ${s.dataset.screen}</option>`).join("");
    bar.innerHTML = `<strong>DEBUG</strong> · condition ${conditionId} (${esc(cond.label)}) · switch: ${links}
      · screen <select id="dbg-jump" style="font:inherit">${jump}</select>`;
    bar.querySelector("#dbg-jump").addEventListener("change", (e) => { logTime(); show(Number(e.target.value)); });
  }

  /* ---------- Start ---------- */
  renderTexts();
  show(0);
})();
