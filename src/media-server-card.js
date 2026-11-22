/**
 * media-server-card / media-server-mini-card: what the media server is doing. Four counters (streams, coming up,
 * downloading, requests) that open their list, what is playing and the download queue.
 * https://github.com/juju35/ha-media-server-card
 */

// The badge's icon of each state (its colour is the stylesheet's).
const MS_ICONS = { playing: "mdi:play-box-multiple", downloading: "mdi:download-box", idle: "mdi:play-box-multiple-outline", offline: "mdi:lan-disconnect", none: "mdi:play-box-multiple-outline" };
const MS_TABS = [
  ["playing", "c_streams", "mdi:play"],
  ["coming", "c_coming", "mdi:calendar-clock"],
  ["queue", "c_downloads", "mdi:download"],
  ["requests", "c_requests", "mdi:account-clock"],
];
// One loop of the banner's animation (s): the screen's picture breathes while something plays.
const MS_LOOP = 3;
// How often the lists are fetched again (ms); a count that changes fetches them MS_DEBOUNCE later, once for a burst of
// changes; an action that never answered is tried again after MS_RETRY.
const MS_REFRESH = 5 * 60 * 1000;
const MS_DEBOUNCE = 2000;
const MS_RETRY = 15 * 60 * 1000;

// ── Banner ───────────────────────────────────────────────────────────────────
// The illustrated header's scene: 200 × 80, drawn to the banner's right edge. A living room: the television on its
// stand, a speaker, a lamp and the arm of the sofa. While something plays, the screen shows a picture that breathes
// and a play sign; idle, the screen is off. By night (the dark theme), the room is dark and the lamp is lit.
const msScene = ({ night, playing, animate, uid }) => {
  const wall = night ? "#2a2433" : "#efe8f4";
  const tv = night ? "#0e0c13" : "#1d1b26";
  const sofa = night ? ["#4b3f6b", "#40365c"] : ["#8e7cc3", "#7b68b0"];
  const glow = animate && playing ? `<animate attributeName="opacity" values=".12;.32;.12" dur="${MS_LOOP}s" repeatCount="indefinite"/>` : "";
  const shift = animate && playing ? `<animateTransform attributeName="gradientTransform" type="translate" values="0 0;.25 0;0 0" dur="${MS_LOOP}s" repeatCount="indefinite"/>` : "";
  const screen = playing
    ? `<rect x="73" y="13" width="80" height="44" rx="1" fill="url(#s${uid})"/>
       <circle cx="96" cy="30" r="9" fill="#fff" opacity=".18">${glow}</circle>
       <path d="M74 54 L96 38 L112 48 L130 34 L152 50 L152 56 L74 56Z" fill="#000" opacity=".18"/>
       <path d="M108 30 L108 42 L118 36Z" fill="#fff" opacity=".9"/>`
    : `<rect x="73" y="13" width="80" height="44" rx="1" fill="${night ? "#16131d" : "#2b2836"}"/><path d="M78 16 L100 16 L80 34Z" fill="#fff" opacity=".05"/>`;
  return `<defs><linearGradient id="s${uid}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7048e8"/><stop offset="1" stop-color="#e64980"/>${shift}</linearGradient></defs>
    <rect width="200" height="80" fill="${wall}" opacity=".0"/>
    <rect x="70" y="10" width="86" height="50" rx="3" fill="${tv}"/>${screen}
    <rect x="104" y="60" width="18" height="4" fill="${tv}"/>
    <rect x="60" y="64" width="110" height="6" rx="1" fill="${night ? "#4a372f" : "#6d4c41"}"/>
    <rect x="164" y="34" width="12" height="30" rx="2" fill="${night ? "#241f2c" : "#3b3346"}"/><circle cx="170" cy="44" r="3" fill="#6b5f7a"/><circle cx="170" cy="55" r="4" fill="#6b5f7a"/>
    <path d="M8 80 V58 Q8 50 16 50 H52 Q60 50 60 58 V80Z" fill="${sofa[0]}"/><rect x="4" y="60" width="60" height="20" rx="6" fill="${sofa[1]}"/>
    <rect x="182" y="40" width="3" height="28" fill="#6b5f7a"/><path d="M176 40 H192 L188 30 H180Z" fill="${night ? "#ffd75e" : "#ffe8a3"}"/>
    ${night ? `<path d="M178 40 L170 72 H198 L190 40Z" fill="#ffd75e" opacity=".12"/>` : ""}`;
};

// The status pill's place, decided by measurement after each render and each new width (the same rule on every
// card): on the title row, right after the title, only when the whole title and the pill's whole label fit there;
// otherwise on its own line under the subtitle (clamped to one line). When the label is still cut there, or the text
// block leaves the banner or runs over its ground strip, the pill keeps its dot alone, on the title row (its label
// stays in title and aria-label). A card of 200 px or less shows the dot alone anyway (CSS), beside the title.
const msPlacePill = (head, row, ground) => {
  if (!head) return;
  head.removeAttribute("data-wrap");
  head.removeAttribute("data-dot");
  const pill = row.querySelector(":scope > .bpill, :scope > .pill");
  const text = pill?.querySelector(".bpt, .pt");
  if (!text?.getBoundingClientRect || text.getBoundingClientRect().width <= 1) return;
  const name = row.querySelector(".title");
  const gap = parseFloat(getComputedStyle(row).columnGap) || 0;
  const title = name ? (name.scrollWidth > name.clientWidth ? name.scrollWidth : name.getBoundingClientRect().width) + gap : 0;
  if (title + pill.getBoundingClientRect().width <= row.getBoundingClientRect().width + 0.5) return;
  head.setAttribute("data-wrap", "");
  const box = row.parentElement.getBoundingClientRect();
  const frame = head.getBoundingClientRect();
  const out = ground && (box.bottom > ground.getBoundingClientRect().top + 0.5 || box.top < frame.top - 0.5);
  if (text.scrollWidth > text.clientWidth + 0.5 || out) {
    head.removeAttribute("data-wrap");
    head.setAttribute("data-dot", "");
  }
};

// ── Card ─────────────────────────────────────────────────────────────────────
class MediaServerCard extends RcCard {
  static tag = "media-server-card";
  static i18n = MS_I18N;
  static defaults = { illustration: true, illustration_theme: "auto", show_subtitle: true, show_requests: true, animations: true, max_items: 4 };

  static getStubConfig() {
    return {};
  }

  getCardSize() {
    return 7;
  }

  connectedCallback() {
    super.connectedCallback?.();
    this._timer ??= setInterval(() => this._fetch(), MS_REFRESH);
    // A new width: the status pill is fitted again (in the next frame, and only for a new width).
    if (typeof ResizeObserver !== "function") return;
    this._resize ??= new ResizeObserver((entries) => {
      const w = Math.round(entries.at(-1).contentRect.width);
      if (w === this._fitWidth) return;
      this._fitWidth = w;
      cancelAnimationFrame(this._fitFrame);
      this._fitFrame = requestAnimationFrame(() => this._fitPill());
    });
    this._resize.observe(this);
  }

  disconnectedCallback() {
    super.disconnectedCallback?.();
    clearInterval(this._timer);
    this._timer = undefined;
    clearTimeout(this._soon);
    this._soon = undefined;
    this._resize?.disconnect();
    this._fitWidth = undefined;
    if (this._fitFrame) cancelAnimationFrame(this._fitFrame);
    // Left (another view): back to the overview.
    this._tab = null;
  }

  // The lists from the integrations' actions (with return_response), for the platforms found, all at once. A second
  // request while one runs is done right after it.
  async _fetch() {
    const h = this._hass;
    if (!h?.callWS) return;
    if (this._busy) {
      this._again = true;
      return;
    }
    this._busy = true;
    const lists = { coming: [], queue: [], requests: [] };
    let any = false;
    try {
      this._ways ||= {};
      this._failed ||= {};
      const now = Date.now();
      const jobs = MS_ACTIONS.filter(([d, s]) => h.services?.[d]?.[s] && !(now - (this._failed[`${d}.${s}`] ?? -Infinity) < MS_RETRY));
      const done = await Promise.all(jobs.map(([d, s, kind]) => this._call(h, d, s).then((resp) => [d, kind, resp])));
      for (const [domain, kind, resp] of done) {
        if (!resp) continue;
        any = true;
        lists[kind].push(...msItems(resp.response ?? resp, kind).map((x) => ({ ...x, app: domain })));
      }
    } finally {
      this._busy = false;
    }
    this._lists = any ? lists : null;
    this._listsAt = Date.now();
    this._sig = null;
    this._render();
    if (this._again) {
      this._again = false;
      this._fetch();
    }
  }

  // One action: called the way that answered last time, else each way in turn (the integration's config entries ×
  // the entry field's two names × Seerr's filter) until one answers, which is kept. When none answers, the action
  // waits MS_RETRY before it is tried again; with no config entry known yet (the registry still loading), nothing is
  // kept and it is tried at the next fetch.
  async _call(h, domain, service) {
    const key = `${domain}.${service}`;
    const call = (w) => h.callWS({ type: "call_service", domain, service, service_data: { [w.field]: w.entry, ...w.more }, return_response: true }).catch(() => null);
    const known = this._ways[key];
    if (known) {
      const resp = await call(known);
      if (resp) return resp;
      delete this._ways[key];
    }
    const entries = msEntries(h, domain);
    if (!entries.length) return null;
    const extra = domain === "overseerr" ? [{ status: "pending" }, {}] : [{}];
    for (const entry of entries)
      for (const field of ["entry_id", "config_entry_id"])
        for (const more of extra) {
          const way = { entry, field, more };
          const resp = await call(way);
          if (resp) {
            this._ways[key] = way;
            delete this._failed[key];
            return resp;
          }
        }
    this._failed[key] = Date.now();
    return null;
  }

  _fmt(v, digits) {
    try {
      return msIntl(Intl.NumberFormat, this._lang(), { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v);
    } catch {
      return v.toFixed(digits);
    }
  }

  _pct(v) {
    try {
      return msIntl(Intl.NumberFormat, this._lang(), { style: "percent", maximumFractionDigits: 0 }).format(Math.round(v) / 100);
    } catch {
      return `${Math.round(v)}%`;
    }
  }

  // A disk size: in TB from 1000 GB on.
  _size(v, unit) {
    if (/^GB$/i.test(unit) && v >= 1000) return `${this._fmt(v / 1000, 1)} TB`;
    return `${this._fmt(v, v >= 100 ? 0 : 1)} ${unit}`;
  }

  // A date as a day and a time: "Today 21:00", "Tomorrow 20:30", "Friday 22:00".
  _when(t) {
    if (t == null) return "";
    const lang = this._lang();
    const d0 = new Date();
    d0.setHours(0, 0, 0, 0);
    const days = Math.floor((t - d0.getTime()) / 864e5);
    const time = msIntl(Intl.DateTimeFormat, lang, { hour: "numeric", minute: "2-digit" }).format(new Date(t));
    const day = days === 0 ? this._t("today") : days === 1 ? this._t("tomorrow") : msIntl(Intl.DateTimeFormat, lang, days < 7 && days > 0 ? { weekday: "long" } : { day: "numeric", month: "short" }).format(new Date(t));
    return `${day} ${time}`;
  }

  // The sessions, the counts and the lists.
  _collect() {
    const h = this._hass;
    const c = this._config;
    const found = rcMemo((this._memo ||= {}), "find", [c.entities, h.entities], () => msFind(h, c.entities || {}));
    const players = (c.players?.length ? c.players : found.players).filter((id) => h.states[id]);
    const sessions = players
      .map((id) => h.states[id])
      .filter((st) => st.state === "playing" || st.state === "paused")
      .map(msSession)
      .sort((a, b) => a.paused - b.paused);
    const sum = (role) => {
      const vals = (found.roles[role] || []).map((id) => msNum(h.states[id])).filter((v) => v != null);
      return vals.length ? vals.reduce((a, b) => a + b, 0) : null;
    };
    const counts = { upcoming: sum("upcoming"), queue: sum("queue"), wanted: sum("wanted"), requests: sum("requests"), transcoding: sum("transcoding"), watching: sum("watching") };
    const bwSt = (found.roles.bandwidth || []).map((id) => h.states[id]).find((st) => msNum(st) != null);
    const diskSt = (found.roles.diskspace || []).map((id) => h.states[id]).find((st) => msNum(st) != null);
    // The lists, fetched at first, every MS_REFRESH and shortly after a count changes (see MS_DEBOUNCE).
    const key = JSON.stringify(counts);
    const stale = !this._listsAt || Date.now() - this._listsAt > MS_REFRESH;
    if (h.callWS && !this._soon && (this._listsKey !== key || (stale && !this._busy))) {
      this._listsKey = key;
      if (!this._listsAt && !this._busy) this._fetch();
      else
        this._soon = setTimeout(() => {
          this._soon = undefined;
          this._fetch();
        }, MS_DEBOUNCE);
    }
    const L = this._lists;
    const now = Date.now();
    const coming = (L?.coming || []).filter((x) => x.date == null || x.date >= now - 3 * 3.6e6).sort((a, b) => (a.date ?? Infinity) - (b.date ?? Infinity));
    const queue = (L?.queue || []).slice().sort((a, b) => (b.progress ?? -1) - (a.progress ?? -1));
    const requests = (L?.requests || []).filter((x) => !x.status || /pending|1/.test(x.status) || x.status === "pending");
    const streams = sessions.length || counts.watching || 0;
    const nComing = L ? coming.length : (counts.upcoming ?? 0);
    const nQueue = L ? queue.length : (counts.queue ?? 0);
    const nReq = L?.requests.length ? requests.length : (counts.requests ?? 0);
    const none = !found.platforms.length && !players.length;
    const playing = sessions.some((s) => !s.paused) || (!sessions.length && streams > 0);
    const state = none ? "none" : streams > 0 ? "playing" : nQueue > 0 ? "downloading" : "idle";
    const unit = bwSt?.attributes?.unit_of_measurement || "kbit/s";
    const mbps = bwSt ? (/^Mbit/i.test(unit) ? msNum(bwSt) : /^Gbit/i.test(unit) ? msNum(bwSt) * 1000 : msNum(bwSt) / 1000) : null;
    return {
      none,
      state,
      playing,
      name: c.title || this._t("title"),
      sub: found.platforms.map((p) => MS_NAMES[p]).join(" · "),
      sessions,
      streams,
      transcoding: counts.transcoding,
      mbps,
      disk: diskSt ? this._size(msNum(diskSt), diskSt.attributes?.unit_of_measurement || "GB") : null,
      coming,
      queue,
      requests,
      nComing,
      nQueue,
      nReq,
      wanted: counts.wanted,
      hasLists: !!L,
      roles: found.roles,
    };
  }

  _dark() {
    return !!this._hass.themes?.darkMode;
  }

  // The banner's night: forced by `illustration_theme`, else Home Assistant's dark theme alone.
  _night() {
    const theme = this._config.illustration_theme;
    if (theme === "night" || theme === "day") return theme === "night";
    return this._dark();
  }

  _animate() {
    if (this._config.animations === false) return false;
    try {
      return !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    } catch {
      return true;
    }
  }

  // Unique per card: the SVG ids of several cards on one page never clash.
  _id() {
    this._uid ||= Math.random().toString(36).slice(2, 8);
    return this._uid;
  }

  _status(m) {
    return m.state === "playing" ? this._t("st_playing", { n: m.streams }) : this._t(`st_${m.state === "none" ? "offline" : m.state}`);
  }

  // The illustrated header: the badge (the state's icon, in the state's colour), the title and `sub` on the wall at
  // the left, the living room at the right, a 10 px parquet strip edge to edge.
  _banner(m, sub, pill = "") {
    const nav = this._config.navigation_path;
    const night = this._night();
    const scene = msScene({ night, playing: m.playing, animate: this._animate(), uid: this._id() });
    const chip = pill ? `<span class="bpill" title="${rcEsc(pill)}" aria-label="${rcEsc(pill)}"><span class="bdot"></span><span class="bpt">${rcEsc(pill)}</span></span>` : "";
    return `
      <div class="banner${night ? " night" : ""}">
        <div class="head${nav ? " nav" : ""}"${nav ? ' role="link" tabindex="0"' : ""}>
          <div class="badge"><ha-icon icon="${MS_ICONS[m.state]}"></ha-icon></div>
          <div class="tt"><div class="trow"><div class="title">${rcEsc(m.name)}</div>${chip}</div>${sub}</div>
        </div>
        <svg class="room" viewBox="0 0 200 80" preserveAspectRatio="xMaxYMax slice" aria-hidden="true">${scene}</svg>
        <div class="ground"></div>
      </div>`;
  }

  // The status pill's place, on the banner and on the classic header (see msPlacePill).
  _fitPill() {
    for (const row of this.shadowRoot?.querySelectorAll?.(".trow") || []) {
      const banner = row.closest(".banner");
      msPlacePill(banner || row.closest(".head"), row, banner?.querySelector(".ground"));
    }
  }

  _ep(x) {
    return x.ep ? this._t("episode", { s: x.ep.s, e: x.ep.e }) : "";
  }

  _thumb(title) {
    const [a, b] = msHue(title);
    return `<span class="th" style="background:linear-gradient(135deg, ${a}, ${b})" aria-hidden="true"></span>`;
  }

  _bar(p, cls = "") {
    return p == null ? "" : `<span class="bar${cls}"><span style="width:${Math.round(p)}%"></span></span>`;
  }

  // The four counters, each opening its list.
  _counters(m) {
    const c = this._config;
    const subs = {
      playing: m.streams ? [m.mbps != null && `${this._fmt(m.mbps, m.mbps >= 100 ? 0 : 1)} Mb/s`, m.transcoding ? this._t("sub_transcode", { n: m.transcoding }) : null].filter(Boolean).join(" · ") || this._t("now_playing") : this._t("sub_none"),
      coming: m.coming[0]?.date ? this._t("sub_next", { d: this._when(m.coming[0].date) }) : m.nComing ? "" : this._t("sub_none"),
      queue: m.nQueue ? this._t("sub_queued") : m.wanted ? this._t("sub_wanted", { n: m.wanted }) : this._t("sub_none"),
      requests: m.nReq ? this._t("sub_pending") : this._t("sub_none"),
    };
    const value = { playing: m.streams, coming: m.nComing, queue: m.nQueue, requests: m.nReq };
    return `<div class="ctr">${MS_TABS.filter(([k]) => k !== "requests" || c.show_requests !== false)
      .map(
        ([k, label, icon]) =>
          `<button class="cn c-${k}${this._tab === k ? " on" : ""}" data-tab="${k}" data-toggle="1" data-k="tab-${k}" aria-pressed="${this._tab === k}"><span class="cl"><ha-icon icon="${icon}"></ha-icon>${rcEsc(this._t(label))}</span><span class="cv">${value[k]}</span><span class="cs">${rcEsc(subs[k])}</span></button>`,
      )
      .join("")}</div>`;
  }

  _rows(kind, m) {
    const max = Math.max(1, Math.min(20, Number(this._config.max_items) || 4));
    if (kind === "playing") {
      if (!m.sessions.length) return `<div class="empty">${rcEsc(this._t("nothing_playing"))}</div>`;
      return `<div class="pl">${m.sessions
        .slice(0, max)
        .map(
          (s) =>
            `<button class="ps" data-id="${rcEsc(s.id)}">${this._thumb(s.title)}<span class="pt2"><span class="tl">${rcEsc(s.title)}</span><span class="sb">${rcEsc([this._ep(s), s.device, s.paused ? this._t("paused") : ""].filter(Boolean).join(" · "))}</span>${this._bar(s.progress == null ? null : s.progress * 100)}</span></button>`,
        )
        .join("")}</div>`;
    }
    if (!m.hasLists) return `<div class="empty">${rcEsc(this._t("no_list"))}</div>`;
    const list = { coming: m.coming, queue: m.queue, requests: m.requests }[kind];
    if (!list.length) return `<div class="empty">${rcEsc(this._t({ coming: "nothing_coming", queue: "nothing_queued", requests: "nothing_requested" }[kind]))}</div>`;
    return `<div class="li">${list
      .slice(0, max)
      .map((x) => {
        const title = [x.title, this._ep(x)].filter(Boolean).join(" ");
        if (kind === "queue")
          return `<div class="qi"><span class="tl">${rcEsc(title)}</span><span class="pc">${x.progress == null ? "" : this._pct(x.progress)}</span>${this._bar(x.progress, " dl")}</div>`;
        if (kind === "coming") return `<div class="ci">${this._thumb(x.title)}<span class="pt2"><span class="tl">${rcEsc(title)}</span><span class="sb">${rcEsc([x.episode, MS_NAMES[x.app]].filter(Boolean).join(" · "))}</span></span><span class="wh">${rcEsc(this._when(x.date))}</span></div>`;
        const st = x.status && this._t(`req_${x.status}`) !== `req_${x.status}` ? this._t(`req_${x.status}`) : this._t("req_pending");
        return `<div class="ci">${this._thumb(x.title)}<span class="pt2"><span class="tl">${rcEsc(title)}</span><span class="sb">${rcEsc(x.user ? this._t("by", { u: x.user }) : "")}</span></span><span class="rq">${rcEsc(st)}</span></div>`;
      })
      .join("")}</div>`;
  }

  // Under the counters: the overview (what is playing, the queue), or the list of the counter tapped, with its tabs.
  _panel(m) {
    if (this._tab) {
      const tabs = MS_TABS.filter(([k]) => k !== "requests" || this._config.show_requests !== false)
        .map(([k, label]) => `<button class="tb${this._tab === k ? " on" : ""}" data-tab="${k}" data-k="tb-${k}" aria-pressed="${this._tab === k}">${rcEsc(this._t(label))}</button>`)
        .join("");
      return `<div class="box"><div class="tabs" role="group">${tabs}<button class="tb back" data-tab="" data-k="tb-back" title="${rcEsc(this._t("back"))}" aria-label="${rcEsc(this._t("back"))}"><ha-icon icon="mdi:close"></ha-icon></button></div>${this._rows(this._tab, m)}</div>`;
    }
    const playing = `<div class="box"><div class="bh"><span><ha-icon icon="mdi:play"></ha-icon>${rcEsc(this._t("now_playing"))}</span></div>${this._rows("playing", m)}</div>`;
    const queue = m.nQueue || m.disk ? `<div class="box"><div class="bh"><span><ha-icon icon="mdi:download"></ha-icon>${rcEsc(this._t("queue"))}</span>${m.disk ? `<span>${rcEsc(this._t("free", { v: m.disk }))}</span>` : ""}</div>${this._rows("queue", m)}</div>` : "";
    return playing + queue;
  }

  _draw(m) {
    const c = this._config;
    const status = this._status(m);
    if (!this._changed([m, this._tab, this._night(), this._dark()])) return;
    const sub = c.show_subtitle !== false && m.sub ? `<div class="subt">${rcEsc(m.sub)}</div>` : "";
    const head =
      c.illustration !== false
        ? this._banner(m, sub, m.none ? "" : status)
        : `<div class="head${c.navigation_path ? " nav" : ""}"${c.navigation_path ? ' role="link" tabindex="0"' : ""}>
            <div class="badge"><ha-icon icon="${MS_ICONS[m.state]}"></ha-icon></div>
            <div class="tt"><div class="trow"><div class="title">${rcEsc(m.name)}</div>${m.none ? "" : `<span class="pill" title="${rcEsc(status)}" aria-label="${rcEsc(status)}"><span class="pt">${rcEsc(status)}</span></span>`}</div>${sub}</div>
          </div>`;
    const dk = this._dark() ? " dk" : "";
    if (m.none) {
      this._paint("none", `${head}<div class="box empty">${rcEsc(this._t("no_server"))}</div>`, "", dk);
      this._fitPill();
      return;
    }
    this._paint(m.state, head + this._counters(m) + this._panel(m), "", dk);
    this._fitPill();
  }

  _bindAfter(root) {
    for (const b of root.querySelectorAll("[data-tab]") || [])
      b.addEventListener("click", (ev) => {
        ev.stopPropagation();
        const tab = b.dataset.tab || null;
        // A counter opens its list, and closes it when it is the one open; a tab opens its list; the cross closes.
        this._tab = b.dataset.toggle && tab === this._tab ? null : tab;
        this._sig = null;
        this._render();
      });
    for (const b of root.querySelectorAll(".ps[data-id]") || []) b.addEventListener("click", () => rcMoreInfo(this, b.dataset.id));
  }

  static styles = `
    :host { --ms-play: #ae3ec9; --ms-coming: #7048e8; --ms-dl: #1c7ed6; --ms-req: #d9480f; }
    ha-card.lvl-playing { --c: var(--ms-play); }
    ha-card.lvl-downloading { --c: var(--ms-dl); }
    ha-card.lvl-idle, ha-card.lvl-offline, ha-card.lvl-none { --c: var(--rc-idle); }
    .tt { flex: 1 1 0; min-width: 5ch; display: flex; flex-direction: column; }
    .tt .title { flex: none; }
    .subt { font-size: 12px; color: var(--secondary-text-color); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    :host([hide-title]) .head .tt { visibility: hidden; }
    .ctr { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-top: 12px; }
    .cn { all: unset; box-sizing: border-box; cursor: pointer; min-width: 0; display: flex; flex-direction: column; gap: 3px; padding: 10px 12px; border-radius: 12px;
          --t: var(--ms-play); background: color-mix(in srgb, var(--t) 9%, var(--card-background-color, #fff)); box-shadow: inset 0 0 0 1px transparent; }
    .cn.c-coming { --t: var(--ms-coming); } .cn.c-queue { --t: var(--ms-dl); } .cn.c-requests { --t: var(--ms-req); }
    .cn:hover { background: color-mix(in srgb, var(--t) 15%, var(--card-background-color, #fff)); }
    .cn.on { box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--t) 70%, transparent); }
    .cn:focus-visible, .tb:focus-visible, .ps:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 2px; }
    .cl { display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--primary-text-color); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .cl ha-icon { --mdc-icon-size: 18px; color: var(--t); flex: none; }
    .cv { font-size: 26px; font-weight: 500; line-height: 1.1; color: var(--primary-text-color); }
    .cs { font-size: 12px; color: var(--secondary-text-color); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-height: 15px; }
    .box { margin-top: 10px; border-radius: 12px; padding: 10px 12px; background: var(--secondary-background-color, rgba(127,127,127,.08)); }
    .box.empty, .empty { font-size: 13px; color: var(--secondary-text-color); }
    .bh { display: flex; justify-content: space-between; gap: 8px; font-size: 13px; color: var(--secondary-text-color); margin-bottom: 8px; }
    .bh span { display: inline-flex; align-items: center; gap: 6px; }
    .bh ha-icon { --mdc-icon-size: 16px; color: var(--c); }
    .pl { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
    .ps { all: unset; cursor: pointer; display: flex; gap: 8px; align-items: center; min-width: 0; border-radius: 8px; }
    .th { flex: none; width: 36px; height: 50px; border-radius: 8px; }
    .pt2 { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 3px; }
    .tl { font-size: 13px; font-weight: 500; color: var(--primary-text-color); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .sb { font-size: 11px; color: var(--secondary-text-color); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .bar { display: block; height: 6px; border-radius: 3px; overflow: hidden; background: color-mix(in srgb, var(--ms-play) 16%, transparent); }
    .bar span { display: block; height: 100%; background: var(--ms-play); }
    .bar.dl { grid-column: 1 / -1; background: color-mix(in srgb, var(--ms-dl) 16%, transparent); }
    .bar.dl span { background: var(--ms-dl); }
    .li { display: flex; flex-direction: column; gap: 8px; }
    .qi { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 4px 10px; font-size: 13px; }
    .pc { color: var(--secondary-text-color); font-size: 12px; }
    .ci { display: flex; align-items: center; gap: 8px; min-width: 0; }
    .ci .th { width: 28px; height: 40px; border-radius: 6px; }
    .wh { flex: none; font-size: 12px; color: var(--secondary-text-color); white-space: nowrap; }
    .rq { flex: none; font-size: 11px; font-weight: 500; padding: 1px 8px; border-radius: 999px; color: color-mix(in srgb, var(--ms-req) 55%, var(--primary-text-color, #212121)); background: color-mix(in srgb, var(--ms-req) 14%, transparent); }
    .tabs { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; margin-bottom: 10px; }
    .tb { all: unset; cursor: pointer; display: inline-flex; align-items: center; min-height: 32px; padding: 0 12px; border-radius: 999px; font-size: 13px; font-weight: 500; color: var(--primary-text-color); }
    .tb:hover { background: color-mix(in srgb, var(--c) 10%, transparent); }
    .tb.on { color: color-mix(in srgb, var(--c) 55%, var(--primary-text-color, #212121)); background: color-mix(in srgb, var(--c) 16%, transparent); }
    .tb.back { margin-left: auto; width: 32px; padding: 0; justify-content: center; }
    .tb.back ha-icon { --mdc-icon-size: 18px; }
    @container (max-width: 300px) {
      .pl { grid-template-columns: minmax(0, 1fr); }
      .cv { font-size: 22px; }
    }
    /* Illustrated header (banner): 90 px, edge to edge, the title on the wall, the living room at the right,
       a 10 px parquet strip at the bottom. The badge's icon is in the state's colour, grey when idle, by day and night. */
    .banner { position: relative; display: flex; height: 90px; margin: -12px -12px 0; overflow: hidden;
              background: linear-gradient(180deg, #f3eef7 0%, #e9e1f1 100%);
              --bt: #0d2a45; --bs: #3b5b78; --ic: color-mix(in srgb, var(--c) 85%, #10283f); --sw: min(200px, 56%); }
    .banner.night { background: linear-gradient(180deg, #231e2c 0%, #2b2436 100%); --bt: #fff; --bs: rgba(255,255,255,.78); --ic: color-mix(in srgb, var(--c) 72%, #fff); }
    .lvl-idle .banner, .lvl-offline .banner, .lvl-none .banner { --ic: #6b7680; }
    .lvl-idle .banner.night, .lvl-offline .banner.night, .lvl-none .banner.night { --ic: #a7b0b8; }
    .banner .head { position: relative; z-index: 1; flex: 1; min-width: 0; height: 80px; box-sizing: border-box;
                    padding: 0 calc(var(--sw) + 4px) 0 14px; flex-wrap: nowrap; }
    .banner .head::after { content: none; }
    .banner .badge { position: relative; color: var(--ic); background: rgba(255,255,255,.62); box-shadow: inset 0 0 0 1px rgba(13,42,69,.12); }
    .banner.night .badge { background: rgba(255,255,255,.12); box-shadow: inset 0 0 0 1px rgba(255,255,255,.14); }
    .banner .title { color: var(--bt); }
    .banner .subt { color: var(--bs); font-size: 13px; }
    .banner .room { position: absolute; right: 0; bottom: 10px; width: var(--sw); height: calc(80px * var(--sk, 1)); }
    .banner .ground { position: absolute; left: 0; right: 0; bottom: 0; height: 10px; background: repeating-linear-gradient(90deg, #8d6e63 0 26px, #9c7b6f 26px 52px); }
    .banner.night .ground { background: repeating-linear-gradient(90deg, #3e2f2a 0 26px, #4a3830 26px 52px); }
    /* The mini card's expand / collapse button: 24 px, frosted, 5 px from the banner's top right corner. */
    .banner .zoom { position: absolute; z-index: 2; top: 5px; right: 5px; width: 24px; height: 24px; margin: 0; color: #33506b;
                    background: rgba(255,255,255,.55); box-shadow: inset 0 0 0 1px rgba(255,255,255,.7); backdrop-filter: blur(4px); }
    .banner.night .zoom { color: #fff; background: rgba(255,255,255,.12); box-shadow: inset 0 0 0 1px rgba(255,255,255,.2); }
    .banner .zoom:hover { background: rgba(255,255,255,.75); color: #33506b; }
    .banner.night .zoom:hover { background: rgba(255,255,255,.22); color: #fff; }
    .banner .tt { min-width: 0; flex: 1 1 auto; }
    /* Status pill right after the title (see msPlacePill). */
    .trow { display: flex; align-items: center; gap: 8px; min-width: 0; }
    .trow > .title { flex: 0 1 auto; min-width: 0; }
    .trow > .bpill, .trow > .pill { flex: none; max-width: none; }
    :host([hide-title]) .trow .title { visibility: hidden; }
    .head:has(.trow) { flex-wrap: nowrap; }
    .head:has(.trow)::after { content: none; }
    .bpill { display: inline-flex; align-items: center; gap: 4px; min-width: 0; box-sizing: border-box; overflow: hidden;
             white-space: nowrap; padding: 1px 8px; border-radius: 12px; font-size: 11px; font-weight: 500; line-height: 16px;
             background: color-mix(in srgb, var(--c) 18%, rgba(255,255,255,.78)); color: color-mix(in srgb, var(--c) 45%, #0d2a45); }
    .banner.night .bpill { background: color-mix(in srgb, var(--c) 30%, rgba(8,18,38,.55)); color: color-mix(in srgb, var(--c) 35%, #ffffff); }
    .bdot { width: 7px; height: 7px; border-radius: 50%; background: var(--c); flex: none; }
    .bpt { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
    [data-wrap] .trow { display: contents; }
    [data-wrap] .trow > .bpill, [data-wrap] .trow > .pill { order: 9; align-self: flex-start; max-width: 100%; margin-top: 3px; }
    .banner[data-wrap] .trow > .bpill { max-width: calc(100cqw - 80px); }
    [data-wrap] .subt { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    [data-dot] .bpill { padding: 0; background: none; }
    [data-dot] .bpt, [data-dot] .trow > .pill .pt { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
    [data-dot] .trow > .pill { padding: 0; width: 18px; height: 18px; justify-content: center; background: none; }
    [data-dot] .trow > .pill::before { content: ""; width: 8px; height: 8px; border-radius: 50%; background: var(--c); }
    @container (max-width: 200px) {
      .bpill { padding: 0; background: none; }
      .bpt, .trow > .pill .pt { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
      .trow > .pill { padding: 0; width: 18px; height: 18px; justify-content: center; background: none; }
      .trow > .pill::before { content: ""; width: 8px; height: 8px; border-radius: 50%; background: var(--c); }
    }
    /* The mini card: the banner alone, its readings as chips on the wall. */
    ha-card.bn { padding: 0; }
    ha-card.bn > .banner { margin: 0; --sw: min(200px, 46%); }
    /* Narrower cards: the room is drawn smaller (75 %, 62 %, then 50 % of its height, its left part cropped). */
    @container (max-width: 420px) { .banner, ha-card.bn > .banner { --sw: 150px; --sk: .75; } }
    @container (max-width: 340px) { .banner, ha-card.bn > .banner { --sw: 112px; --sk: .62; } }
    @container (max-width: 260px) { .banner, ha-card.bn > .banner { --sw: 70px; --sk: .5; } }
    /* The chips that do not fit wrap to a second line, hidden: never a chip cut to "R…". */
    .banner .rs { display: flex; flex-wrap: wrap; gap: 4px; height: 20px; margin: 3px 0 0 -2px; min-width: 0; overflow: hidden; }
    .banner .r { flex: none; line-height: 20px; padding: 0 7px; color: var(--bt); background: rgba(255,255,255,.62); }
    .banner.night .r { background: rgba(10,20,40,.4); }
    .banner span.r { cursor: default; }
    .banner .ringb { position: absolute; inset: 0; }
    /* Home Assistant's dark theme: the sun's colours on a dark tile. */
    ha-card.dk { --sf-l1: #4a3d1f; --sf-l2: #7a5a1c; --sf-l3: #b07818; --sf-l4: #e08a18; --sf-l5: #f76707; }
  `;
}

// ── Editor ───────────────────────────────────────────────────────────────────
const msSchema = (booleans) => (lang) => [
  { name: "title", selector: { text: {} } },
  { name: "navigation_path", selector: { navigation: {} } },
  { name: "players", selector: { entity: { domain: "media_player", multiple: true } } },
  { name: "max_items", selector: { number: { min: 1, max: 20, step: 1, mode: "box" } } },
  ...rcBooleans(...booleans),
  {
    name: "illustration_theme",
    selector: { select: { mode: "dropdown", options: ["auto", "day", "night"].map((value) => ({ value, label: rcT(MS_I18N, lang, `ed_theme_${value}`) })) } },
  },
  ...rcAdvanced(MS_I18N, lang, "entities", "language"),
];

const MS_HELPERS = ["title", "players", "max_items", "zoom", "entities", "language"];

const MediaServerCardEditor = rcEditor({
  card: MediaServerCard,
  helpers: MS_HELPERS,
  schema: msSchema(["show_title", "show_subtitle", "illustration", "show_requests", "animations"]),
});

rcRegister(MediaServerCard, MediaServerCardEditor, "Media Server Card", "What the media server is doing: streams, coming up, downloads and requests from Jellyfin, Plex, Emby, Tautulli, the *arr apps and Seerr");

// ── Mini card ────────────────────────────────────────────────────────────────
// The server on two lines: the state as the pill (what plays), the next episode or film as a chip; the zoom button
// opens the full card in place.
class MediaServerMiniCard extends rcMini(MediaServerCard, "media-server-mini-card", "") {
  getCardSize() {
    return this._zoomed ? super.getCardSize() : 1;
  }

  _drawMini(m) {
    const night = this._night();
    const next = m.coming[0];
    if (!this._changed(["mini", m.state, m.streams, m.playing, next?.title, next?.date, night, this._dark()])) return;
    const status = this._status(m);
    const chip = m.none
      ? this._t("no_server")
      : next
        ? this._t("chip_next", { t: [next.title, this._ep(next)].filter(Boolean).join(" "), d: this._when(next.date) })
        : m.sessions[0]
          ? m.sessions[0].title
          : "";
    const c = this._config;
    this.shadowRoot.innerHTML = `<style>${RC_BASE_STYLES}${this.constructor.styles}</style>
      <ha-card class="lvl-${m.state} bn${this._dark() ? " dk" : ""}">${this._banner(m, chip ? `<div class="rs"><span class="r" title="${rcEsc(chip)}"><span>${rcEsc(chip)}</span></span></div>` : "", m.none ? "" : status)}</ha-card>`;
    if (c.navigation_path) rcBindNav(this.shadowRoot.querySelector(".head"), c.navigation_path);
    this._fitPill();
  }
}

const MediaServerMiniCardEditor = rcEditor({
  card: MediaServerMiniCard,
  helpers: MS_HELPERS,
  schema: msSchema(["show_title", "show_subtitle", "illustration", "show_requests", "animations", "zoom"]),
});

rcRegister(MediaServerMiniCard, MediaServerMiniCardEditor, "Media Server Mini Card", "The media server on two lines: what plays and what comes next, with a zoom to the full card");
