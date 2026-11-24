// ── Media server ─────────────────────────────────────────────────────────────
// What the media server is doing, from the integrations already in Home Assistant: the sessions' media players
// (Jellyfin, Plex, Emby), Tautulli's stream counts and bandwidth, the *arr apps' sensors (Sonarr, Radarr, Lidarr:
// upcoming, queue, wanted, disk space) and Seerr's pending requests. The lists (what is coming up, the download queue,
// the requests) come from the integrations' actions when Home Assistant has them (sonarr.get_upcoming,
// sonarr.get_queue, radarr.get_queue, overseerr.get_requests…), called with return_response; else the counts alone.
export const MS_PLAYERS = ["jellyfin", "plex", "emby"];
export const MS_APPS = ["tautulli", "sonarr", "radarr", "lidarr", "overseerr"];
export const MS_NAMES = { jellyfin: "Jellyfin", plex: "Plex", emby: "Emby", tautulli: "Tautulli", sonarr: "Sonarr", radarr: "Radarr", lidarr: "Lidarr", overseerr: "Seerr" };
// A sensor's role, from "<translation key> <entity id>".
export const MS_ROLES = {
  requests: /pending_requests|requests_pending/,
  transcoding: /transcod/,
  bandwidth: /total_bandwidth|bandwidth/,
  watching: /watching|stream_count|current_streams|active_clients/,
  upcoming: /upcoming/,
  queue: /queue/,
  wanted: /wanted|missing/,
  diskspace: /disk_?space/,
};
// The actions that list items, by domain: [action, kind of list].
export const MS_ACTIONS = [
  ["sonarr", "get_upcoming", "coming"],
  ["radarr", "get_upcoming", "coming"],
  ["lidarr", "get_upcoming", "coming"],
  ["sonarr", "get_queue", "queue"],
  ["radarr", "get_queue", "queue"],
  ["lidarr", "get_queue", "queue"],
  ["overseerr", "get_requests", "requests"],
];

export const msNum = (st) => {
  if (!st || ["unavailable", "unknown", ""].includes(st.state)) return null;
  const v = Number(st.state);
  return Number.isFinite(v) ? v : null;
};

// The players of the sessions and the sensors of each role (several apps can each have one: Sonarr's and Radarr's
// queues), with the platforms found. `overrides` (the `entities` option) gives the ids of a role.
export const msFind = (hass, overrides = {}) => {
  const reg = hass.entities || {};
  const out = { players: [], roles: {}, platforms: [] };
  for (const id of Object.keys(reg)) {
    const p = reg[id].platform;
    if (MS_PLAYERS.includes(p) && id.startsWith("media_player.")) out.players.push(id);
    else if (MS_APPS.includes(p) && id.startsWith("sensor.")) {
      const key = `${reg[id].translation_key || ""} ${id}`;
      const role = Object.keys(MS_ROLES).find((r) => MS_ROLES[r].test(key));
      if (role) (out.roles[role] ||= []).push(id);
    } else continue;
    if (!out.platforms.includes(p)) out.platforms.push(p);
  }
  for (const [role, ids] of Object.entries(overrides || {})) if (ids) out.roles[role] = [].concat(ids);
  return out;
};

// The config entries an integration's actions may need, from the devices of its entities (hass.devices, readable by
// every user, unlike the entity registry's details): the device's primary entry first, then its other entries.
export const msEntries = (hass, domain) => {
  const reg = hass.entities || {};
  const out = [];
  for (const id of Object.keys(reg)) {
    if (reg[id].platform !== domain) continue;
    const dev = hass.devices?.[reg[id].device_id];
    for (const e of [dev?.primary_config_entry, ...(dev?.config_entries || [])]) if (e && !out.includes(e)) out.push(e);
  }
  return out;
};

// A session of a media player: what plays, on which device, how far.
export const msSession = (st) => {
  const a = st.attributes || {};
  const series = a.media_series_title;
  const ep = a.media_season != null && a.media_episode != null ? { s: a.media_season, e: a.media_episode } : null;
  return {
    id: st.entity_id,
    title: series || a.media_title || a.media_album_name || "",
    episode: series && a.media_title !== series ? a.media_title : "",
    ep,
    device: a.friendly_name || st.entity_id,
    paused: st.state === "paused",
    progress: Number(a.media_duration) > 0 ? Math.min(1, Math.max(0, Number(a.media_position || 0) / Number(a.media_duration))) : null,
  };
};

// The items of an action's response, whatever its shape: a list of records, or records keyed by their title, possibly
// one level down ({ shows: {…} }, { episodes: […] }). A record is kept when it has a title.
export const MS_TITLE = ["series_title", "title", "series", "show", "movie_title", "album_title", "name"];
export const msItems = (resp, kind) => {
  const out = [];
  const pick = (o, keys) => keys.map((k) => o?.[k]).find((v) => v != null && v !== "");
  const record = (o, key) => {
    if (!o || typeof o !== "object" || Array.isArray(o)) return false;
    // A container (every value an object or a list: { shows: {…} }) is walked into, never a record itself.
    if (Object.values(o).every((x) => x && typeof x === "object")) return false;
    const title = pick(o, MS_TITLE) ?? (typeof o.series === "object" ? o.series?.title : undefined) ?? (typeof o.media === "object" ? (o.media?.title ?? o.media?.name) : undefined) ?? key;
    if (typeof title !== "string" || !title) return false;
    const s = o.season_number ?? o.seasonNumber ?? o.season;
    const e = o.episode_number ?? o.episodeNumber ?? o.episode;
    const size = Number(o.size);
    const left = Number(o.sizeleft ?? o.size_left);
    let progress = o.progress ?? o.percent ?? o.percentage;
    if (typeof progress === "string") progress = Number.parseFloat(progress);
    if (progress == null && size > 0 && Number.isFinite(left)) progress = ((size - left) / size) * 100;
    const date = pick(o, ["air_date_utc", "airDateUtc", "air_date", "airDate", "release_date", "digital_release", "physical_release", "in_cinemas", "created_at", "createdAt"]);
    const user = o.requested_by?.display_name ?? o.requestedBy?.displayName ?? o.requested_by ?? o.user;
    out.push({
      title,
      ep: typeof s === "number" && typeof e === "number" ? { s, e } : null,
      episode: typeof o.episode_title === "string" ? o.episode_title : typeof o.title === "string" && o.series_title ? o.title : "",
      date: date ? new Date(date).getTime() : null,
      progress: Number.isFinite(Number(progress)) ? Math.min(100, Math.max(0, Number(progress))) : null,
      left: Number.isFinite(left) ? left : null,
      status: typeof o.status === "string" ? o.status.toLowerCase() : typeof o.status === "number" ? ["", "pending", "approved", "declined", "failed", "completed"][o.status] || "" : "",
      user: typeof user === "string" ? user : "",
      type: o.media_type ?? o.type ?? o.mediaType ?? "",
      kind,
    });
    return true;
  };
  const walk = (v, depth, key) => {
    if (depth > 3 || v == null || typeof v !== "object") return;
    if (Array.isArray(v)) {
      for (const x of v) if (!record(x)) walk(x, depth + 1);
      return;
    }
    if (key !== undefined && record(v, key)) return;
    for (const [k, x] of Object.entries(v)) if (x && typeof x === "object") walk(x, depth + 1, Array.isArray(v) ? undefined : k);
  };
  walk(resp, 0);
  return out;
};

// An abstract thumbnail for a title: two colours from its name, never the real artwork.
export const MS_HUES = [
  ["#7048e8", "#e64980"],
  ["#1098ad", "#74c0fc"],
  ["#f08c00", "#ffd43b"],
  ["#2f9e44", "#a9e34b"],
  ["#d6336c", "#ff8787"],
  ["#4263eb", "#91a7ff"],
];
export const msHue = (title) => {
  let h = 0;
  for (const c of String(title)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return MS_HUES[h % MS_HUES.length];
};

// The Intl formats, made once per language and options (a render formats many dates).
export const msIntlCache = new Map();
export const msIntl = (Kind, lang, opts) => {
  const key = `${Kind.name}|${lang}|${JSON.stringify(opts)}`;
  if (!msIntlCache.has(key)) msIntlCache.set(key, new Kind(lang, opts));
  return msIntlCache.get(key);
};
