// The mock home of the screenshots, the animations and the tests: a Jellyfin server with two sessions, Tautulli,
// Sonarr, Radarr and Seerr, their sensors, and the answers of their actions (what is coming up, the queue, the
// requests). Every title is made up. The clock is fixed (a Saturday of June, 20:15), so a capture only changes when
// the card does.
const st = (entity_id, state, attributes = {}) => ({ entity_id, state, attributes, last_changed: "2026-06-20T00:00:00Z" });

export const NOW = new Date(2026, 5, 20, 20, 15).getTime();
const at = (days, hour, minute = 0) => new Date(2026, 5, 20 + days, hour, minute).getTime();

// The answer of Home Assistant to the card's callWS, from the data on the hass object (`this.__data`): the entity
// each action's response (the config entry comes from hass.devices). Used as is in the page (its source) and in the
// tests.
export async function answer(msg) {
  const d = this.__data || {};
  if (msg.type === "call_service") {
    const r = d[`${msg.domain}.${msg.service}`];
    const entry = msg.service_data?.entry_id || msg.service_data?.config_entry_id;
    if (entry && entry !== `${msg.domain}_entry`) throw new Error("bad entry");
    if (!r || !(msg.service_data?.entry_id || (msg.domain === "overseerr" && msg.service_data?.config_entry_id))) throw new Error("bad call");
    return { context: {}, response: r };
  }
  return null;
}

// The page's clock and callWS, as script source.
export const pageScript = () => `(() => {
  const N = ${NOW};
  const R = Date;
  window.Date = class extends R {
    constructor(...a) { super(...(a.length ? a : [N])); }
    static now() { return N; }
  };
  window.__ws = ${answer.toString()};
})();`;

const SESSIONS = [
  ["media_player.living_room_tv", "playing", { friendly_name: "Living room TV", media_title: "The Quiet Orbit", media_position: 3720, media_duration: 6000 }],
  ["media_player.bedroom_tablet", "paused", { friendly_name: "Bedroom tablet", media_series_title: "Paper Lanterns", media_title: "The Long Walk", media_season: 2, media_episode: 3, media_position: 520, media_duration: 2900 }],
  ["media_player.office_pc", "idle", { friendly_name: "Office PC" }],
];
const LISTS = {
  "sonarr.get_upcoming": {
    episodes: [
      { series_title: "Harbor Lights", season_number: 1, episode_number: 9, title: "Low Tide", air_date_utc: new Date(at(0, 21)).toISOString() },
      { series_title: "Copper Valley", season_number: 3, episode_number: 1, title: "New Ground", air_date_utc: new Date(at(1, 20, 30)).toISOString() },
      { series_title: "Night Market", season_number: 1, episode_number: 4, title: "Lanterns", air_date_utc: new Date(at(3, 22)).toISOString() },
    ],
  },
  "radarr.get_upcoming": { movies: [{ title: "Silver Coast", digital_release: new Date(at(2, 9)).toISOString() }] },
  "sonarr.get_queue": { shows: { "Harbor Lights S01E08": { series_title: "Harbor Lights", season_number: 1, episode_number: 8, progress: "74.2%" } } },
  "radarr.get_queue": { movies: [{ title: "North Ridge", size: 4000, sizeleft: 2760 }] },
  "overseerr.get_requests": [{ media: { title: "Glass Garden" }, requested_by: { display_name: "Sam" }, status: "pending", media_type: "tv" }],
};

// `scene`: playing (two sessions, one paused), downloading (nothing plays), idle (nothing at all).
export const setup = (s = {}) => {
  const scene = s.scene || "playing";
  const states = {};
  const entities = {};
  const devices = {};
  // One device per integration, its config entry listed as Home Assistant lists it (hass.devices).
  const add = (id, state, attributes, platform, key) => {
    states[id] = st(id, state, attributes);
    entities[id] = { entity_id: id, platform, device_id: `${platform}_device`, ...(key ? { translation_key: key } : {}) };
    devices[`${platform}_device`] = { id: `${platform}_device`, config_entries: [`${platform}_entry`], primary_config_entry: `${platform}_entry` };
  };
  for (const [id, state, a] of SESSIONS) add(id, scene === "playing" ? state : "idle", a, "jellyfin");
  const playing = scene === "playing";
  add("sensor.tautulli_watching", playing ? "2" : "0", { unit_of_measurement: "watching" }, "tautulli", "watching_count");
  add("sensor.tautulli_stream_count_transcode", playing ? "1" : "0", {}, "tautulli", "stream_count_transcode");
  add("sensor.tautulli_total_bandwidth", playing ? "18400" : "0", { unit_of_measurement: "kbit/s" }, "tautulli", "total_bandwidth");
  add("sensor.sonarr_upcoming", "3", { unit_of_measurement: "episodes" }, "sonarr", "upcoming");
  add("sensor.sonarr_queue", scene === "idle" ? "0" : "1", { unit_of_measurement: "episodes" }, "sonarr", "queue");
  add("sensor.sonarr_disk_space", "3140", { unit_of_measurement: "GB" }, "sonarr", "diskspace");
  add("sensor.radarr_queue", scene === "idle" ? "0" : "1", { unit_of_measurement: "movies" }, "radarr", "queue");
  add("sensor.overseerr_pending_requests", "1", {}, "overseerr", "pending_requests");
  const data = { ...LISTS };
  if (scene === "idle") {
    data["sonarr.get_queue"] = { shows: {} };
    data["radarr.get_queue"] = { movies: [] };
  }
  return {
    hass: {
      language: "en",
      locale: { language: "en" },
      entities,
      devices,
      states,
      services: { sonarr: { get_upcoming: {}, get_queue: {} }, radarr: { get_upcoming: {}, get_queue: {} }, overseerr: { get_requests: {} } },
      __data: data,
    },
    config: { ...s.config },
    open: s.open,
  };
};
