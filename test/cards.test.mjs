import assert from "node:assert/strict";
import { test } from "node:test";
import { makeHass, NOW } from "./hass.mjs";
import { fakeNode, load } from "./load.mjs";

const ms = load({ now: NOW });
const { cards } = ms;
const json = (v) => JSON.parse(JSON.stringify(v));
const settle = async () => {
  for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0));
};

// A card whose shadow root answers every selector with nodes recording their click listeners; the lists fetched
// (callWS) before the test reads them.
const make = async (tag, config = {}, hass = makeHass()) => {
  const card = new cards[tag]();
  card.attachShadow();
  const nodes = {};
  card.shadowRoot.querySelector = (s) => (nodes[s] ||= fakeNode());
  card.setConfig({ type: `custom:${tag}`, ...config });
  card.hass = hass;
  await settle();
  return card;
};

test("both cards are registered, with their editors and a picker entry", () => {
  for (const tag of ["media-server-card", "media-server-mini-card"]) {
    assert.ok(ms.customElements.get(tag), tag);
    assert.ok(ms.customElements.get(`${tag}-editor`), `${tag}-editor`);
  }
  assert.deepEqual(json(ms.window.customCards.map((c) => c.type)), ["media-server-card", "media-server-mini-card"]);
});

test("discovery: the sessions' players and the sensors of each role, by platform; overrides win", () => {
  const h = makeHass();
  const f = ms.msFind(h);
  assert.equal(f.players.length, 3);
  assert.deepEqual(json(f.roles.queue), ["sensor.sonarr_queue", "sensor.radarr_queue"]);
  assert.deepEqual(json(f.roles.watching), ["sensor.tautulli_watching"]);
  assert.deepEqual(json(f.roles.transcoding), ["sensor.tautulli_stream_count_transcode"]);
  assert.deepEqual(json(f.roles.bandwidth), ["sensor.tautulli_total_bandwidth"]);
  assert.deepEqual(json(f.roles.diskspace), ["sensor.sonarr_disk_space"]);
  assert.deepEqual(json(f.roles.requests), ["sensor.overseerr_pending_requests"]);
  assert.deepEqual(json(f.platforms), ["jellyfin", "tautulli", "sonarr", "radarr", "overseerr"]);
  assert.deepEqual(json(ms.msFind(h, { queue: "sensor.x" }).roles.queue), ["sensor.x"]);
});

test("items: lists, records keyed by title, nested media, progress from the size left", () => {
  const a = ms.msItems({ episodes: [{ series_title: "A", season_number: 1, episode_number: 2, title: "Pilot", air_date_utc: "2026-06-20T19:00:00Z" }] }, "coming");
  assert.equal(a[0].title, "A");
  assert.deepEqual(json(a[0].ep), { s: 1, e: 2 });
  assert.equal(a[0].episode, "Pilot");
  const b = ms.msItems({ shows: { "B S01E01": { progress: "40.5%" } } }, "queue");
  assert.deepEqual([b[0].title, b[0].progress], ["B S01E01", 40.5]);
  const c = ms.msItems({ movies: [{ title: "C", size: 100, sizeleft: 25 }] }, "queue");
  assert.equal(c[0].progress, 75);
  const d = ms.msItems([{ media: { title: "D" }, requested_by: { display_name: "Sam" }, status: 1 }], "requests");
  assert.deepEqual([d[0].title, d[0].user, d[0].status], ["D", "Sam", "pending"]);
});

test("a session: the series and the episode, the device, paused, the progress", () => {
  const h = makeHass();
  const s = ms.msSession(h.states["media_player.bedroom_tablet"]);
  assert.deepEqual([s.title, s.episode, s.device, s.paused], ["Paper Lanterns", "The Long Walk", "Bedroom tablet", true]);
  assert.deepEqual(json(s.ep), { s: 2, e: 3 });
  assert.ok(Math.abs(s.progress - 520 / 2900) < 1e-9);
  assert.equal(ms.msHue("x").length, 2);
});

test("full card: counters, what is playing, the queue, the lists from the actions", async () => {
  const hass = makeHass();
  const card = await make("media-server-card", {}, hass);
  const m = card._items;
  const calls = hass.ws.filter((w) => w.type === "call_service").map((w) => `${w.domain}.${w.service}`);
  assert.deepEqual([...new Set(calls)], ["sonarr.get_upcoming", "radarr.get_upcoming", "sonarr.get_queue", "radarr.get_queue", "overseerr.get_requests"]);
  assert.equal(m.state, "playing");
  assert.equal(m.streams, 2);
  assert.equal(m.nComing, 4);
  assert.equal(m.nQueue, 2);
  assert.equal(m.nReq, 1);
  assert.equal(m.coming[0].title, "Harbor Lights", "the next one first");
  assert.equal(m.queue[0].title, "Harbor Lights", "the furthest download first");
  const html = card.shadowRoot.innerHTML;
  assert.match(html, /<span class="bpt">Playing: 2<\/span>/);
  assert.match(html, /<div class="subt">Jellyfin · Tautulli · Sonarr · Radarr · Seerr<\/div>/);
  assert.match(html, /<span class="cs">18\.4 Mb\/s · transcoding: 1<\/span>/);
  assert.match(html, /<span class="cs">next Today 9:00\s?PM<\/span>/);
  assert.match(html, /<span class="tl">The Quiet Orbit<\/span>/);
  assert.match(html, /S2 E3 · Bedroom tablet · paused/);
  assert.match(html, /3\.1 TB free/);
  assert.match(html, /<span class="pc">74%<\/span>/);
});

test("lists: the config entry from hass.devices, never the admin-only entity registry", async () => {
  const hass = makeHass();
  const card = await make("media-server-card", {}, hass);
  assert.equal(hass.ws.filter((w) => w.type !== "call_service").length, 0, "no registry call");
  assert.equal(card._items.nComing, 4);
  assert.deepEqual(json(ms.msEntries(hass, "sonarr")), ["sonarr_entry"]);
  assert.deepEqual(json(ms.msEntries({ entities: hass.entities }, "sonarr")), [], "no devices yet: no entry");
});

test("lists: the way that answered is kept; an action that never answers waits before it is tried again", async () => {
  const hass = makeHass();
  delete hass.__data["radarr.get_upcoming"];
  const card = await make("media-server-card", {}, hass);
  const calls = (from) => hass.ws.slice(from).map((w) => `${w.domain}.${w.service}`);
  assert.equal(calls(0).filter((c) => c === "radarr.get_upcoming").length, 2, "both field names tried");
  assert.equal(card._failed["radarr.get_upcoming"], NOW);
  let from = hass.ws.length;
  await card._fetch();
  assert.deepEqual(calls(from), ["sonarr.get_upcoming", "sonarr.get_queue", "radarr.get_queue", "overseerr.get_requests"], "one call each, the failed one skipped");
  card._failed["radarr.get_upcoming"] = NOW - 16 * 60 * 1000;
  from = hass.ws.length;
  await card._fetch();
  assert.ok(calls(from).includes("radarr.get_upcoming"), "tried again after the delay");
  // The registry not loaded yet: nothing is kept, the next fetch tries again.
  const early = await make("media-server-card", {}, { ...makeHass(), devices: {} });
  assert.deepEqual(json(early._failed), {});
  assert.equal(early._items.hasLists, false);
});

test("lists: a count that changes fetches once, a moment later", async () => {
  const hass = makeHass();
  const card = await make("media-server-card", {}, hass);
  const from = hass.ws.length;
  const bump = (v) => {
    const states = { ...hass.states, "sensor.sonarr_queue": { ...hass.states["sensor.sonarr_queue"], state: v } };
    card.hass = { ...hass, states };
  };
  bump("2");
  const timer = card._soon;
  assert.ok(timer, "scheduled");
  bump("3");
  assert.equal(card._soon, timer, "one fetch for the burst");
  assert.equal(hass.ws.length, from, "nothing fetched at once");
  await new Promise((r) => setTimeout(r, 2100));
  await settle();
  assert.equal(hass.ws.length - from, 5, "one round of the five actions");
  card.disconnectedCallback();
});

test("the counters open their list, the tabs switch, the counter or the cross closes it", async () => {
  const card = await make("media-server-card");
  const buttons = [];
  card.shadowRoot.querySelectorAll = (s) => (s === "[data-tab]" ? buttons : []);
  const button = (tab, toggle) => ({ dataset: { tab, ...(toggle ? { toggle: "1" } : {}) }, addEventListener(_t, fn) { this.fn = fn; } });
  const coming = button("coming", true);
  const tabRequests = button("requests");
  const back = button("");
  buttons.push(coming, tabRequests, back);
  card._bindAfter(card.shadowRoot);
  const ev = { stopPropagation() {} };
  coming.fn(ev);
  assert.equal(card._tab, "coming");
  assert.match(card.shadowRoot.innerHTML, /class="tabs"/);
  assert.match(card.shadowRoot.innerHTML, /Copper Valley S3 E1/);
  tabRequests.fn(ev);
  assert.equal(card._tab, "requests");
  assert.match(card.shadowRoot.innerHTML, /Glass Garden/);
  assert.match(card.shadowRoot.innerHTML, /by Sam/);
  card._tab = "coming";
  coming.fn(ev);
  assert.equal(card._tab, null, "the open counter closes its list");
  card._tab = "queue";
  back.fn(ev);
  assert.equal(card._tab, null);
});

test("states: downloading, idle, no server; without the actions, the counts alone", async () => {
  assert.equal((await make("media-server-card", {}, makeHass("downloading")))._items.state, "downloading");
  const idle = await make("media-server-card", {}, makeHass("idle"));
  assert.equal(idle._items.state, "idle");
  assert.match(idle.shadowRoot.innerHTML, /Nothing playing/);
  const none = await make("media-server-card", {}, { ...makeHass("idle"), entities: {}, states: {} });
  assert.equal(none._items.state, "none");
  assert.match(none.shadowRoot.innerHTML, /No media server found/);
  const counts = await make("media-server-card", {}, makeHass("playing", { ws: false }));
  assert.equal(counts._items.hasLists, false);
  assert.equal(counts._items.nComing, 3, "Sonarr's upcoming sensor");
  assert.equal(counts._items.nQueue, 2);
});

test("mini card: the state as the pill, the next episode as a chip", async () => {
  const card = await make("media-server-mini-card");
  const html = card.shadowRoot.innerHTML;
  assert.match(html, /<ha-card class="lvl-playing bn">/);
  assert.match(html, /Next: Harbor Lights S1 E9 · Today 9:00\s?PM/);
  card._zoomed = true;
  card._sig = null;
  card._render();
  assert.match(card.shadowRoot.innerHTML, /class="ctr"/);
});

test("the dark theme", async () => {
  const card = await make("media-server-card", {}, makeHass("playing", { themes: { darkMode: true } }));
  assert.match(card.shadowRoot.innerHTML, /<ha-card class="lvl-playing dk">/);
  assert.match(card.shadowRoot.innerHTML, /class="banner night"/);
});

test("translations: every language has every English key", () => {
  const en = Object.keys(ms.MS_I18N.en);
  for (const [lang, table] of Object.entries(ms.MS_I18N)) assert.deepEqual(en.filter((k) => !(k in table)), [], lang);
  assert.equal(Object.keys(ms.MS_I18N).length, 22);
});

test("the editor writes only what differs from the defaults", () => {
  const ed = new (ms.customElements.get("media-server-card-editor"))();
  ed.setConfig({ type: "custom:media-server-card" });
  ed.hass = makeHass();
  const form = ed.children[0];
  const names = form.schema.flatMap((s) => (s.schema ? s.schema.map((x) => x.name) : [s.name]));
  for (const n of ["players", "max_items", "show_requests", "illustration_theme", "entities", "language"]) assert.ok(names.includes(n), n);
  let out;
  ed.dispatchEvent = (e) => {
    out = e.detail.config;
  };
  form.listeners["value-changed"]({ detail: { value: { type: "custom:media-server-card", max_items: 4, show_requests: true, title: "Plex" } } });
  assert.deepEqual(json(out), { type: "custom:media-server-card", title: "Plex" });
});
