// ── Card picker: light previews ──────────────────────────────────────────────
// Home Assistant's card picker builds a live preview of every card registered with `preview: true`, all at once and
// with no lazy loading. A preview here is drawn only once it scrolls into view: the picker calls getStubConfig() right
// before it creates the preview, which marks the next instance of that card; once connected under <hui-card-picker>,
// that instance holds Home Assistant's state (no render, no history, no animation) until it is visible. Anywhere else
// (a dashboard, the card editor) the card behaves as before. Editors and other elements are defined unchanged.
function pickerDefine(tag, Card, options) {
  const isCard = !tag.endsWith("-editor") && (typeof Card.getStubConfig === "function" || typeof Card.getConfigElement === "function");
  if (!isCard || typeof IntersectionObserver !== "function") return customElements.define(tag, Card, options);
  let marks = [];
  const lazy = class extends Card {
    static getStubConfig(...args) {
      marks.push(Date.now());
      return Card.getStubConfig ? Card.getStubConfig(...args) : {};
    }

    constructor() {
      super();
      const now = Date.now();
      marks = marks.filter((t) => now - t < 5000);
      if (marks.length) {
        marks.shift();
        this._plHold = true;
      }
    }

    set hass(hass) {
      if (this._plHold) this._plHass = hass;
      else super.hass = hass;
    }

    get hass() {
      return this._plHold ? this._plHass : super.hass;
    }

    connectedCallback() {
      if (!this._plHold) return super.connectedCallback?.();
      if (this.getRootNode()?.host?.localName !== "hui-card-picker") return this._plRelease();
      if (this._plIo) return;
      // A custom element is inline until its styles arrive: a block of a card's height keeps the cells apart, so
      // that only the previews actually on screen intersect.
      this.style.display = "block";
      this.style.minHeight = "120px";
      this._plIo = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && this._plRelease(), {
        rootMargin: "200px",
      });
      this._plIo.observe(this);
    }

    disconnectedCallback() {
      if (this._plHold) return;
      super.disconnectedCallback?.();
    }

    _plRelease() {
      this._plIo?.disconnect();
      this._plIo = null;
      this._plHold = false;
      this.style.display = "";
      this.style.minHeight = "";
      if (this._plHass !== undefined) super.hass = this._plHass;
      this._plHass = undefined;
      if (this.isConnected) super.connectedCallback?.();
    }
  };
  return customElements.define(tag, lazy, options);
}

/**
 * Shared by the media server cards (its names are used by the other src/ files): the server's sessions, counts and lists, i18n helpers,
 * the base card (header, tiles, tap / hold), the mini card, the visual editor and the common styles. Same base as ha-room-card.
 * https://github.com/juju35/ha-media-server-card
 */
const RC_VERSION = "__VERSION__";

const RC_HOLD_MS = 500;
const RC_MOVE_PX = 8;
// A held arrow key repeats some 30 times a second: one brightness step every RC_REPEAT_MS at most.
const RC_REPEAT_MS = 150;

// ── Overviews ────────────────────────────────────────────────────────────────
// Shared by room-overview-card and room-environment-overview-card.

// The zoom / detail button: the same icons on the overviews and the mini cards.
const rcZoomIcon = (card) => (card._zoomed ? "mdi:arrow-collapse" : "mdi:arrow-expand");

// Back to the compact view (mini card, or overview showing the rooms needing a look), when zoomed in.
const rcUnzoom = (card) => {
  if (!card._zoomed) return;
  card._zoomed = false;
  card._sig = null;
  card._render();
};

// True for a click outside `card` that is not in a dialog opened from it (more-info, say): it folds the card back.
const rcOutside = (card, ev) => !ev.composedPath().includes(card) && !rcInDialog(ev);

// "A click elsewhere" is caught on the pointer, not only on the click event: on iOS (Safari and the companion app)
// a tap on something that is not clickable (the background, an empty spot, a card with no action) sends no click to
// the page. The handler runs when the press and the release are both outside the card (a slider dragged out of the
// card does not count), and a scroll does not count (the browser cancels the pointer); keyboard clicks still go
// through the click event. The handler keeps its own checks (outside of the card, not in a dialog).
const watchOutside = (card, handler) => {
  let downOutside = false;
  const onDown = (ev) => {
    downOutside = !ev.composedPath().includes(card);
  };
  const onUp = (ev) => {
    if (downOutside) handler(ev);
    downOutside = false;
  };
  const onClick = (ev) => {
    if (ev.detail === 0) handler(ev);
  };
  return {
    on() {
      document.addEventListener("pointerdown", onDown, true);
      document.addEventListener("pointerup", onUp, true);
      document.addEventListener("click", onClick, true);
    },
    off() {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("pointerup", onUp, true);
      document.removeEventListener("click", onClick, true);
    },
    // A tap (press and release at the same spot), for the tests.
    tap(ev) {
      onDown(ev);
      onUp(ev);
    },
  };
};

// A click on the detail button: every room, or back to the rooms needing a look. True when handled.
const rcZoomClick = (card, ev) => {
  if (!ev.target.closest?.(".zoom")) return false;
  ev.stopPropagation();
  card._zoomed = !card._zoomed;
  card._sig = null;
  card._render();
  if (ev.detail === 0) card.shadowRoot.querySelector(".zoom")?.focus({ preventScroll: true });
  return true;
};

// ── i18n ─────────────────────────────────────────────────────────────────────
// Strings shared by the cards; a card's own dictionary wins over these.
const RC_I18N = {
  en: {
    unavailable: "Unavailable",
    turn_all_off: "Turn everything off",
    ed_title: "Title",
    ed_show_title: "Show title",
    ed_advanced: "Advanced",
    ed_language: "Language",
    ed_language_helper: "Empty: the Home Assistant language",
    ed_language_auto: "Automatic",
    ed_navigation_path: "Navigation path",
    err_config: "Set `area` or `entities`",
    zoom_in: "Show the full card",
    zoom_out: "Back to the compact view",
    ed_zoom: "Zoom button",
    ed_zoom_helper: "Switches the mini card to the full card and back",
  },
  fr: {
    unavailable: "Indisponible",
    turn_all_off: "Tout éteindre",
    ed_title: "Titre",
    ed_show_title: "Afficher le titre",
    ed_advanced: "Avancé",
    ed_language: "Langue",
    ed_language_helper: "Vide : la langue de Home Assistant",
    ed_language_auto: "Automatique",
    ed_navigation_path: "Chemin de navigation",
    err_config: "Définis `area` ou `entities`",
    zoom_in: "Afficher la carte complète",
    zoom_out: "Revenir à la vue compacte",
    ed_zoom: "Bouton zoom",
    ed_zoom_helper: "Bascule la mini-carte en carte complète, et inversement",
  },
  de: {
    unavailable: "Nicht verfügbar",
    turn_all_off: "Alles ausschalten",
    ed_title: "Titel",
    ed_show_title: "Titel anzeigen",
    ed_advanced: "Erweitert",
    ed_language: "Sprache",
    ed_language_helper: "Leer: die Sprache von Home Assistant",
    ed_language_auto: "Automatisch",
    ed_navigation_path: "Navigationspfad",
    err_config: "Lege `area` oder `entities` fest",
    zoom_in: "Vollständige Karte anzeigen",
    zoom_out: "Zurück zur kompakten Ansicht",
    ed_zoom: "Zoom-Schaltfläche",
    ed_zoom_helper: "Wechselt von der Mini-Karte zur vollständigen Karte und zurück",
  },
  es: {
    unavailable: "No disponible",
    turn_all_off: "Apagar todo",
    ed_title: "Título",
    ed_show_title: "Mostrar el título",
    ed_advanced: "Avanzado",
    ed_language: "Idioma",
    ed_language_helper: "Vacío: el idioma de Home Assistant",
    ed_language_auto: "Automático",
    ed_navigation_path: "Ruta de navegación",
    err_config: "Define `area` o `entities`",
    zoom_in: "Mostrar la tarjeta completa",
    zoom_out: "Volver a la vista compacta",
    ed_zoom: "Botón de zoom",
    ed_zoom_helper: "Cambia de la minitarjeta a la tarjeta completa y viceversa",
  },
  sr: {
    unavailable: "Недоступно",
    turn_all_off: "Искључи све",
    ed_title: "Наслов",
    ed_show_title: "Прикажи наслов",
    ed_advanced: "Напредно",
    ed_language: "Језик",
    ed_language_helper: "Празно: језик Home Assistant-а",
    ed_language_auto: "Аутоматски",
    ed_navigation_path: "Путања за навигацију",
    err_config: "Подесите `area` или `entities`",
    zoom_in: "Прикажи целу картицу",
    zoom_out: "Назад на компактни приказ",
    ed_zoom: "Дугме за увећање",
    ed_zoom_helper: "Пребацује мини картицу на пун приказ и назад",
  },
  "sr-Latn": {
    unavailable: "Nedostupno",
    turn_all_off: "Isključi sve",
    ed_title: "Naslov",
    ed_show_title: "Prikaži naslov",
    ed_advanced: "Napredno",
    ed_language: "Jezik",
    ed_language_helper: "Prazno: jezik Home Assistant-a",
    ed_language_auto: "Automatski",
    ed_navigation_path: "Putanja za navigaciju",
    err_config: "Podesite `area` ili `entities`",
    zoom_in: "Prikaži celu karticu",
    zoom_out: "Nazad na kompaktni prikaz",
    ed_zoom: "Dugme za uvećanje",
    ed_zoom_helper: "Prebacuje mini karticu na pun prikaz i nazad",
  },
  it: {
    unavailable: "Non disponibile",
    turn_all_off: "Spegni tutto",
    ed_title: "Titolo",
    ed_show_title: "Mostra il titolo",
    ed_advanced: "Avanzate",
    ed_language: "Lingua",
    ed_language_helper: "Vuoto: la lingua di Home Assistant",
    ed_language_auto: "Automatica",
    ed_navigation_path: "Percorso di navigazione",
    err_config: "Imposta `area` o `entities`",
    zoom_in: "Mostra la scheda completa",
    zoom_out: "Torna alla vista compatta",
    ed_zoom: "Pulsante zoom",
    ed_zoom_helper: "Passa dalla mini scheda alla scheda completa e viceversa",
  },
  nl: {
    unavailable: "Niet beschikbaar",
    turn_all_off: "Alles uitschakelen",
    ed_title: "Titel",
    ed_show_title: "Titel tonen",
    ed_advanced: "Geavanceerd",
    ed_language: "Taal",
    ed_language_helper: "Leeg: de taal van Home Assistant",
    ed_language_auto: "Automatisch",
    ed_navigation_path: "Navigatiepad",
    err_config: "Stel `area` of `entities` in",
    zoom_in: "Volledige kaart tonen",
    zoom_out: "Terug naar de compacte weergave",
    ed_zoom: "Zoomknop",
    ed_zoom_helper: "Schakelt de minikaart naar de volledige kaart en terug",
  },
  pt: {
    unavailable: "Indisponível",
    turn_all_off: "Desligar tudo",
    ed_title: "Título",
    ed_show_title: "Mostrar o título",
    ed_advanced: "Avançado",
    ed_language: "Idioma",
    ed_language_helper: "Vazio: o idioma do Home Assistant",
    ed_language_auto: "Automático",
    ed_navigation_path: "Caminho de navegação",
    err_config: "Defina `area` ou `entities`",
    zoom_in: "Mostrar o cartão completo",
    zoom_out: "Voltar à vista compacta",
    ed_zoom: "Botão de zoom",
    ed_zoom_helper: "Alterna entre o minicartão e o cartão completo",
  },
  pl: {
    unavailable: "Niedostępne",
    turn_all_off: "Wyłącz wszystko",
    ed_title: "Tytuł",
    ed_show_title: "Pokaż tytuł",
    ed_advanced: "Zaawansowane",
    ed_language: "Język",
    ed_language_helper: "Puste: język Home Assistanta",
    ed_language_auto: "Automatyczny",
    ed_navigation_path: "Ścieżka nawigacji",
    err_config: "Ustaw `area` lub `entities`",
    zoom_in: "Pokaż pełną kartę",
    zoom_out: "Wróć do widoku kompaktowego",
    ed_zoom: "Przycisk powiększenia",
    ed_zoom_helper: "Przełącza minikartę na pełną kartę i z powrotem",
  },
  ro: {
    unavailable: "Indisponibil",
    turn_all_off: "Oprește tot",
    ed_title: "Titlu",
    ed_show_title: "Afișează titlul",
    ed_advanced: "Avansat",
    ed_language: "Limbă",
    ed_language_helper: "Gol: limba Home Assistant",
    ed_language_auto: "Automată",
    ed_navigation_path: "Cale de navigare",
    err_config: "Setează `area` sau `entities`",
    zoom_in: "Afișează cardul complet",
    zoom_out: "Înapoi la vizualizarea compactă",
    ed_zoom: "Buton de zoom",
    ed_zoom_helper: "Comută între mini-card și cardul complet",
  },
  da: {
    unavailable: "Utilgængelig",
    turn_all_off: "Sluk alt",
    ed_title: "Titel",
    ed_show_title: "Vis titel",
    ed_advanced: "Avanceret",
    ed_language: "Sprog",
    ed_language_helper: "Tomt: Home Assistants sprog",
    ed_language_auto: "Automatisk",
    ed_navigation_path: "Navigationssti",
    err_config: "Angiv `area` eller `entities`",
    zoom_in: "Vis hele kortet",
    zoom_out: "Tilbage til den kompakte visning",
    ed_zoom: "Zoomknap",
    ed_zoom_helper: "Skifter fra minikortet til hele kortet og tilbage",
  },
  sv: {
    unavailable: "Ej tillgänglig",
    turn_all_off: "Stäng av allt",
    ed_title: "Titel",
    ed_show_title: "Visa rubrik",
    ed_advanced: "Avancerat",
    ed_language: "Språk",
    ed_language_helper: "Tomt: Home Assistants språk",
    ed_language_auto: "Automatiskt",
    ed_navigation_path: "Navigeringssökväg",
    err_config: "Ange `area` eller `entities`",
    zoom_in: "Visa hela kortet",
    zoom_out: "Tillbaka till kompakt vy",
    ed_zoom: "Zoomknapp",
    ed_zoom_helper: "Växlar mellan minikortet och hela kortet",
  },
  bg: {
    unavailable: "Недостъпно",
    turn_all_off: "Изключи всичко",
    ed_title: "Заглавие",
    ed_show_title: "Показване на заглавието",
    ed_advanced: "Разширени",
    ed_language: "Език",
    ed_language_helper: "Празно: езикът на Home Assistant",
    ed_language_auto: "Автоматично",
    ed_navigation_path: "Път за навигация",
    err_config: "Задайте `area` или `entities`",
    zoom_in: "Покажи пълната карта",
    zoom_out: "Обратно към компактния изглед",
    ed_zoom: "Бутон за увеличение",
    ed_zoom_helper: "Превключва от мини картата към пълната карта и обратно",
  },
  ru: {
    unavailable: "Недоступно",
    turn_all_off: "Выключить всё",
    ed_title: "Заголовок",
    ed_show_title: "Показывать заголовок",
    ed_advanced: "Дополнительно",
    ed_language: "Язык",
    ed_language_helper: "Пусто: язык Home Assistant",
    ed_language_auto: "Автоматически",
    ed_navigation_path: "Путь навигации",
    err_config: "Укажите `area` или `entities`",
    zoom_in: "Показать полную карточку",
    zoom_out: "Вернуться к компактному виду",
    ed_zoom: "Кнопка масштаба",
    ed_zoom_helper: "Переключает мини-карточку на полную карточку и обратно",
  },
  uk: {
    unavailable: "Недоступно",
    turn_all_off: "Вимкнути все",
    ed_title: "Заголовок",
    ed_show_title: "Показувати заголовок",
    ed_advanced: "Додатково",
    ed_language: "Мова",
    ed_language_helper: "Порожньо: мова Home Assistant",
    ed_language_auto: "Автоматично",
    ed_navigation_path: "Шлях навігації",
    err_config: "Вкажіть `area` або `entities`",
    zoom_in: "Показати повну картку",
    zoom_out: "Повернутися до компактного вигляду",
    ed_zoom: "Кнопка масштабу",
    ed_zoom_helper: "Перемикає міні-картку на повну картку й назад",
  },
  hu: {
    unavailable: "Nem elérhető",
    turn_all_off: "Minden kikapcsolása",
    ed_title: "Cím",
    ed_show_title: "Cím megjelenítése",
    ed_advanced: "Speciális",
    ed_language: "Nyelv",
    ed_language_helper: "Üres: a Home Assistant nyelve",
    ed_language_auto: "Automatikus",
    ed_navigation_path: "Navigációs útvonal",
    err_config: "Állítsd be az `area` vagy az `entities` értékét",
    zoom_in: "A teljes kártya megjelenítése",
    zoom_out: "Vissza a kompakt nézethez",
    ed_zoom: "Nagyítás gomb",
    ed_zoom_helper: "Vált a mini kártya és a teljes kártya között",
  },
  sk: {
    unavailable: "Nedostupné",
    turn_all_off: "Vypnúť všetko",
    ed_title: "Názov",
    ed_show_title: "Zobraziť názov",
    ed_advanced: "Rozšírené",
    ed_language: "Jazyk",
    ed_language_helper: "Prázdne: jazyk Home Assistanta",
    ed_language_auto: "Automaticky",
    ed_navigation_path: "Navigačná cesta",
    err_config: "Nastavte `area` alebo `entities`",
    zoom_in: "Zobraziť celú kartu",
    zoom_out: "Späť na kompaktné zobrazenie",
    ed_zoom: "Tlačidlo priblíženia",
    ed_zoom_helper: "Prepína minikartu na celú kartu a späť",
  },
  cs: {
    unavailable: "Nedostupné",
    turn_all_off: "Vypnout vše",
    ed_title: "Název",
    ed_show_title: "Zobrazit název",
    ed_advanced: "Pokročilé",
    ed_language: "Jazyk",
    ed_language_helper: "Prázdné: jazyk Home Assistanta",
    ed_language_auto: "Automaticky",
    ed_navigation_path: "Navigační cesta",
    err_config: "Nastavte `area` nebo `entities`",
    zoom_in: "Zobrazit celou kartu",
    zoom_out: "Zpět na kompaktní zobrazení",
    ed_zoom: "Tlačítko přiblížení",
    ed_zoom_helper: "Přepíná minikartu na celou kartu a zpět",
  },
  sl: {
    unavailable: "Ni na voljo",
    turn_all_off: "Izklopi vse",
    ed_title: "Naslov",
    ed_show_title: "Prikaži naslov",
    ed_advanced: "Napredno",
    ed_language: "Jezik",
    ed_language_helper: "Prazno: jezik Home Assistanta",
    ed_language_auto: "Samodejno",
    ed_navigation_path: "Navigacijska pot",
    err_config: "Nastavite `area` ali `entities`",
    zoom_in: "Prikaži celotno kartico",
    zoom_out: "Nazaj na strnjen pogled",
    ed_zoom: "Gumb za povečavo",
    ed_zoom_helper: "Preklopi mini kartico v celotno kartico in nazaj",
  },
  lv: {
    unavailable: "Nav pieejams",
    turn_all_off: "Izslēgt visu",
    ed_title: "Virsraksts",
    ed_show_title: "Rādīt virsrakstu",
    ed_advanced: "Papildu",
    ed_language: "Valoda",
    ed_language_helper: "Tukšs: Home Assistant valoda",
    ed_language_auto: "Automātiski",
    ed_navigation_path: "Navigācijas ceļš",
    err_config: "Iestatiet `area` vai `entities`",
    zoom_in: "Rādīt pilno karti",
    zoom_out: "Atpakaļ uz kompakto skatu",
    ed_zoom: "Tālummaiņas poga",
    ed_zoom_helper: "Pārslēdz mini karti uz pilno karti un atpakaļ",
  },
  el: {
    unavailable: "Μη διαθέσιμο",
    turn_all_off: "Απενεργοποίηση όλων",
    ed_title: "Τίτλος",
    ed_show_title: "Εμφάνιση τίτλου",
    ed_advanced: "Για προχωρημένους",
    ed_language: "Γλώσσα",
    ed_language_helper: "Κενό: η γλώσσα του Home Assistant",
    ed_language_auto: "Αυτόματα",
    ed_navigation_path: "Διαδρομή πλοήγησης",
    err_config: "Ορίστε `area` ή `entities`",
    zoom_in: "Εμφάνιση της πλήρους κάρτας",
    zoom_out: "Επιστροφή στη συμπαγή προβολή",
    ed_zoom: "Κουμπί ζουμ",
    ed_zoom_helper: "Εναλλάσσει τη μίνι κάρτα με την πλήρη κάρτα",
  },
};

// ── Media server ─────────────────────────────────────────────────────────────
// What the media server is doing, from the integrations already in Home Assistant: the sessions' media players
// (Jellyfin, Plex, Emby), Tautulli's stream counts and bandwidth, the *arr apps' sensors (Sonarr, Radarr, Lidarr:
// upcoming, queue, wanted, disk space) and Seerr's pending requests. The lists (what is coming up, the download queue,
// the requests) come from the integrations' actions when Home Assistant has them (sonarr.get_upcoming,
// sonarr.get_queue, radarr.get_queue, overseerr.get_requests…), called with return_response; else the counts alone.
const MS_PLAYERS = ["jellyfin", "plex", "emby"];
const MS_APPS = ["tautulli", "sonarr", "radarr", "lidarr", "overseerr"];
const MS_NAMES = { jellyfin: "Jellyfin", plex: "Plex", emby: "Emby", tautulli: "Tautulli", sonarr: "Sonarr", radarr: "Radarr", lidarr: "Lidarr", overseerr: "Seerr" };
// A sensor's role, from "<translation key> <entity id>".
const MS_ROLES = {
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
const MS_ACTIONS = [
  ["sonarr", "get_upcoming", "coming"],
  ["radarr", "get_upcoming", "coming"],
  ["lidarr", "get_upcoming", "coming"],
  ["sonarr", "get_queue", "queue"],
  ["radarr", "get_queue", "queue"],
  ["lidarr", "get_queue", "queue"],
  ["overseerr", "get_requests", "requests"],
];

const msNum = (st) => {
  if (!st || ["unavailable", "unknown", ""].includes(st.state)) return null;
  const v = Number(st.state);
  return Number.isFinite(v) ? v : null;
};

// The players of the sessions and the sensors of each role (several apps can each have one: Sonarr's and Radarr's
// queues), with the platforms found. `overrides` (the `entities` option) gives the ids of a role.
const msFind = (hass, overrides = {}) => {
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
const msEntries = (hass, domain) => {
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
const msSession = (st) => {
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
const MS_TITLE = ["series_title", "title", "series", "show", "movie_title", "album_title", "name"];
const msItems = (resp, kind) => {
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
const MS_HUES = [
  ["#7048e8", "#e64980"],
  ["#1098ad", "#74c0fc"],
  ["#f08c00", "#ffd43b"],
  ["#2f9e44", "#a9e34b"],
  ["#d6336c", "#ff8787"],
  ["#4263eb", "#91a7ff"],
];
const msHue = (title) => {
  let h = 0;
  for (const c of String(title)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return MS_HUES[h % MS_HUES.length];
};

// The Intl formats, made once per language and options (a render formats many dates).
const msIntlCache = new Map();
const msIntl = (Kind, lang, opts) => {
  const key = `${Kind.name}|${lang}|${JSON.stringify(opts)}`;
  if (!msIntlCache.has(key)) msIntlCache.set(key, new Kind(lang, opts));
  return msIntlCache.get(key);
};

// Strings of the media server cards; the shared ones above (editor basics) complete them.
const MS_I18N = {
  en: {
    title: "Media server",
    st_playing: "Playing: {n}",
    st_downloading: "Downloading",
    st_idle: "Idle",
    st_offline: "Unavailable",
    c_streams: "Streams",
    c_coming: "Coming up",
    c_downloads: "Downloading",
    c_requests: "Requests",
    sub_transcode: "transcoding: {n}",
    sub_next: "next {d}",
    sub_queued: "in the queue",
    sub_wanted: "wanted: {n}",
    sub_pending: "waiting for approval",
    sub_none: "nothing",
    now_playing: "Now playing",
    queue: "Queue",
    free: "{v} free",
    nothing_playing: "Nothing playing",
    nothing_coming: "Nothing coming up",
    nothing_queued: "Nothing downloading",
    nothing_requested: "No pending request",
    no_list: "The list needs the integration's actions (Home Assistant 2025.2 or later)",
    paused: "paused",
    today: "Today",
    tomorrow: "Tomorrow",
    back: "Back to the overview",
    episode: "S{s} E{e}",
    by: "by {u}",
    req_pending: "Pending",
    req_approved: "Approved",
    req_processing: "Processing",
    req_available: "Available",
    req_declined: "Declined",
    req_failed: "Failed",
    no_server: "No media server found",
    chip_next: "Next: {t} · {d}",
    ed_players: "Players",
    ed_players_helper: "The media players of the server's sessions (Jellyfin, Plex, Emby); empty: all of them",
    ed_max_items: "Items per list",
    ed_max_items_helper: "How many items each list shows",
    ed_show_requests: "Requests",
    ed_show_subtitle: "Show subtitle",
    ed_illustration: "Illustrated header",
    ed_illustration_theme: "Header theme",
    ed_theme_auto: "Automatic (follows the theme)",
    ed_theme_day: "Day",
    ed_theme_night: "Night",
    ed_animations: "Animations",
    ed_entities: "Entities (YAML)",
    ed_entities_helper: "Overrides of the found sensors, by role: watching, transcoding, bandwidth, upcoming, queue, wanted, diskspace, requests",
    ed_title_helper: "Empty: Media server",
  },
  fr: {
    title: "Serveur multimédia",
    st_playing: "En lecture : {n}",
    st_downloading: "Téléchargement",
    st_idle: "Au repos",
    st_offline: "Indisponible",
    c_streams: "Lectures",
    c_coming: "À venir",
    c_downloads: "Téléchargements",
    c_requests: "Demandes",
    sub_transcode: "transcodage : {n}",
    sub_next: "prochain {d}",
    sub_queued: "dans la file",
    sub_wanted: "recherchés : {n}",
    sub_pending: "en attente de validation",
    sub_none: "rien",
    now_playing: "En lecture",
    queue: "File",
    free: "{v} libres",
    nothing_playing: "Aucune lecture",
    nothing_coming: "Rien à venir",
    nothing_queued: "Aucun téléchargement",
    nothing_requested: "Aucune demande en attente",
    no_list: "La liste demande les actions de l'intégration (Home Assistant 2025.2 ou plus récent)",
    paused: "en pause",
    today: "Aujourd'hui",
    tomorrow: "Demain",
    back: "Retour à la vue d'ensemble",
    episode: "S{s} E{e}",
    by: "par {u}",
    req_pending: "En attente",
    req_approved: "Validée",
    req_processing: "En cours",
    req_available: "Disponible",
    req_declined: "Refusée",
    req_failed: "Échec",
    no_server: "Aucun serveur multimédia trouvé",
    chip_next: "Prochain : {t} · {d}",
    ed_players: "Lecteurs",
    ed_players_helper: "Les lecteurs multimédias des sessions du serveur (Jellyfin, Plex, Emby) ; vide : tous",
    ed_max_items: "Éléments par liste",
    ed_max_items_helper: "Combien d'éléments chaque liste affiche",
    ed_show_requests: "Demandes",
    ed_show_subtitle: "Afficher le sous-titre",
    ed_illustration: "En-tête illustré",
    ed_illustration_theme: "Thème de l'en-tête",
    ed_theme_auto: "Automatique (suit le thème)",
    ed_theme_day: "Jour",
    ed_theme_night: "Nuit",
    ed_animations: "Animations",
    ed_entities: "Entités (YAML)",
    ed_entities_helper: "Remplace les capteurs trouvés, par rôle : watching, transcoding, bandwidth, upcoming, queue, wanted, diskspace, requests",
    ed_title_helper: "Vide : Serveur multimédia",
  },
  de: {
    title: "Medienserver",
    st_playing: "Wiedergabe: {n}",
    st_downloading: "Download läuft",
    st_idle: "Leerlauf",
    st_offline: "Nicht verfügbar",
    c_streams: "Streams",
    c_coming: "Demnächst",
    c_downloads: "Downloads",
    c_requests: "Anfragen",
    sub_transcode: "Transkodierung: {n}",
    sub_next: "nächste {d}",
    sub_queued: "in der Warteschlange",
    sub_wanted: "gesucht: {n}",
    sub_pending: "wartet auf Freigabe",
    sub_none: "nichts",
    now_playing: "Läuft gerade",
    queue: "Warteschlange",
    free: "{v} frei",
    nothing_playing: "Keine Wiedergabe",
    nothing_coming: "Nichts demnächst",
    nothing_queued: "Kein Download",
    nothing_requested: "Keine offene Anfrage",
    no_list: "Die Liste braucht die Aktionen der Integration (Home Assistant 2025.2 oder neuer)",
    paused: "pausiert",
    today: "Heute",
    tomorrow: "Morgen",
    back: "Zurück zur Übersicht",
    episode: "S{s} E{e}",
    by: "von {u}",
    req_pending: "Offen",
    req_approved: "Genehmigt",
    req_processing: "In Bearbeitung",
    req_available: "Verfügbar",
    req_declined: "Abgelehnt",
    req_failed: "Fehlgeschlagen",
    no_server: "Kein Medienserver gefunden",
    chip_next: "Nächste: {t} · {d}",
    ed_players: "Player",
    ed_players_helper: "Die Mediaplayer der Sitzungen des Servers (Jellyfin, Plex, Emby); leer: alle",
    ed_max_items: "Einträge pro Liste",
    ed_max_items_helper: "Wie viele Einträge jede Liste zeigt",
    ed_show_requests: "Anfragen",
    ed_show_subtitle: "Untertitel anzeigen",
    ed_illustration: "Illustrierte Kopfzeile",
    ed_illustration_theme: "Design der Kopfzeile",
    ed_theme_auto: "Automatisch (folgt dem Design)",
    ed_theme_day: "Tag",
    ed_theme_night: "Nacht",
    ed_animations: "Animationen",
    ed_entities: "Entitäten (YAML)",
    ed_entities_helper: "Ersetzt die gefundenen Sensoren, nach Rolle: watching, transcoding, bandwidth, upcoming, queue, wanted, diskspace, requests",
    ed_title_helper: "Leer: Medienserver",
  },
  es: {
    title: "Servidor multimedia",
    st_playing: "Reproduciendo: {n}",
    st_downloading: "Descargando",
    st_idle: "En reposo",
    st_offline: "No disponible",
    c_streams: "Reproducciones",
    c_coming: "Próximamente",
    c_downloads: "Descargas",
    c_requests: "Solicitudes",
    sub_transcode: "transcodificando: {n}",
    sub_next: "siguiente {d}",
    sub_queued: "en la cola",
    sub_wanted: "buscados: {n}",
    sub_pending: "esperando aprobación",
    sub_none: "nada",
    now_playing: "Reproduciendo ahora",
    queue: "Cola",
    free: "{v} libres",
    nothing_playing: "Nada en reproducción",
    nothing_coming: "Nada próximamente",
    nothing_queued: "Ninguna descarga",
    nothing_requested: "Ninguna solicitud pendiente",
    no_list: "La lista necesita las acciones de la integración (Home Assistant 2025.2 o posterior)",
    paused: "en pausa",
    today: "Hoy",
    tomorrow: "Mañana",
    back: "Volver a la vista general",
    episode: "T{s} E{e}",
    by: "por {u}",
    req_pending: "Pendiente",
    req_approved: "Aprobada",
    req_processing: "En curso",
    req_available: "Disponible",
    req_declined: "Rechazada",
    req_failed: "Fallida",
    no_server: "No se encontró ningún servidor multimedia",
    chip_next: "Siguiente: {t} · {d}",
    ed_players: "Reproductores",
    ed_players_helper: "Los reproductores multimedia de las sesiones del servidor (Jellyfin, Plex, Emby); vacío: todos",
    ed_max_items: "Elementos por lista",
    ed_max_items_helper: "Cuántos elementos muestra cada lista",
    ed_show_requests: "Solicitudes",
    ed_show_subtitle: "Mostrar subtítulo",
    ed_illustration: "Encabezado ilustrado",
    ed_illustration_theme: "Tema del encabezado",
    ed_theme_auto: "Automático (sigue el tema)",
    ed_theme_day: "Día",
    ed_theme_night: "Noche",
    ed_animations: "Animaciones",
    ed_entities: "Entidades (YAML)",
    ed_entities_helper: "Sustituye los sensores encontrados, por rol: watching, transcoding, bandwidth, upcoming, queue, wanted, diskspace, requests",
    ed_title_helper: "Vacío: Servidor multimedia",
  },
  sr: {
    title: "Медијски сервер",
    st_playing: "Репродукује: {n}",
    st_downloading: "Преузимање",
    st_idle: "Мирује",
    st_offline: "Недоступно",
    c_streams: "Стримови",
    c_coming: "Ускоро",
    c_downloads: "Преузимања",
    c_requests: "Захтеви",
    sub_transcode: "транскодовање: {n}",
    sub_next: "следеће {d}",
    sub_queued: "у реду",
    sub_wanted: "тражено: {n}",
    sub_pending: "чека одобрење",
    sub_none: "ништа",
    now_playing: "Тренутно се пушта",
    queue: "Ред",
    free: "{v} слободно",
    nothing_playing: "Ништа се не пушта",
    nothing_coming: "Ништа ускоро",
    nothing_queued: "Нема преузимања",
    nothing_requested: "Нема захтева на чекању",
    no_list: "Листи су потребне акције интеграције (Home Assistant 2025.2 или новији)",
    paused: "паузирано",
    today: "Данас",
    tomorrow: "Сутра",
    back: "Назад на преглед",
    episode: "С{s} Е{e}",
    by: "од {u}",
    req_pending: "На чекању",
    req_approved: "Одобрено",
    req_processing: "У току",
    req_available: "Доступно",
    req_declined: "Одбијено",
    req_failed: "Неуспело",
    no_server: "Није пронађен медијски сервер",
    chip_next: "Следеће: {t} · {d}",
    ed_players: "Плејери",
    ed_players_helper: "Медијски плејери сесија сервера (Jellyfin, Plex, Emby); празно: сви",
    ed_max_items: "Ставки по листи",
    ed_max_items_helper: "Колико ставки приказује свака листа",
    ed_show_requests: "Захтеви",
    ed_show_subtitle: "Прикажи поднаслов",
    ed_illustration: "Илустровано заглавље",
    ed_illustration_theme: "Тема заглавља",
    ed_theme_auto: "Аутоматски (прати тему)",
    ed_theme_day: "Дан",
    ed_theme_night: "Ноћ",
    ed_animations: "Анимације",
    ed_entities: "Ентитети (YAML)",
    ed_entities_helper: "Замењује пронађене сензоре, по улози: watching, transcoding, bandwidth, upcoming, queue, wanted, diskspace, requests",
    ed_title_helper: "Празно: Медијски сервер",
  },
  "sr-Latn": {
    title: "Medijski server",
    st_playing: "Reprodukuje: {n}",
    st_downloading: "Preuzimanje",
    st_idle: "Miruje",
    st_offline: "Nedostupno",
    c_streams: "Strimovi",
    c_coming: "Uskoro",
    c_downloads: "Preuzimanja",
    c_requests: "Zahtevi",
    sub_transcode: "transkodovanje: {n}",
    sub_next: "sledeće {d}",
    sub_queued: "u redu",
    sub_wanted: "traženo: {n}",
    sub_pending: "čeka odobrenje",
    sub_none: "ništa",
    now_playing: "Trenutno se pušta",
    queue: "Red",
    free: "{v} slobodno",
    nothing_playing: "Ništa se ne pušta",
    nothing_coming: "Ništa uskoro",
    nothing_queued: "Nema preuzimanja",
    nothing_requested: "Nema zahteva na čekanju",
    no_list: "Listi su potrebne akcije integracije (Home Assistant 2025.2 ili noviji)",
    paused: "pauzirano",
    today: "Danas",
    tomorrow: "Sutra",
    back: "Nazad na pregled",
    episode: "S{s} E{e}",
    by: "od {u}",
    req_pending: "Na čekanju",
    req_approved: "Odobreno",
    req_processing: "U toku",
    req_available: "Dostupno",
    req_declined: "Odbijeno",
    req_failed: "Neuspelo",
    no_server: "Nije pronađen medijski server",
    chip_next: "Sledeće: {t} · {d}",
    ed_players: "Plejeri",
    ed_players_helper: "Medijski plejeri sesija servera (Jellyfin, Plex, Emby); prazno: svi",
    ed_max_items: "Stavki po listi",
    ed_max_items_helper: "Koliko stavki prikazuje svaka lista",
    ed_show_requests: "Zahtevi",
    ed_show_subtitle: "Prikaži podnaslov",
    ed_illustration: "Ilustrovano zaglavlje",
    ed_illustration_theme: "Tema zaglavlja",
    ed_theme_auto: "Automatski (prati temu)",
    ed_theme_day: "Dan",
    ed_theme_night: "Noć",
    ed_animations: "Animacije",
    ed_entities: "Entiteti (YAML)",
    ed_entities_helper: "Zamenjuje pronađene senzore, po ulozi: watching, transcoding, bandwidth, upcoming, queue, wanted, diskspace, requests",
    ed_title_helper: "Prazno: Medijski server",
  },
  it: {
    title: "Server multimediale",
    st_playing: "In riproduzione: {n}",
    st_downloading: "Download in corso",
    st_idle: "Inattivo",
    st_offline: "Non disponibile",
    c_streams: "Riproduzioni",
    c_coming: "In arrivo",
    c_downloads: "Download",
    c_requests: "Richieste",
    sub_transcode: "transcodifica: {n}",
    sub_next: "prossimo {d}",
    sub_queued: "in coda",
    sub_wanted: "cercati: {n}",
    sub_pending: "in attesa di approvazione",
    sub_none: "niente",
    now_playing: "In riproduzione",
    queue: "Coda",
    free: "{v} liberi",
    nothing_playing: "Nessuna riproduzione",
    nothing_coming: "Niente in arrivo",
    nothing_queued: "Nessun download",
    nothing_requested: "Nessuna richiesta in attesa",
    no_list: "L'elenco richiede le azioni dell'integrazione (Home Assistant 2025.2 o successivo)",
    paused: "in pausa",
    today: "Oggi",
    tomorrow: "Domani",
    back: "Torna alla panoramica",
    episode: "S{s} E{e}",
    by: "da {u}",
    req_pending: "In attesa",
    req_approved: "Approvata",
    req_processing: "In corso",
    req_available: "Disponibile",
    req_declined: "Rifiutata",
    req_failed: "Non riuscita",
    no_server: "Nessun server multimediale trovato",
    chip_next: "Prossimo: {t} · {d}",
    ed_players: "Lettori",
    ed_players_helper: "I lettori multimediali delle sessioni del server (Jellyfin, Plex, Emby); vuoto: tutti",
    ed_max_items: "Elementi per elenco",
    ed_max_items_helper: "Quanti elementi mostra ogni elenco",
    ed_show_requests: "Richieste",
    ed_show_subtitle: "Mostra sottotitolo",
    ed_illustration: "Intestazione illustrata",
    ed_illustration_theme: "Tema dell'intestazione",
    ed_theme_auto: "Automatico (segue il tema)",
    ed_theme_day: "Giorno",
    ed_theme_night: "Notte",
    ed_animations: "Animazioni",
    ed_entities: "Entità (YAML)",
    ed_entities_helper: "Sostituisce i sensori trovati, per ruolo: watching, transcoding, bandwidth, upcoming, queue, wanted, diskspace, requests",
    ed_title_helper: "Vuoto: Server multimediale",
  },
  nl: {
    title: "Mediaserver",
    st_playing: "Speelt af: {n}",
    st_downloading: "Downloaden",
    st_idle: "Inactief",
    st_offline: "Niet beschikbaar",
    c_streams: "Streams",
    c_coming: "Binnenkort",
    c_downloads: "Downloads",
    c_requests: "Verzoeken",
    sub_transcode: "transcoderen: {n}",
    sub_next: "volgende {d}",
    sub_queued: "in de wachtrij",
    sub_wanted: "gezocht: {n}",
    sub_pending: "wacht op goedkeuring",
    sub_none: "niets",
    now_playing: "Speelt nu",
    queue: "Wachtrij",
    free: "{v} vrij",
    nothing_playing: "Er speelt niets",
    nothing_coming: "Niets binnenkort",
    nothing_queued: "Geen download",
    nothing_requested: "Geen openstaand verzoek",
    no_list: "De lijst heeft de acties van de integratie nodig (Home Assistant 2025.2 of nieuwer)",
    paused: "gepauzeerd",
    today: "Vandaag",
    tomorrow: "Morgen",
    back: "Terug naar het overzicht",
    episode: "S{s} A{e}",
    by: "door {u}",
    req_pending: "In afwachting",
    req_approved: "Goedgekeurd",
    req_processing: "Bezig",
    req_available: "Beschikbaar",
    req_declined: "Afgewezen",
    req_failed: "Mislukt",
    no_server: "Geen mediaserver gevonden",
    chip_next: "Volgende: {t} · {d}",
    ed_players: "Spelers",
    ed_players_helper: "De mediaspelers van de sessies van de server (Jellyfin, Plex, Emby); leeg: allemaal",
    ed_max_items: "Items per lijst",
    ed_max_items_helper: "Hoeveel items elke lijst toont",
    ed_show_requests: "Verzoeken",
    ed_show_subtitle: "Ondertitel tonen",
    ed_illustration: "Geïllustreerde koptekst",
    ed_illustration_theme: "Thema van de koptekst",
    ed_theme_auto: "Automatisch (volgt het thema)",
    ed_theme_day: "Dag",
    ed_theme_night: "Nacht",
    ed_animations: "Animaties",
    ed_entities: "Entiteiten (YAML)",
    ed_entities_helper: "Vervangt de gevonden sensoren, per rol: watching, transcoding, bandwidth, upcoming, queue, wanted, diskspace, requests",
    ed_title_helper: "Leeg: Mediaserver",
  },
  pt: {
    title: "Servidor multimédia",
    st_playing: "A reproduzir: {n}",
    st_downloading: "A transferir",
    st_idle: "Inativo",
    st_offline: "Indisponível",
    c_streams: "Reproduções",
    c_coming: "Brevemente",
    c_downloads: "Transferências",
    c_requests: "Pedidos",
    sub_transcode: "a transcodificar: {n}",
    sub_next: "próximo {d}",
    sub_queued: "na fila",
    sub_wanted: "procurados: {n}",
    sub_pending: "a aguardar aprovação",
    sub_none: "nada",
    now_playing: "A reproduzir agora",
    queue: "Fila",
    free: "{v} livres",
    nothing_playing: "Nada a reproduzir",
    nothing_coming: "Nada brevemente",
    nothing_queued: "Nenhuma transferência",
    nothing_requested: "Nenhum pedido pendente",
    no_list: "A lista precisa das ações da integração (Home Assistant 2025.2 ou posterior)",
    paused: "em pausa",
    today: "Hoje",
    tomorrow: "Amanhã",
    back: "Voltar à vista geral",
    episode: "T{s} E{e}",
    by: "por {u}",
    req_pending: "Pendente",
    req_approved: "Aprovado",
    req_processing: "Em curso",
    req_available: "Disponível",
    req_declined: "Recusado",
    req_failed: "Falhou",
    no_server: "Nenhum servidor multimédia encontrado",
    chip_next: "Próximo: {t} · {d}",
    ed_players: "Leitores",
    ed_players_helper: "Os leitores multimédia das sessões do servidor (Jellyfin, Plex, Emby); vazio: todos",
    ed_max_items: "Itens por lista",
    ed_max_items_helper: "Quantos itens cada lista mostra",
    ed_show_requests: "Pedidos",
    ed_show_subtitle: "Mostrar subtítulo",
    ed_illustration: "Cabeçalho ilustrado",
    ed_illustration_theme: "Tema do cabeçalho",
    ed_theme_auto: "Automático (segue o tema)",
    ed_theme_day: "Dia",
    ed_theme_night: "Noite",
    ed_animations: "Animações",
    ed_entities: "Entidades (YAML)",
    ed_entities_helper: "Substitui os sensores encontrados, por função: watching, transcoding, bandwidth, upcoming, queue, wanted, diskspace, requests",
    ed_title_helper: "Vazio: Servidor multimédia",
  },
  pl: {
    title: "Serwer multimediów",
    st_playing: "Odtwarzanie: {n}",
    st_downloading: "Pobieranie",
    st_idle: "Bezczynny",
    st_offline: "Niedostępne",
    c_streams: "Strumienie",
    c_coming: "Wkrótce",
    c_downloads: "Pobierane",
    c_requests: "Prośby",
    sub_transcode: "transkodowanie: {n}",
    sub_next: "następne {d}",
    sub_queued: "w kolejce",
    sub_wanted: "poszukiwane: {n}",
    sub_pending: "czeka na zatwierdzenie",
    sub_none: "nic",
    now_playing: "Teraz odtwarzane",
    queue: "Kolejka",
    free: "{v} wolne",
    nothing_playing: "Nic nie jest odtwarzane",
    nothing_coming: "Nic wkrótce",
    nothing_queued: "Brak pobierania",
    nothing_requested: "Brak oczekujących próśb",
    no_list: "Lista wymaga akcji integracji (Home Assistant 2025.2 lub nowszy)",
    paused: "wstrzymane",
    today: "Dziś",
    tomorrow: "Jutro",
    back: "Wróć do przeglądu",
    episode: "S{s} O{e}",
    by: "od {u}",
    req_pending: "Oczekuje",
    req_approved: "Zatwierdzona",
    req_processing: "W toku",
    req_available: "Dostępna",
    req_declined: "Odrzucona",
    req_failed: "Nieudana",
    no_server: "Nie znaleziono serwera multimediów",
    chip_next: "Następne: {t} · {d}",
    ed_players: "Odtwarzacze",
    ed_players_helper: "Odtwarzacze multimediów sesji serwera (Jellyfin, Plex, Emby); puste: wszystkie",
    ed_max_items: "Elementy na listę",
    ed_max_items_helper: "Ile elementów pokazuje każda lista",
    ed_show_requests: "Prośby",
    ed_show_subtitle: "Pokaż podtytuł",
    ed_illustration: "Ilustrowany nagłówek",
    ed_illustration_theme: "Motyw nagłówka",
    ed_theme_auto: "Automatycznie (zgodnie z motywem)",
    ed_theme_day: "Dzień",
    ed_theme_night: "Noc",
    ed_animations: "Animacje",
    ed_entities: "Encje (YAML)",
    ed_entities_helper: "Zastępuje znalezione czujniki, według roli: watching, transcoding, bandwidth, upcoming, queue, wanted, diskspace, requests",
    ed_title_helper: "Puste: Serwer multimediów",
  },
  ro: {
    title: "Server media",
    st_playing: "Redare: {n}",
    st_downloading: "Descărcare",
    st_idle: "Inactiv",
    st_offline: "Indisponibil",
    c_streams: "Redări",
    c_coming: "În curând",
    c_downloads: "Descărcări",
    c_requests: "Cereri",
    sub_transcode: "transcodare: {n}",
    sub_next: "următorul {d}",
    sub_queued: "în coadă",
    sub_wanted: "căutate: {n}",
    sub_pending: "așteaptă aprobarea",
    sub_none: "nimic",
    now_playing: "Se redă acum",
    queue: "Coadă",
    free: "{v} liberi",
    nothing_playing: "Nimic în redare",
    nothing_coming: "Nimic în curând",
    nothing_queued: "Nicio descărcare",
    nothing_requested: "Nicio cerere în așteptare",
    no_list: "Lista are nevoie de acțiunile integrării (Home Assistant 2025.2 sau mai nou)",
    paused: "în pauză",
    today: "Azi",
    tomorrow: "Mâine",
    back: "Înapoi la prezentare",
    episode: "S{s} E{e}",
    by: "de {u}",
    req_pending: "În așteptare",
    req_approved: "Aprobată",
    req_processing: "În curs",
    req_available: "Disponibilă",
    req_declined: "Respinsă",
    req_failed: "Eșuată",
    no_server: "Nu s-a găsit niciun server media",
    chip_next: "Următorul: {t} · {d}",
    ed_players: "Playere",
    ed_players_helper: "Playerele media ale sesiunilor serverului (Jellyfin, Plex, Emby); gol: toate",
    ed_max_items: "Elemente pe listă",
    ed_max_items_helper: "Câte elemente arată fiecare listă",
    ed_show_requests: "Cereri",
    ed_show_subtitle: "Afișează subtitlul",
    ed_illustration: "Antet ilustrat",
    ed_illustration_theme: "Tema antetului",
    ed_theme_auto: "Automat (urmează tema)",
    ed_theme_day: "Zi",
    ed_theme_night: "Noapte",
    ed_animations: "Animații",
    ed_entities: "Entități (YAML)",
    ed_entities_helper: "Înlocuiește senzorii găsiți, după rol: watching, transcoding, bandwidth, upcoming, queue, wanted, diskspace, requests",
    ed_title_helper: "Gol: Server media",
  },
  da: {
    title: "Medieserver",
    st_playing: "Afspiller: {n}",
    st_downloading: "Downloader",
    st_idle: "Inaktiv",
    st_offline: "Utilgængelig",
    c_streams: "Streams",
    c_coming: "Kommer snart",
    c_downloads: "Downloads",
    c_requests: "Anmodninger",
    sub_transcode: "transkoder: {n}",
    sub_next: "næste {d}",
    sub_queued: "i køen",
    sub_wanted: "eftersøgt: {n}",
    sub_pending: "venter på godkendelse",
    sub_none: "intet",
    now_playing: "Afspilles nu",
    queue: "Kø",
    free: "{v} ledig",
    nothing_playing: "Intet afspilles",
    nothing_coming: "Intet på vej",
    nothing_queued: "Ingen download",
    nothing_requested: "Ingen ventende anmodning",
    no_list: "Listen kræver integrationens handlinger (Home Assistant 2025.2 eller nyere)",
    paused: "pauset",
    today: "I dag",
    tomorrow: "I morgen",
    back: "Tilbage til oversigten",
    episode: "S{s} A{e}",
    by: "af {u}",
    req_pending: "Afventer",
    req_approved: "Godkendt",
    req_processing: "I gang",
    req_available: "Tilgængelig",
    req_declined: "Afvist",
    req_failed: "Mislykket",
    no_server: "Ingen medieserver fundet",
    chip_next: "Næste: {t} · {d}",
    ed_players: "Afspillere",
    ed_players_helper: "Medieafspillerne for serverens sessioner (Jellyfin, Plex, Emby); tom: alle",
    ed_max_items: "Elementer pr. liste",
    ed_max_items_helper: "Hvor mange elementer hver liste viser",
    ed_show_requests: "Anmodninger",
    ed_show_subtitle: "Vis undertitel",
    ed_illustration: "Illustreret overskrift",
    ed_illustration_theme: "Overskriftens tema",
    ed_theme_auto: "Automatisk (følger temaet)",
    ed_theme_day: "Dag",
    ed_theme_night: "Nat",
    ed_animations: "Animationer",
    ed_entities: "Enheder (YAML)",
    ed_entities_helper: "Erstatter de fundne sensorer, efter rolle: watching, transcoding, bandwidth, upcoming, queue, wanted, diskspace, requests",
    ed_title_helper: "Tom: Medieserver",
  },
  sv: {
    title: "Medieserver",
    st_playing: "Spelar: {n}",
    st_downloading: "Laddar ner",
    st_idle: "Inaktiv",
    st_offline: "Otillgänglig",
    c_streams: "Strömmar",
    c_coming: "Kommer snart",
    c_downloads: "Nedladdningar",
    c_requests: "Förfrågningar",
    sub_transcode: "omkodar: {n}",
    sub_next: "nästa {d}",
    sub_queued: "i kön",
    sub_wanted: "eftersökta: {n}",
    sub_pending: "väntar på godkännande",
    sub_none: "inget",
    now_playing: "Spelas nu",
    queue: "Kö",
    free: "{v} ledigt",
    nothing_playing: "Inget spelas",
    nothing_coming: "Inget på gång",
    nothing_queued: "Ingen nedladdning",
    nothing_requested: "Ingen väntande förfrågan",
    no_list: "Listan kräver integrationens åtgärder (Home Assistant 2025.2 eller senare)",
    paused: "pausad",
    today: "I dag",
    tomorrow: "I morgon",
    back: "Tillbaka till översikten",
    episode: "S{s} A{e}",
    by: "av {u}",
    req_pending: "Väntar",
    req_approved: "Godkänd",
    req_processing: "Pågår",
    req_available: "Tillgänglig",
    req_declined: "Avvisad",
    req_failed: "Misslyckad",
    no_server: "Ingen medieserver hittades",
    chip_next: "Nästa: {t} · {d}",
    ed_players: "Spelare",
    ed_players_helper: "Mediaspelarna för serverns sessioner (Jellyfin, Plex, Emby); tom: alla",
    ed_max_items: "Objekt per lista",
    ed_max_items_helper: "Hur många objekt varje lista visar",
    ed_show_requests: "Förfrågningar",
    ed_show_subtitle: "Visa underrubrik",
    ed_illustration: "Illustrerad rubrik",
    ed_illustration_theme: "Rubrikens tema",
    ed_theme_auto: "Automatiskt (följer temat)",
    ed_theme_day: "Dag",
    ed_theme_night: "Natt",
    ed_animations: "Animationer",
    ed_entities: "Entiteter (YAML)",
    ed_entities_helper: "Ersätter de hittade sensorerna, per roll: watching, transcoding, bandwidth, upcoming, queue, wanted, diskspace, requests",
    ed_title_helper: "Tom: Medieserver",
  },
  bg: {
    title: "Медиен сървър",
    st_playing: "Възпроизвежда: {n}",
    st_downloading: "Изтегляне",
    st_idle: "Неактивен",
    st_offline: "Недостъпно",
    c_streams: "Потоци",
    c_coming: "Предстои",
    c_downloads: "Изтегляния",
    c_requests: "Заявки",
    sub_transcode: "транскодиране: {n}",
    sub_next: "следващо {d}",
    sub_queued: "в опашката",
    sub_wanted: "търсени: {n}",
    sub_pending: "чака одобрение",
    sub_none: "нищо",
    now_playing: "Сега се възпроизвежда",
    queue: "Опашка",
    free: "{v} свободни",
    nothing_playing: "Нищо не се възпроизвежда",
    nothing_coming: "Нищо предстоящо",
    nothing_queued: "Няма изтегляне",
    nothing_requested: "Няма чакащи заявки",
    no_list: "Списъкът изисква действията на интеграцията (Home Assistant 2025.2 или по-нов)",
    paused: "на пауза",
    today: "Днес",
    tomorrow: "Утре",
    back: "Обратно към прегледа",
    episode: "С{s} Е{e}",
    by: "от {u}",
    req_pending: "Чакаща",
    req_approved: "Одобрена",
    req_processing: "В процес",
    req_available: "Налична",
    req_declined: "Отхвърлена",
    req_failed: "Неуспешна",
    no_server: "Не е намерен медиен сървър",
    chip_next: "Следващо: {t} · {d}",
    ed_players: "Плейъри",
    ed_players_helper: "Медийните плейъри на сесиите на сървъра (Jellyfin, Plex, Emby); празно: всички",
    ed_max_items: "Елементи в списък",
    ed_max_items_helper: "Колко елемента показва всеки списък",
    ed_show_requests: "Заявки",
    ed_show_subtitle: "Показване на подзаглавие",
    ed_illustration: "Илюстрирано заглавие",
    ed_illustration_theme: "Тема на заглавието",
    ed_theme_auto: "Автоматично (следва темата)",
    ed_theme_day: "Ден",
    ed_theme_night: "Нощ",
    ed_animations: "Анимации",
    ed_entities: "Обекти (YAML)",
    ed_entities_helper: "Замества намерените сензори, по роля: watching, transcoding, bandwidth, upcoming, queue, wanted, diskspace, requests",
    ed_title_helper: "Празно: Медиен сървър",
  },
  ru: {
    title: "Медиасервер",
    st_playing: "Воспроизведение: {n}",
    st_downloading: "Загрузка",
    st_idle: "Простой",
    st_offline: "Недоступно",
    c_streams: "Потоки",
    c_coming: "Скоро",
    c_downloads: "Загрузки",
    c_requests: "Запросы",
    sub_transcode: "транскодирование: {n}",
    sub_next: "следующий {d}",
    sub_queued: "в очереди",
    sub_wanted: "в розыске: {n}",
    sub_pending: "ждёт одобрения",
    sub_none: "ничего",
    now_playing: "Сейчас играет",
    queue: "Очередь",
    free: "{v} свободно",
    nothing_playing: "Ничего не воспроизводится",
    nothing_coming: "Ничего не ожидается",
    nothing_queued: "Нет загрузок",
    nothing_requested: "Нет ожидающих запросов",
    no_list: "Списку нужны действия интеграции (Home Assistant 2025.2 или новее)",
    paused: "на паузе",
    today: "Сегодня",
    tomorrow: "Завтра",
    back: "Назад к обзору",
    episode: "С{s} Э{e}",
    by: "от {u}",
    req_pending: "Ожидает",
    req_approved: "Одобрен",
    req_processing: "В работе",
    req_available: "Доступен",
    req_declined: "Отклонён",
    req_failed: "Ошибка",
    no_server: "Медиасервер не найден",
    chip_next: "Далее: {t} · {d}",
    ed_players: "Плееры",
    ed_players_helper: "Медиаплееры сеансов сервера (Jellyfin, Plex, Emby); пусто: все",
    ed_max_items: "Элементов в списке",
    ed_max_items_helper: "Сколько элементов показывает каждый список",
    ed_show_requests: "Запросы",
    ed_show_subtitle: "Показывать подзаголовок",
    ed_illustration: "Иллюстрированный заголовок",
    ed_illustration_theme: "Тема заголовка",
    ed_theme_auto: "Автоматически (по теме)",
    ed_theme_day: "День",
    ed_theme_night: "Ночь",
    ed_animations: "Анимации",
    ed_entities: "Объекты (YAML)",
    ed_entities_helper: "Заменяет найденные датчики, по роли: watching, transcoding, bandwidth, upcoming, queue, wanted, diskspace, requests",
    ed_title_helper: "Пусто: Медиасервер",
  },
  uk: {
    title: "Медіасервер",
    st_playing: "Відтворення: {n}",
    st_downloading: "Завантаження",
    st_idle: "Простій",
    st_offline: "Недоступно",
    c_streams: "Потоки",
    c_coming: "Незабаром",
    c_downloads: "Завантаження",
    c_requests: "Запити",
    sub_transcode: "транскодування: {n}",
    sub_next: "наступний {d}",
    sub_queued: "у черзі",
    sub_wanted: "у розшуку: {n}",
    sub_pending: "чекає схвалення",
    sub_none: "нічого",
    now_playing: "Зараз грає",
    queue: "Черга",
    free: "{v} вільно",
    nothing_playing: "Нічого не відтворюється",
    nothing_coming: "Нічого не очікується",
    nothing_queued: "Немає завантажень",
    nothing_requested: "Немає запитів, що очікують",
    no_list: "Списку потрібні дії інтеграції (Home Assistant 2025.2 або новіший)",
    paused: "на паузі",
    today: "Сьогодні",
    tomorrow: "Завтра",
    back: "Назад до огляду",
    episode: "С{s} Е{e}",
    by: "від {u}",
    req_pending: "Очікує",
    req_approved: "Схвалено",
    req_processing: "Виконується",
    req_available: "Доступно",
    req_declined: "Відхилено",
    req_failed: "Помилка",
    no_server: "Медіасервер не знайдено",
    chip_next: "Далі: {t} · {d}",
    ed_players: "Плеєри",
    ed_players_helper: "Медіаплеєри сеансів сервера (Jellyfin, Plex, Emby); порожньо: усі",
    ed_max_items: "Елементів у списку",
    ed_max_items_helper: "Скільки елементів показує кожен список",
    ed_show_requests: "Запити",
    ed_show_subtitle: "Показувати підзаголовок",
    ed_illustration: "Ілюстрований заголовок",
    ed_illustration_theme: "Тема заголовка",
    ed_theme_auto: "Автоматично (за темою)",
    ed_theme_day: "День",
    ed_theme_night: "Ніч",
    ed_animations: "Анімації",
    ed_entities: "Об'єкти (YAML)",
    ed_entities_helper: "Замінює знайдені датчики, за роллю: watching, transcoding, bandwidth, upcoming, queue, wanted, diskspace, requests",
    ed_title_helper: "Порожньо: Медіасервер",
  },
  hu: {
    title: "Médiaszerver",
    st_playing: "Lejátszás: {n}",
    st_downloading: "Letöltés",
    st_idle: "Tétlen",
    st_offline: "Nem elérhető",
    c_streams: "Lejátszások",
    c_coming: "Hamarosan",
    c_downloads: "Letöltések",
    c_requests: "Kérések",
    sub_transcode: "átkódolás: {n}",
    sub_next: "következő {d}",
    sub_queued: "a sorban",
    sub_wanted: "keresett: {n}",
    sub_pending: "jóváhagyásra vár",
    sub_none: "semmi",
    now_playing: "Most szól",
    queue: "Sor",
    free: "{v} szabad",
    nothing_playing: "Nincs lejátszás",
    nothing_coming: "Semmi sem várható",
    nothing_queued: "Nincs letöltés",
    nothing_requested: "Nincs függő kérés",
    no_list: "A listához az integráció műveletei kellenek (Home Assistant 2025.2 vagy újabb)",
    paused: "szüneteltetve",
    today: "Ma",
    tomorrow: "Holnap",
    back: "Vissza az áttekintéshez",
    episode: "{s}. évad {e}. rész",
    by: "kérte: {u}",
    req_pending: "Függőben",
    req_approved: "Jóváhagyva",
    req_processing: "Folyamatban",
    req_available: "Elérhető",
    req_declined: "Elutasítva",
    req_failed: "Sikertelen",
    no_server: "Nem található médiaszerver",
    chip_next: "Következő: {t} · {d}",
    ed_players: "Lejátszók",
    ed_players_helper: "A szerver munkameneteinek médialejátszói (Jellyfin, Plex, Emby); üres: mind",
    ed_max_items: "Elemek listánként",
    ed_max_items_helper: "Hány elemet mutat az egyes listák",
    ed_show_requests: "Kérések",
    ed_show_subtitle: "Alcím megjelenítése",
    ed_illustration: "Illusztrált fejléc",
    ed_illustration_theme: "Fejléc témája",
    ed_theme_auto: "Automatikus (követi a témát)",
    ed_theme_day: "Nappal",
    ed_theme_night: "Éjszaka",
    ed_animations: "Animációk",
    ed_entities: "Entitások (YAML)",
    ed_entities_helper: "Felülírja a talált érzékelőket, szerepkör szerint: watching, transcoding, bandwidth, upcoming, queue, wanted, diskspace, requests",
    ed_title_helper: "Üres: Médiaszerver",
  },
  sk: {
    title: "Mediálny server",
    st_playing: "Prehráva sa: {n}",
    st_downloading: "Sťahovanie",
    st_idle: "Nečinný",
    st_offline: "Nedostupné",
    c_streams: "Streamy",
    c_coming: "Čoskoro",
    c_downloads: "Sťahovania",
    c_requests: "Žiadosti",
    sub_transcode: "prekódovanie: {n}",
    sub_next: "ďalší {d}",
    sub_queued: "vo fronte",
    sub_wanted: "hľadané: {n}",
    sub_pending: "čaká na schválenie",
    sub_none: "nič",
    now_playing: "Práve hrá",
    queue: "Front",
    free: "{v} voľných",
    nothing_playing: "Nič sa neprehráva",
    nothing_coming: "Nič čoskoro",
    nothing_queued: "Žiadne sťahovanie",
    nothing_requested: "Žiadna čakajúca žiadosť",
    no_list: "Zoznam potrebuje akcie integrácie (Home Assistant 2025.2 alebo novší)",
    paused: "pozastavené",
    today: "Dnes",
    tomorrow: "Zajtra",
    back: "Späť na prehľad",
    episode: "S{s} E{e}",
    by: "od {u}",
    req_pending: "Čaká",
    req_approved: "Schválená",
    req_processing: "Prebieha",
    req_available: "Dostupná",
    req_declined: "Zamietnutá",
    req_failed: "Zlyhala",
    no_server: "Nenašiel sa žiadny mediálny server",
    chip_next: "Ďalší: {t} · {d}",
    ed_players: "Prehrávače",
    ed_players_helper: "Mediálne prehrávače relácií servera (Jellyfin, Plex, Emby); prázdne: všetky",
    ed_max_items: "Položky v zozname",
    ed_max_items_helper: "Koľko položiek zobrazí každý zoznam",
    ed_show_requests: "Žiadosti",
    ed_show_subtitle: "Zobraziť podnadpis",
    ed_illustration: "Ilustrovaná hlavička",
    ed_illustration_theme: "Téma hlavičky",
    ed_theme_auto: "Automaticky (podľa témy)",
    ed_theme_day: "Deň",
    ed_theme_night: "Noc",
    ed_animations: "Animácie",
    ed_entities: "Entity (YAML)",
    ed_entities_helper: "Nahrádza nájdené senzory, podľa roly: watching, transcoding, bandwidth, upcoming, queue, wanted, diskspace, requests",
    ed_title_helper: "Prázdne: Mediálny server",
  },
  cs: {
    title: "Mediální server",
    st_playing: "Přehrává se: {n}",
    st_downloading: "Stahování",
    st_idle: "Nečinný",
    st_offline: "Nedostupné",
    c_streams: "Streamy",
    c_coming: "Brzy",
    c_downloads: "Stahování",
    c_requests: "Žádosti",
    sub_transcode: "překódování: {n}",
    sub_next: "další {d}",
    sub_queued: "ve frontě",
    sub_wanted: "hledané: {n}",
    sub_pending: "čeká na schválení",
    sub_none: "nic",
    now_playing: "Právě hraje",
    queue: "Fronta",
    free: "{v} volných",
    nothing_playing: "Nic se nepřehrává",
    nothing_coming: "Nic brzy",
    nothing_queued: "Žádné stahování",
    nothing_requested: "Žádná čekající žádost",
    no_list: "Seznam potřebuje akce integrace (Home Assistant 2025.2 nebo novější)",
    paused: "pozastaveno",
    today: "Dnes",
    tomorrow: "Zítra",
    back: "Zpět na přehled",
    episode: "S{s} E{e}",
    by: "od {u}",
    req_pending: "Čeká",
    req_approved: "Schválena",
    req_processing: "Probíhá",
    req_available: "Dostupná",
    req_declined: "Zamítnuta",
    req_failed: "Selhala",
    no_server: "Nebyl nalezen žádný mediální server",
    chip_next: "Další: {t} · {d}",
    ed_players: "Přehrávače",
    ed_players_helper: "Mediální přehrávače relací serveru (Jellyfin, Plex, Emby); prázdné: všechny",
    ed_max_items: "Položky v seznamu",
    ed_max_items_helper: "Kolik položek zobrazí každý seznam",
    ed_show_requests: "Žádosti",
    ed_show_subtitle: "Zobrazit podtitul",
    ed_illustration: "Ilustrovaná hlavička",
    ed_illustration_theme: "Motiv hlavičky",
    ed_theme_auto: "Automaticky (podle motivu)",
    ed_theme_day: "Den",
    ed_theme_night: "Noc",
    ed_animations: "Animace",
    ed_entities: "Entity (YAML)",
    ed_entities_helper: "Nahrazuje nalezené senzory, podle role: watching, transcoding, bandwidth, upcoming, queue, wanted, diskspace, requests",
    ed_title_helper: "Prázdné: Mediální server",
  },
  sl: {
    title: "Medijski strežnik",
    st_playing: "Predvaja se: {n}",
    st_downloading: "Prenašanje",
    st_idle: "Nedejaven",
    st_offline: "Ni na voljo",
    c_streams: "Predvajanja",
    c_coming: "Kmalu",
    c_downloads: "Prenosi",
    c_requests: "Zahteve",
    sub_transcode: "prekodiranje: {n}",
    sub_next: "naslednje {d}",
    sub_queued: "v vrsti",
    sub_wanted: "iskano: {n}",
    sub_pending: "čaka na odobritev",
    sub_none: "nič",
    now_playing: "Zdaj se predvaja",
    queue: "Vrsta",
    free: "{v} prosto",
    nothing_playing: "Nič se ne predvaja",
    nothing_coming: "Nič kmalu",
    nothing_queued: "Ni prenosov",
    nothing_requested: "Ni čakajočih zahtev",
    no_list: "Seznam potrebuje dejanja integracije (Home Assistant 2025.2 ali novejši)",
    paused: "zaustavljeno",
    today: "Danes",
    tomorrow: "Jutri",
    back: "Nazaj na pregled",
    episode: "S{s} E{e}",
    by: "od {u}",
    req_pending: "Čaka",
    req_approved: "Odobreno",
    req_processing: "V teku",
    req_available: "Na voljo",
    req_declined: "Zavrnjeno",
    req_failed: "Ni uspelo",
    no_server: "Medijski strežnik ni bil najden",
    chip_next: "Naslednje: {t} · {d}",
    ed_players: "Predvajalniki",
    ed_players_helper: "Medijski predvajalniki sej strežnika (Jellyfin, Plex, Emby); prazno: vsi",
    ed_max_items: "Elementov na seznam",
    ed_max_items_helper: "Koliko elementov pokaže vsak seznam",
    ed_show_requests: "Zahteve",
    ed_show_subtitle: "Prikaži podnaslov",
    ed_illustration: "Ilustrirana glava",
    ed_illustration_theme: "Tema glave",
    ed_theme_auto: "Samodejno (sledi temi)",
    ed_theme_day: "Dan",
    ed_theme_night: "Noč",
    ed_animations: "Animacije",
    ed_entities: "Entitete (YAML)",
    ed_entities_helper: "Nadomesti najdene senzorje, po vlogi: watching, transcoding, bandwidth, upcoming, queue, wanted, diskspace, requests",
    ed_title_helper: "Prazno: Medijski strežnik",
  },
  lv: {
    title: "Mediju serveris",
    st_playing: "Atskaņo: {n}",
    st_downloading: "Lejupielāde",
    st_idle: "Dīkstāvē",
    st_offline: "Nav pieejams",
    c_streams: "Straumes",
    c_coming: "Drīzumā",
    c_downloads: "Lejupielādes",
    c_requests: "Pieprasījumi",
    sub_transcode: "pārkodēšana: {n}",
    sub_next: "nākamais {d}",
    sub_queued: "rindā",
    sub_wanted: "meklēti: {n}",
    sub_pending: "gaida apstiprinājumu",
    sub_none: "nekas",
    now_playing: "Tagad atskaņo",
    queue: "Rinda",
    free: "{v} brīvi",
    nothing_playing: "Nekas netiek atskaņots",
    nothing_coming: "Nekas drīzumā",
    nothing_queued: "Nav lejupielāžu",
    nothing_requested: "Nav gaidošu pieprasījumu",
    no_list: "Sarakstam vajag integrācijas darbības (Home Assistant 2025.2 vai jaunāks)",
    paused: "pauzēts",
    today: "Šodien",
    tomorrow: "Rīt",
    back: "Atpakaļ uz pārskatu",
    episode: "S{s} E{e}",
    by: "no {u}",
    req_pending: "Gaida",
    req_approved: "Apstiprināts",
    req_processing: "Notiek",
    req_available: "Pieejams",
    req_declined: "Noraidīts",
    req_failed: "Neizdevās",
    no_server: "Mediju serveris nav atrasts",
    chip_next: "Nākamais: {t} · {d}",
    ed_players: "Atskaņotāji",
    ed_players_helper: "Servera sesiju mediju atskaņotāji (Jellyfin, Plex, Emby); tukšs: visi",
    ed_max_items: "Vienumi sarakstā",
    ed_max_items_helper: "Cik vienumu rāda katrs saraksts",
    ed_show_requests: "Pieprasījumi",
    ed_show_subtitle: "Rādīt apakšvirsrakstu",
    ed_illustration: "Ilustrēta galvene",
    ed_illustration_theme: "Galvenes motīvs",
    ed_theme_auto: "Automātiski (pēc motīva)",
    ed_theme_day: "Diena",
    ed_theme_night: "Nakts",
    ed_animations: "Animācijas",
    ed_entities: "Entītijas (YAML)",
    ed_entities_helper: "Aizstāj atrastos sensorus, pēc lomas: watching, transcoding, bandwidth, upcoming, queue, wanted, diskspace, requests",
    ed_title_helper: "Tukšs: Mediju serveris",
  },
  el: {
    title: "Διακομιστής πολυμέσων",
    st_playing: "Αναπαραγωγή: {n}",
    st_downloading: "Λήψη",
    st_idle: "Αδρανής",
    st_offline: "Μη διαθέσιμο",
    c_streams: "Ροές",
    c_coming: "Έρχονται",
    c_downloads: "Λήψεις",
    c_requests: "Αιτήματα",
    sub_transcode: "μετακωδικοποίηση: {n}",
    sub_next: "επόμενο {d}",
    sub_queued: "στην ουρά",
    sub_wanted: "αναζητούνται: {n}",
    sub_pending: "αναμένει έγκριση",
    sub_none: "τίποτα",
    now_playing: "Παίζει τώρα",
    queue: "Ουρά",
    free: "{v} ελεύθερα",
    nothing_playing: "Δεν παίζει τίποτα",
    nothing_coming: "Τίποτα σύντομα",
    nothing_queued: "Καμία λήψη",
    nothing_requested: "Κανένα αίτημα σε αναμονή",
    no_list: "Η λίστα χρειάζεται τις ενέργειες της ενσωμάτωσης (Home Assistant 2025.2 ή νεότερο)",
    paused: "σε παύση",
    today: "Σήμερα",
    tomorrow: "Αύριο",
    back: "Πίσω στην επισκόπηση",
    episode: "Σ{s} Ε{e}",
    by: "από {u}",
    req_pending: "Σε αναμονή",
    req_approved: "Εγκρίθηκε",
    req_processing: "Σε εξέλιξη",
    req_available: "Διαθέσιμο",
    req_declined: "Απορρίφθηκε",
    req_failed: "Απέτυχε",
    no_server: "Δεν βρέθηκε διακομιστής πολυμέσων",
    chip_next: "Επόμενο: {t} · {d}",
    ed_players: "Συσκευές αναπαραγωγής",
    ed_players_helper: "Οι συσκευές αναπαραγωγής των συνεδριών του διακομιστή (Jellyfin, Plex, Emby)· κενό: όλες",
    ed_max_items: "Στοιχεία ανά λίστα",
    ed_max_items_helper: "Πόσα στοιχεία δείχνει κάθε λίστα",
    ed_show_requests: "Αιτήματα",
    ed_show_subtitle: "Εμφάνιση υπότιτλου",
    ed_illustration: "Εικονογραφημένη κεφαλίδα",
    ed_illustration_theme: "Θέμα κεφαλίδας",
    ed_theme_auto: "Αυτόματο (ακολουθεί το θέμα)",
    ed_theme_day: "Ημέρα",
    ed_theme_night: "Νύχτα",
    ed_animations: "Κινούμενα σχέδια",
    ed_entities: "Οντότητες (YAML)",
    ed_entities_helper: "Αντικαθιστά τους αισθητήρες που βρέθηκαν, ανά ρόλο: watching, transcoding, bandwidth, upcoming, queue, wanted, diskspace, requests",
    ed_title_helper: "Κενό: Διακομιστής πολυμέσων",
  },
};

// ── Helpers ──────────────────────────────────────────────────────────────────
const rcLang = (i18n, hass, config) => {
  // The full tag when the card has it (sr-Latn), else its base language (fr-FR → fr, pt-BR → pt), else English.
  const l = config?.language || hass?.locale?.language || hass?.language || "en";
  const base = l.split("-")[0];
  return i18n[l] ? l : i18n[base] ? base : "en";
};

const rcT = (i18n, lang, key, vars = {}) => {
  const s = i18n[lang]?.[key] ?? RC_I18N[lang]?.[key] ?? i18n.en[key] ?? RC_I18N.en[key] ?? key;
  return s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
};

const rcEsc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );

const rcMoreInfo = (node, entityId) => {
  const ev = new Event("hass-more-info", { bubbles: true, composed: true });
  ev.detail = { entityId };
  node.dispatchEvent(ev);
};

const rcNavigate = (path) => {
  history.pushState(null, "", path);
  window.dispatchEvent(new CustomEvent("location-changed", { detail: { replace: false } }));
};

// Wires a card header to its `navigation_path`: click, and Enter on the header itself.
const rcBindNav = (head, path) => {
  head.addEventListener("click", () => rcNavigate(path));
  head.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter" && ev.target === head) rcNavigate(path);
  });
};

// HA's callService already shows a toast when the call fails, then rejects: the rejection is only swallowed here
// so that it does not end up as "Uncaught (in promise)".
const rcCall = (hass, domain, service, data) => Promise.resolve(hass.callService(domain, service, data)).catch(() => {});

// A click inside a dialog (more-info opened from the card, say) is not a click outside the card.
const rcInDialog = (ev) => ev.composedPath().some((n) => ["ha-more-info-dialog", "ha-dialog", "dialog"].includes(n.localName));

// `fn()`, computed again only when one of `deps` is no longer the same object (or value) as last time.
const rcMemo = (store, key, deps, fn) => {
  const hit = store[key];
  if (hit && hit.deps.length === deps.length && hit.deps.every((d, i) => d === deps[i])) return hit.value;
  const value = fn();
  store[key] = { deps, value };
  return value;
};

// ── Base card ────────────────────────────────────────────────────────────────
class RcCard extends HTMLElement {
  static getStubConfig(hass) {
    const areas = Object.keys(hass?.areas ?? {});
    return { area: areas[0] ?? "" };
  }

  // Subclasses set: static i18n, static defaults, static tag, static styles.
  static getConfigElement() {
    // biome-ignore lint/complexity/noThisInStatic: each subclass opens its own editor.
    return document.createElement(`${this.tag}-editor`);
  }

  setConfig(config) {
    if (this.constructor.needsArea && !config.area && !config.entities?.length && !config.include?.length) {
      throw new Error(rcT(this.constructor.i18n, rcLang(this.constructor.i18n, this._hass, config), "err_config"));
    }
    this._config = { ...this.constructor.defaults, ...config };
    // show_title: the header's title, hidden by the stylesheet
    this.toggleAttribute?.("hide-title", config.show_title === false);
    if (!this.shadowRoot) this._attach();
    this._sig = null;
    this._render();
  }

  // The shadow root, and no rewrite of the card between a press anywhere in it and the end of the click: Home
  // Assistant updates the card several times a second, and a rewrite under the pointer replaces the element pressed,
  // so that the click lands on the card itself and does nothing (the tiles already hold it, see _bindPress; this
  // covers the rest: header button, detail button, rows, popup). The pending update is rendered once released.
  _attach() {
    const root = this.attachShadow({ mode: "open" });
    this._onPressEnd = () => {
      window.removeEventListener("pointerup", this._onPressEnd, true);
      window.removeEventListener("pointercancel", this._onPressEnd, true);
      // After the click, which comes in the same task as the release.
      setTimeout(() => {
        if (this._pressing) this._released();
      }, 0);
    };
    root.addEventListener("pointerdown", (ev) => {
      this._byPointer = true;
      if (ev.button !== 0) return;
      this._pressing = true;
      window.addEventListener("pointerup", this._onPressEnd, true);
      window.addEventListener("pointercancel", this._onPressEnd, true);
    });
    // The focus is kept across rewrites for the keyboard only (no focus ring after a mouse click or a tap).
    root.addEventListener("keydown", () => {
      this._byPointer = false;
    });
  }

  disconnectedCallback() {
    super.disconnectedCallback?.();
    window.removeEventListener("pointerup", this._onPressEnd, true);
    window.removeEventListener("pointercancel", this._onPressEnd, true);
    // A press cut short by the detach never gets its release: rendered now, and the next updates too.
    if (this._pressing) this._released();
  }

  set hass(hass) {
    this._hass = hass;
    // No re-render during a drag or a press: it would replace the tile under the finger.
    if (this._dragging || this._pressing) this._deferred = true;
    else this._render();
  }

  // The tiles actually shown (`only_on` / `only_alerts` applied), nothing when the card is hidden.
  getCardSize() {
    if (this.style.display === "none") return 0;
    const n = this._shown ?? this._items?.length ?? 0;
    if (!n || !this._config) return 1;
    // A row of large tiles (`layout: tiles`) is about one and a half rows of compact ones.
    const rows = Math.ceil(n / this._cols());
    return 1 + (this._tiles() ? Math.ceil(rows * 1.5) : rows);
  }

  getGridOptions() {
    return { columns: 12, min_columns: 6, rows: "auto" };
  }

  _lang() {
    return rcLang(this.constructor.i18n, this._hass, this._config);
  }

  _t(key, vars) {
    return rcT(this.constructor.i18n, this._lang(), key, vars);
  }

  _areaName() {
    const c = this._config;
    return c.area ? (this._hass.areas?.[c.area]?.name ?? c.area) : "";
  }

  // Re-render only when something visible changed.
  _changed(parts) {
    const sig = JSON.stringify([this._config, this._lang(), parts]);
    if (sig === this._sig) return false;
    this._sig = sig;
    return true;
  }

  // Subclasses implement `_collect()` (the tiles) and `_draw(items)`.
  _render() {
    if (!this._config || !this._hass || !this.shadowRoot) return;
    this._items = this._collect();
    this._draw(this._items);
  }

  _cols() {
    return Math.min(4, Math.max(1, Number(this._config.columns) || 2));
  }

  // `layout: tiles`: one large tile per entity, the size of Home Assistant's Tile card (easier to tap on a phone).
  _tiles() {
    return this._config?.layout === "tiles";
  }

  _paint(level, head, tiles, extraClass = "") {
    // The tile or control with the keyboard focus keeps it through the redraw (a toggle, a step or a two-tap
    // confirmation from the keyboard): tiles by their data-id, controls by their data-k.
    const active = this._byPointer ? null : this.shadowRoot.activeElement;
    const focused = active?.dataset?.id;
    const focusKey = active?.dataset?.k;
    this.shadowRoot.innerHTML = `
      <style>${RC_BASE_STYLES}${this.constructor.styles}</style>
      <ha-card class="lvl-${level}${extraClass}${this._tiles() ? " layout-tiles" : ""}">
        ${head}
        ${tiles ? `<div class="grid" style="--cols:${this._cols()}">${tiles}</div>` : ""}
        ${this._afterGrid()}
      </ha-card>`;
    const root = this.shadowRoot;
    root.querySelector(".pill.action")?.addEventListener("click", (ev) => this._allOff(ev));
    if (this._config.navigation_path) rcBindNav(root.querySelector(".head"), this._config.navigation_path);
    for (const el of root.querySelectorAll(".tile")) {
      this._bindTile(el, (this._items || []).find((i) => i.id === el.dataset.id));
      if (focused && el.dataset.id === focused) el.focus({ preventScroll: true });
    }
    this._bindAfter(root);
    if (focusKey) root.querySelector(`[data-k="${focusKey}"]`)?.focus({ preventScroll: true });
  }

  // What a card adds under its tiles (the Lights card's scenes), and its event wiring.
  _afterGrid() {
    return "";
  }

  _bindAfter() {}

  // The "turn everything off" button of the header (full card) or of the status (mini card).
  _allOff(ev) {
    ev.stopPropagation();
    const ids = (this._items || []).filter((i) => i.on).map((i) => i.id);
    if (!ids.length) return;
    // A host card may ask first (the Overview confirms before turning plugs off); otherwise off at once.
    if (this._confirmOff) this._confirmOff(ids);
    else rcCall(this._hass, "homeassistant", "turn_off", { entity_id: ids });
  }

  // Tap, hold for more-info, and an optional horizontal drag ({ move(x), end(x), step(delta), flush() }). From the
  // keyboard: Enter / Space tap, Shift+Enter or the context-menu key open the details, ←/→ step the drag by ∓/±10
  // (a held key at most every RC_REPEAT_MS), and releasing the arrow calls `flush`.
  _bindPress(el, { onTap, onHold, drag }) {
    let start = null;
    let mode = null; // null | "hold" | "drag"
    let timer = null;
    let lastStep = 0;
    el.addEventListener("pointerdown", (ev) => {
      if (ev.button !== 0) return;
      start = { x: ev.clientX, y: ev.clientY };
      mode = null;
      this._pressing = true;
      clearTimeout(timer);
      timer = setTimeout(() => {
        // The card may have been detached mid-press (nothing else clears this timer): no hold on a dead node.
        if (mode || !this.isConnected) return;
        mode = "hold";
        // The press is settled (no tap): the details may open over the tile, so its pointerup may never come.
        this._released();
        onHold();
      }, RC_HOLD_MS);
    });
    el.addEventListener("pointermove", (ev) => {
      if (!start || mode === "hold") return;
      const dx = ev.clientX - start.x;
      const dy = ev.clientY - start.y;
      if (!mode && drag && Math.abs(dx) > RC_MOVE_PX && Math.abs(dx) > Math.abs(dy)) {
        mode = "drag";
        clearTimeout(timer);
        this._dragging = true;
        el.setPointerCapture(ev.pointerId);
        el.classList.add("dragging");
      } else if (!mode && (Math.abs(dx) > RC_MOVE_PX || Math.abs(dy) > RC_MOVE_PX)) {
        clearTimeout(timer); // scrolling, or dragging what cannot be dragged: not a tap
        start = null;
        this._released();
      }
      if (mode === "drag") drag.move(ev.clientX);
    });
    const end = (ev, cancelled) => {
      clearTimeout(timer);
      if (!start) return;
      const wasDrag = mode === "drag";
      if (wasDrag) {
        this._dragging = false;
        el.classList.remove("dragging");
        if (!cancelled) drag.end(ev.clientX);
        this._sig = null;
      } else if (!mode && !cancelled) {
        onTap();
      }
      start = null;
      mode = null;
      // After a drag, the next update redraws (the bar keeps the new level until the light reports it).
      this._released(!wasDrag);
    };
    // The mouse leaving the tile mid-press (no capture outside a drag) cancels it: neither a tap nor a hold.
    el.addEventListener("pointerleave", () => {
      if (!start || mode) return;
      clearTimeout(timer);
      start = null;
      this._released();
    });
    el.addEventListener("pointerup", (ev) => end(ev, false));
    el.addEventListener("pointercancel", (ev) => end(ev, true));
    el.addEventListener("contextmenu", (ev) => ev.preventDefault());
    el.addEventListener("keydown", (ev) => {
      if ((ev.key === "Enter" && ev.shiftKey) || ev.key === "ContextMenu") {
        ev.preventDefault();
        if (!ev.repeat) onHold();
      } else if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        if (!ev.repeat) onTap();
      } else if (drag?.step && (ev.key === "ArrowLeft" || ev.key === "ArrowRight")) {
        ev.preventDefault();
        if (ev.repeat && ev.timeStamp - lastStep < RC_REPEAT_MS) return;
        lastStep = ev.timeStamp;
        drag.step(ev.key === "ArrowRight" ? 10 : -10);
      }
    });
    // The arrow released: the stepped level goes out now rather than after the pause.
    el.addEventListener("keyup", (ev) => {
      if (ev.key === "ArrowLeft" || ev.key === "ArrowRight") drag?.flush?.();
    });
  }

  // End of a press: renders now what an update brought during it.
  _released(flush = true) {
    this._pressing = false;
    if (!this._deferred || this._dragging) return;
    this._deferred = false;
    if (flush) this._render();
  }

  // Default tile: tap toggles, hold opens the details.
  _bindTile(el, item) {
    this._bindPress(el, {
      onTap: () => !item?.unavailable && rcCall(this._hass, "homeassistant", "toggle", { entity_id: el.dataset.id }),
      onHold: () => rcMoreInfo(this, el.dataset.id),
    });
  }
}

// ── Mini cards ───────────────────────────────────────────────────────────────
// A mini card shows what its full card (`Base`) shows on two lines: the room badge, title and status, then one chip
// per entity. Its zoom button (top right, `zoom: false` removes it) switches it to the full card and back; a click
// anywhere else brings it back too.
// The subclass implements `_drawMini(items)`, which builds the chips and calls `_paintMini`.
// Zoomed in, everything is shown (`only_alerts` and `hide_when_clear` only apply to the compact view). With
// `alertsOnly`, the compact view always shows only what needs a look (no `only_alerts` option then): quiet entities
// show once zoomed in.
const rcMini = (Base, tag, styles, { alertsOnly = false } = {}) =>
  class extends Base {
    static tag = tag;
    static defaults = (({ only_alerts, ...rest }) => ({ ...rest, ...(alertsOnly ? {} : { only_alerts }), zoom: true }))(
      Base.defaults,
    );
    static styles = `${Base.styles}${RC_MINI_STYLES}${styles}`;

    constructor() {
      super();
      // A click anywhere else brings the card back to its compact view.
      this._onUnzoom = (ev) => {
        if (rcOutside(this, ev)) rcUnzoom(this);
      };
    }

    connectedCallback() {
      super.connectedCallback?.();
      this._unzoom ??= watchOutside(this, this._onUnzoom);
      this._unzoom.on();
    }

    disconnectedCallback() {
      super.disconnectedCallback?.();
      this._unzoom?.off();
      // Left (another dashboard view, a conditional card hidden): back to the compact view.
      rcUnzoom(this);
    }

    getCardSize() {
      if (this._zoomed) return super.getCardSize();
      return this.style.display === "none" ? 0 : 1;
    }

    getGridOptions() {
      return { columns: 12, min_columns: 6, rows: "auto" };
    }

    _draw(items) {
      const config = this._config;
      // The base card's own filter does the work: off zoomed in, always on in an `alertsOnly` compact view.
      if (this._zoomed) this._config = { ...config, only_alerts: false, hide_when_clear: false };
      else if (alertsOnly) this._config = { ...config, only_alerts: true };
      try {
        if (this._zoomed) super._draw(items);
        else this._drawMini(items);
      } finally {
        this._config = config;
      }
      this._addZoom();
    }

    _paintMini({ level, icon, status, chips, cls = "", allOff = false }) {
      const c = this._config;
      const nav = c.navigation_path;
      // With `allOff` the status is the "turn everything off" button, like the full card's pill.
      const st = allOff
        ? `<button class="st action" title="${rcEsc(this._t("turn_all_off"))}"><ha-icon icon="mdi:power"></ha-icon><span class="pt">${rcEsc(status)}</span></button>`
        : `<span class="st" title="${rcEsc(status)}"><span class="pt">${rcEsc(status)}</span></span>`;
      this.shadowRoot.innerHTML = `
        <style>${RC_BASE_STYLES}${this.constructor.styles}</style>
        <ha-card class="lvl-${level}${cls}">
          <div class="mini">
            <div class="badge" title="${rcEsc(status)}"><ha-icon icon="${rcEsc(icon)}"></ha-icon></div>
            <div class="body">
              <div class="head${nav ? " nav" : ""}"${nav ? ' role="link" tabindex="0"' : ""}>
                <div class="title">${rcEsc(c.title || this._areaName() || this._t("title"))}</div>
                ${st}
              </div>
              <div class="rs">${chips}</div>
            </div>
          </div>
        </ha-card>`;
      const root = this.shadowRoot;
      if (nav) rcBindNav(root.querySelector(".head"), nav);
      root.querySelector(".st.action")?.addEventListener("click", (ev) => this._allOff(ev));
      for (const el of root.querySelectorAll(".r")) el.addEventListener("click", () => rcMoreInfo(this, el.dataset.id));
    }

    // Zoom button at the end of the header, top right in both views, added once per render.
    // Its click is the overviews' (rcZoomClick): stop the tap on the title (navigation_path), toggle, keep the
    // keyboard focus (Enter / Space: no click count) on the button that replaced this one.
    _addZoom() {
      const head = this._config.zoom && this.shadowRoot.querySelector(".head");
      if (!head || head.querySelector(".zoom")) return;
      const button = document.createElement("button");
      button.className = "zoom";
      button.title = this._t(this._zoomed ? "zoom_out" : "zoom_in");
      button.innerHTML = `<ha-icon icon="${rcZoomIcon(this)}"></ha-icon>`;
      button.addEventListener("click", (ev) => rcZoomClick(this, ev));
      head.appendChild(button);
    }
  };

const rcBooleans = (...names) => names.map((name) => ({ name, selector: { boolean: {} } }));

const rcAdvanced = (i18n, lang, ...names) => [
  {
    name: "advanced",
    type: "expandable",
    flatten: true,
    schema: names.map((name) =>
      name === "language"
        ? {
            name,
            selector: {
              select: {
                mode: "dropdown",
                options: [
                  { value: "", label: rcT(i18n, lang, "ed_language_auto") },
                  { value: "en", label: "English" },
                  { value: "fr", label: "Français" },
                  { value: "de", label: "Deutsch" },
                  { value: "es", label: "Español" },
                  { value: "sr", label: "Српски" },
                  { value: "sr-Latn", label: "Srpski (latinica)" },
                  { value: "it", label: "Italiano" },
                  { value: "nl", label: "Nederlands" },
                  { value: "pt", label: "Português (Portugal)" },
                  { value: "pl", label: "Polski" },
                  { value: "ro", label: "Română" },
                  { value: "da", label: "Dansk" },
                  { value: "sv", label: "Svenska" },
                  { value: "bg", label: "Български" },
                  { value: "ru", label: "Русский" },
                  { value: "uk", label: "Українська" },
                  { value: "hu", label: "Magyar" },
                  { value: "sk", label: "Slovenčina" },
                  { value: "cs", label: "Čeština" },
                  { value: "sl", label: "Slovenščina" },
                  { value: "lv", label: "Latviešu" },
                  { value: "el", label: "Ελληνικά" },
                ],
              },
            },
          }
        : { name, selector: { object: {} } },
    ),
  },
];
// `schema(lang, hass, config)` lists the fields; options left at the card's default are not written to the YAML
// (list defaults such as `exclude: []` are not shown in the form: an empty list is never written anyway).
// `autos` maps an option to its default worked out from the config (`(hass, config) => value`): shown in the form
// while unset, and kept out of the YAML when left at it.
// Entity lists the form edits with an entity picker (ids only): an item written `{ entity, name, icon }` in YAML shows as its entity,
// and gets its name and icon back when the form changes the list (ha-room-card#77).
const RC_ENTITY_LISTS = ["include"];
const rcListIds = (list) => (Array.isArray(list) ? list.map((e) => (typeof e === "string" ? e : e?.entity)).filter(Boolean) : list);
const rcListKeep = (ids, before) =>
  Array.isArray(ids) ? ids.map((id) => (Array.isArray(before) ? before.find((e) => typeof e === "object" && e?.entity === id) : undefined) ?? id) : ids;

const rcEditor = ({ card, helpers, schema, autos = {} }) => {
  const i18n = card.i18n;
  const defaults = { show_title: true, ...Object.fromEntries(Object.entries(card.defaults).filter(([, v]) => !Array.isArray(v))) };
  return class extends HTMLElement {
    setConfig(config) {
      this._config = config;
      this._update();
    }

    set hass(hass) {
      this._hass = hass;
      this._update();
    }

    _update() {
      if (!this._hass || !this._config) return;
      const lang = rcLang(i18n, this._hass, this._config);
      // Read by the label and helper callbacks, set once on the form: a language change must reach them too.
      this._lang = lang;
      if (!this._form) {
        this._form = document.createElement("ha-form");
        this._form.computeLabel = (s) => rcT(i18n, this._lang, `ed_${s.name}`);
        this._form.computeHelper = (s) =>
          helpers.includes(s.name) ? rcT(i18n, this._lang, `ed_${s.name}_helper`) : undefined;
        this._form.addEventListener("value-changed", (ev) => {
          const config = { ...ev.detail.value };
          for (const k of RC_ENTITY_LISTS) if (k in config) config[k] = rcListKeep(config[k], this._config[k]);
          for (const k of Object.keys(config)) {
            const v = config[k];
            if (v === "" || v == null || (Array.isArray(v) && !v.length) || defaults[k] === v) delete config[k];
          }
          for (const [k, auto] of Object.entries(autos)) {
            const untouched = this._config[k] === undefined && config[k] === auto(this._hass, this._config);
            if (untouched || config[k] === auto(this._hass, config)) delete config[k];
          }
          this.dispatchEvent(new CustomEvent("config-changed", { detail: { config }, bubbles: true, composed: true }));
        });
        this.appendChild(this._form);
      }
      this._form.hass = this._hass;
      // A new data or schema object re-renders the whole form, and the schema runs the card's discovery:
      // both only change with the config, the language or the registries.
      const memo = (this._memo ||= {});
      const h = this._hass;
      this._form.data = rcMemo(memo, "data", [this._config, h.areas], () => {
        const data = { ...defaults, ...this._config };
        for (const k of RC_ENTITY_LISTS) if (k in data) data[k] = rcListIds(data[k]);
        for (const [k, auto] of Object.entries(autos)) data[k] ??= auto(h, this._config);
        return data;
      });
      this._form.schema = rcMemo(memo, "schema", [lang, this._config, h.entities, h.devices, h.areas], () =>
        schema(lang, h, this._config),
      );
    }
  };
};

const rcRegister = (card, editor, name, description) => {
  if (customElements.get(card.tag)) return;
  pickerDefine(card.tag, card);
  pickerDefine(`${card.tag}-editor`, editor);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: card.tag,
    name,
    description,
    preview: true,
    documentationURL: "https://github.com/juju35/ha-media-server-card",
  });
};

if (!customElements.get("media-server-card")) {
  console.info(`%c HA-MEDIA-SERVER-CARD %c v${RC_VERSION} `, "background:#ae3ec9;color:#fff;font-weight:700", "");
}

// ── Common styles ────────────────────────────────────────────────────────────
const RC_BASE_STYLES = `
  :host {
    --rc-ok: var(--success-color, #43a047);
    --rc-warn: var(--warning-color, #ffa600);
    --rc-alert: var(--error-color, #db4437);
    --rc-info: var(--info-color, #039be5);
    --rc-light: var(--state-light-active-color, #ffb300);
    --rc-plug: var(--state-switch-on-color, var(--primary-color, #03a9f4));
    --rc-idle: var(--secondary-text-color, #9e9e9e);
    --rc-na: var(--disabled-color, #9e9e9e);
    display: block;
    min-width: 0;
  }
  /* The card answers its own width (container queries). That containment drops its content from its natural width: in
     a wrapper sized by its content (inline-block, a grid's auto column, a flex row: layout-card, button-card…) it would
     shrink to its padding. The empty grid below (no height) gives the host a natural width of 344 px there, as a
     preferred width only: its column is minmax(0, …), so the card still shrinks to its column in a grid card, a
     horizontal stack or a 1fr column, even wrapped in a <div> (hui-card in layout-card). contain-intrinsic-inline-size
     or a min-width in px would be a minimum there, and the card would overflow. */
  :host::before { content: ""; display: grid; grid-template-columns: minmax(0, 344px); height: 0; }
  ha-card { padding: 12px; overflow: hidden; container-type: inline-size; }
  ha-card.lvl-alert { box-shadow: 0 0 0 1px color-mix(in srgb, var(--rc-alert) 45%, transparent), var(--ha-card-box-shadow, none); }

  .head { display: flex; align-items: center; gap: 10px; }
  .head.nav { cursor: pointer; }
  .head.nav:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 2px; border-radius: 4px; }
  .badge { flex: none; width: 40px; height: 40px; border-radius: 50%; display: grid; place-items: center;
           background: color-mix(in srgb, var(--c) 16%, transparent); color: var(--c); }
  .badge ha-icon { --mdc-icon-size: 24px; }
  .lvl-alert .badge { animation: rc-pulse 1.6s ease-in-out infinite; }
  /* Narrow header: the title keeps a few letters (never 0 px), the status pill shrinks and ellipsises, the icon buttons
     (zoom, power) never shrink; under 200 px the pill is only its coloured dot, its text kept for screen readers. */
  .title { flex: 1 1 0; min-width: 5ch; font-size: 16px; font-weight: 500; color: var(--primary-text-color);
           white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
           /* show_title: false keeps the title's room (the pill and buttons stay in place) */
  :host([hide-title]) .head > .title { visibility: hidden; }
  .pill { all: unset; flex: 0 1 auto; min-width: 0; box-sizing: border-box; position: relative;
          display: inline-flex; align-items: center; gap: 3px; font-size: 11px; font-weight: 500;
          padding: 1px 8px; border-radius: 999px; background: color-mix(in srgb, var(--c) 14%, transparent);
          /* Coloured text is half the accent, half the text colour: 4.5:1 on its tint in light and dark themes, where
             the bare accent (amber above all) is not. */
          color: color-mix(in srgb, var(--c) 50%, var(--primary-text-color, #212121)); }
  .pt { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .pill ha-icon { flex: none; }
  /* A card this narrow (6 columns of the Sections view on a phone): the title is at its few letters already, so the
     status pill goes to a line of its own under it, where its whole label fits, rather than end with "…". */
  @container (max-width: 260px) {
    .head { flex-wrap: wrap; row-gap: 4px; }
    .head::after { content: ""; order: 1; flex: 1 0 100%; }
    .head > .pill { order: 2; margin-left: 50px; max-width: calc(100% - 50px); }
  }
  @container (max-width: 200px) {
    /* Under 200 px the pill is only its dot again: back on the title's line. */
    .head { flex-wrap: nowrap; }
    .head::after { content: none; }
    .head > .pill { order: 0; margin-left: 0; max-width: none; }
    .head > .pill .pt, .st .pt { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
    .head > .pill:not(.action), .st { flex: none; padding: 0; width: 18px; height: 18px; justify-content: center; background: none; }
    .head > .pill:not(.action)::before, .st::before { content: ""; width: 8px; height: 8px; border-radius: 50%; background: var(--c); }
    .head > .pill.action { padding: 1px 4px; }
    /* A full card this narrow (6 columns of the Sections view on a phone): a smaller badge, no side chip in the header. */
    .head { gap: 6px; }
    .head > .badge { width: 32px; height: 32px; }
    .head > .badge ha-icon { --mdc-icon-size: 20px; }
    .head > .chip { display: none; }
  }
  .pill.action { cursor: pointer; }
  .pill.action:hover { background: color-mix(in srgb, var(--c) 24%, transparent); }
  .pill.action:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 2px; }
  .pill ha-icon { --mdc-icon-size: 12px; margin-left: -2px; }

  .grid { display: grid; grid-template-columns: repeat(var(--cols), minmax(0, 1fr)); gap: 6px; margin-top: 8px; }
  .tile { all: unset; position: relative; overflow: hidden; box-sizing: border-box; cursor: pointer; min-width: 0;
          display: flex; align-items: center; gap: 8px; padding: 5px 8px 5px 5px; border-radius: 10px;
          touch-action: pan-y; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none;
          background: color-mix(in srgb, var(--t) 9%, var(--secondary-background-color, transparent));
          border: 1px solid color-mix(in srgb, var(--t) 22%, transparent); transition: background .2s, border-color .2s; }
  .tile.off, .tile.na { background: var(--secondary-background-color, transparent); border-color: transparent; }
  .tile.na { --t: var(--rc-na); opacity: .7; }
  .tile:hover { background: color-mix(in srgb, var(--t) 15%, var(--secondary-background-color, transparent)); }
  .tile:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 2px; }
  .ic, .txt { position: relative; }
  .ic { flex: none; width: 28px; height: 28px; border-radius: 50%; display: grid; place-items: center;
        color: var(--t); background: color-mix(in srgb, var(--t) 20%, transparent); }
  .ic ha-icon { --mdc-icon-size: 16px; }
  .txt { display: flex; flex-direction: column; min-width: 0; }
  .name { font-size: 13px; font-weight: 500; line-height: 1.2; color: var(--primary-text-color);
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  /* A reading is never cut: on a narrow tile it goes on to a second line (the name, a label, keeps its ellipsis). */
  .state { font-size: 11px; line-height: 1.2; color: var(--secondary-text-color); overflow-wrap: break-word; }
  /* A card this narrow (a phone, 6 columns of the Sections view): one tile per row, whatever the columns option. */
  @container (max-width: 260px) { .grid { grid-template-columns: minmax(0, 1fr); } }
  /* layout: tiles — the size of Home Assistant's Tile card — 56 px high, a 40 px icon, the name over the state. */
  .layout-tiles .grid { gap: 8px; }
  .layout-tiles .tile { min-height: 56px; gap: 10px; padding: 8px 10px 8px 8px; border-radius: 12px; }
  .layout-tiles .ic { width: 40px; height: 40px; }
  .layout-tiles .ic ha-icon { --mdc-icon-size: 24px; }
  .layout-tiles .txt { gap: 2px; }
  .layout-tiles .name { font-size: 14px; line-height: 1.25; }
  .layout-tiles .state { font-size: 12px; line-height: 1.25; }

  @keyframes rc-blink { 0%, 100% { opacity: 1 } 50% { opacity: .35 } }
  @keyframes rc-pulse { 0%, 100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--c) 45%, transparent) }
                        50% { box-shadow: 0 0 0 7px transparent } }
  @media (prefers-reduced-motion: reduce) { .tile, .lvl-alert .badge { animation: none; transition: none; } }
`;

// Mini cards: layout, chips and zoom button. A chip is plain (icon and text) until it needs a look: then a tinted pill.
// The zoom / detail button of the mini cards and the overviews.
const RC_ZOOM_STYLES = `
  /* 40 px to tap, laid out as the 24 px it looks (the negative margins). */
  .zoom { all: unset; flex: none; cursor: pointer; width: 40px; height: 40px; margin: -12px -12px -12px -8px; border-radius: 50%;
          display: grid; place-items: center; color: var(--secondary-text-color); }
  .zoom ha-icon { --mdc-icon-size: 16px; }
  .zoom:hover { background: color-mix(in srgb, var(--rc-idle) 16%, transparent); color: var(--primary-text-color); }
  .zoom:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 1px; }
`;

const RC_MINI_STYLES = `${RC_ZOOM_STYLES}
  /* The badge sits 12px from the card's top-left corner, like the other ha-* cards, beside the title and the readings. */
  ha-card:has(.mini) { padding: 12px; }
  .mini { display: flex; align-items: flex-start; gap: 10px; }
  /* The badge keeps the full card's size (40 px, icon 24 px): the body is at least as tall, a lone title line centred
     beside it. */
  .body { flex: 1; min-width: 0; min-height: 40px; display: flex; flex-direction: column; justify-content: center; gap: 4px; }
  .mini .head { gap: 8px; }
  .mini .title { line-height: 1.25; }
  .st { flex: 0 1 auto; min-width: 0; position: relative; display: inline-flex; align-items: center;
        margin-left: auto; font-size: 11px; font-weight: 500; color: var(--c); }
  .rs { display: flex; flex-wrap: wrap; gap: 2px 4px; margin-left: -4px; }
  .rs:empty { display: none; }
  /* A chip never runs past the card: a long name ends with an ellipsis. */
  .r { all: unset; cursor: pointer; display: inline-flex; align-items: baseline; gap: 1px; padding: 0 5px 0 4px;
       box-sizing: border-box; min-width: 0; max-width: 100%; overflow: hidden;
       border-radius: 999px; font-size: 12px; font-weight: 500; line-height: 24px; white-space: nowrap; --t: var(--rc-ok);
       color: var(--primary-text-color); }
  .r ha-icon { --mdc-icon-size: 13px; flex: none; color: var(--t); align-self: center; margin-right: 2px; }
  .r > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
  .r.pill { color: color-mix(in srgb, var(--t) 50%, var(--primary-text-color, #212121)); background: color-mix(in srgb, var(--t) 14%, transparent); }
  .r:hover { background: color-mix(in srgb, var(--t) 20%, var(--secondary-background-color, transparent)); }
  .r:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 2px; }
`;
