# ha-media-server-card

[![Marketplace](https://img.shields.io/badge/Marketplace-Custom-41BDF5.svg)](https://www.home-assistant.io/integrations/marketplace/)
[![HACS Validation](https://github.com/juju35/ha-media-server-card/actions/workflows/hacs.yml/badge.svg)](https://github.com/juju35/ha-media-server-card/actions/workflows/hacs.yml)
[![Validate](https://github.com/juju35/ha-media-server-card/actions/workflows/validate.yml/badge.svg)](https://github.com/juju35/ha-media-server-card/actions/workflows/validate.yml)
[![Lint](https://github.com/juju35/ha-media-server-card/actions/workflows/lint.yml/badge.svg)](https://github.com/juju35/ha-media-server-card/actions/workflows/lint.yml)
[![Release](https://img.shields.io/github/v/release/juju35/ha-media-server-card)](https://github.com/juju35/ha-media-server-card/releases/latest)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/juju35/ha-media-server-card/blob/main/LICENSE)
[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-FFDD00?logo=buymeacoffee&logoColor=black)](https://buymeacoffee.com/julienstep9)

<p align="center"><img src="https://raw.githubusercontent.com/juju35/ha-media-server-card/main/images/icon.svg" alt="Media Server Card" width="120"></p>

<p align="center">
  <img src="https://raw.githubusercontent.com/juju35/ha-media-server-card/main/images/jellyfin.png" alt="Jellyfin" height="24">&nbsp;&nbsp;
  <img src="https://raw.githubusercontent.com/juju35/ha-media-server-card/main/images/plex.png" alt="Plex" height="24">&nbsp;&nbsp;
  <img src="https://raw.githubusercontent.com/juju35/ha-media-server-card/main/images/emby.png" alt="Emby" height="24">&nbsp;&nbsp;
  <img src="https://raw.githubusercontent.com/juju35/ha-media-server-card/main/images/tautulli.png" alt="Tautulli" height="24">&nbsp;&nbsp;
  <img src="https://raw.githubusercontent.com/juju35/ha-media-server-card/main/images/sonarr.png" alt="Sonarr" height="36">&nbsp;&nbsp;
  <img src="https://raw.githubusercontent.com/juju35/ha-media-server-card/main/images/radarr.png" alt="Radarr" height="36">&nbsp;&nbsp;
  <img src="https://raw.githubusercontent.com/juju35/ha-media-server-card/main/images/lidarr.png" alt="Lidarr" height="36">&nbsp;&nbsp;
  <img src="https://raw.githubusercontent.com/juju35/ha-media-server-card/main/images/overseerr.png" alt="Seerr" height="24">
</p>

A Lovelace card for **your media server**: what is playing and for whom, the upcoming episodes and films, the download queue and the pending requests.

[![Open your Home Assistant instance and open a repository inside the Marketplace.](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/marketplace_repository/?owner=juju35&repository=ha-media-server-card&category=plugin)

| Card | Type | What it shows |
|---|---|---|
| [Media server](#screenshots) | `custom:media-server-card` | Four counters that open their list, what is playing on each session, and the download queue. |
| [Media server mini](#media-server-mini) | `custom:media-server-mini-card` | Streams now and the next release on two lines, with a zoom to the full card. |

| Playing | Coming up |
|---|---|
| <img src="https://raw.githubusercontent.com/juju35/ha-media-server-card/main/screenshots/ms-playing.png" alt="Playing" width="400"> | <img src="https://raw.githubusercontent.com/juju35/ha-media-server-card/main/screenshots/ms-coming.png" alt="Coming up" width="400"> |

## Features

- **Four counters**: streams (with the bandwidth and the transcodes, from Tautulli), coming up (with the next one), downloading and the pending requests; a tap on a counter opens its list, in tabs (Streams, Coming up, Downloading, Requests), and a second tap or the cross brings the overview back
- **Now playing**: each session of Jellyfin, Plex or Emby, the series, season and episode or the film, the device, paused or not, and how far it is; a tap opens the player's details
- **Queue**: the downloads of Sonarr, Radarr and Lidarr with their progress, the furthest first, and the free disk space
- **Coming up**: the next episodes, films and albums, by day and time; **requests**: Seerr's pending requests with who asked
- **Illustrated header**: a living room whose television shows a picture that breathes while something plays and goes dark when idle; the dark theme dims the room and lights the lamp
- **Mini card**: the state as the pill (what plays), the next episode or film as a chip; its zoom button opens the full card in place
- Abstract thumbnails coloured from each title, never the artwork; visual editor for both cards, light and dark themes, 22 languages, no external dependency

## Supported integrations

The card reads the sensors and actions of these integrations:

| | Integration | What the cards show |
|:---:|---|---|
| <img src="https://raw.githubusercontent.com/juju35/ha-media-server-card/main/images/jellyfin.png" alt="Jellyfin" height="16"> | [Jellyfin](https://www.home-assistant.io/integrations/jellyfin/) (built in) | Sessions and what is playing |
| <img src="https://raw.githubusercontent.com/juju35/ha-media-server-card/main/images/plex.png" alt="Plex" height="16"> | [Plex](https://www.home-assistant.io/integrations/plex/) (built in) | Sessions and what is playing |
| <img src="https://raw.githubusercontent.com/juju35/ha-media-server-card/main/images/emby.png" alt="Emby" height="16"> | [Emby](https://www.home-assistant.io/integrations/emby/) (built in) | Sessions and what is playing |
| <img src="https://raw.githubusercontent.com/juju35/ha-media-server-card/main/images/tautulli.png" alt="Tautulli" height="16"> | [Tautulli](https://www.home-assistant.io/integrations/tautulli/) (built in) | Plex streams and bandwidth |
| <img src="https://raw.githubusercontent.com/juju35/ha-media-server-card/main/images/sonarr.png" alt="Sonarr" height="24"> | [Sonarr](https://www.home-assistant.io/integrations/sonarr/) (built in) | Upcoming episodes, queue and missing |
| <img src="https://raw.githubusercontent.com/juju35/ha-media-server-card/main/images/radarr.png" alt="Radarr" height="24"> | [Radarr](https://www.home-assistant.io/integrations/radarr/) (built in) | Upcoming films and queue |
| <img src="https://raw.githubusercontent.com/juju35/ha-media-server-card/main/images/lidarr.png" alt="Lidarr" height="24"> | [Lidarr](https://www.home-assistant.io/integrations/lidarr/) (built in) | Upcoming albums and queue |
| <img src="https://raw.githubusercontent.com/juju35/ha-media-server-card/main/images/overseerr.png" alt="Seerr" height="16"> | [Seerr](https://www.home-assistant.io/integrations/overseerr/) (built in) | Pending, approved and available requests (Overseerr, Jellyseerr) |

## Installation

### Via the Marketplace (recommended)

Click the button below to add the repository directly:

[![Add to the Marketplace](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/marketplace_repository/?owner=juju35&repository=ha-media-server-card&category=plugin)

Or manually:

1. Open **Settings → Marketplace → Add from link** (top right; this needs a GitHub account connected)
2. Add `https://github.com/juju35/ha-media-server-card` — Type: **Dashboard**
3. Open **Media Server Card** and click **Install**
4. Clear your browser cache and refresh

The Marketplace registers the dashboard resource for you.

### Manual

1. Download `ha-media-server-card.js` and the `ha-media-server-card.i18n.*.js` translation files from the [latest release](https://github.com/juju35/ha-media-server-card/releases/latest)
2. Copy them all to `/config/www/` (without the translation files, the cards show in English)
3. Go to **Settings → Dashboards → Resources** → Add resource:
   - URL: `/local/ha-media-server-card.js`
   - Type: **JavaScript Module**
4. Clear your browser cache and refresh

## Configuration

Every option is in the visual editor. In YAML:

```yaml
type: custom:media-server-card

# Only the living room's players, longer lists, no requests
type: custom:media-server-card
players:
  - media_player.living_room_tv
  - media_player.bedroom_tablet
max_items: 8
show_requests: false

# Two lines on a phone dashboard
type: custom:media-server-mini-card

# A role the discovery missed
type: custom:media-server-card
entities:
  queue:
    - sensor.sonarr_queue
    - sensor.radarr_queue
```

| Option | Type | Default | Description |
|---|---|---|---|
| `title` | string | `Media server` | Both: card title |
| `show_title` | boolean | `true` | Both: show the title |
| `show_subtitle` | boolean | `true` | Both: the integrations found, under the title |
| `navigation_path` | string | | Both: a tap on the header opens this dashboard path |
| `players` | list | every session player found | The media players of the server's sessions (Jellyfin, Plex, Emby) |
| `max_items` | number | `4` | Items per list, 1 to 20 |
| `show_requests` | boolean | `true` | The requests counter and tab |
| `illustration` | boolean | `true` | Both: the illustrated header (`false`: the classic header) |
| `illustration_theme` | string | `auto` | Both: `auto` (follows the Home Assistant theme: night with a dark theme, day with a light theme), `day` or `night` |
| `animations` | boolean | `true` | Both: the television's picture while something plays |
| `zoom` | boolean | `true` | Mini card: the zoom button |
| `entities` | map | | Advanced (YAML only): the sensors of a role, over the discovery — `watching`, `transcoding`, `bandwidth`, `upcoming`, `queue`, `wanted`, `diskspace`, `requests` (one id or a list) |
| `language` | string | Home Assistant's | Advanced: one of the [languages](#translations) |

## Screenshots

| Playing | Coming up | Downloading (queue tab) |
|---|---|---|
| <img src="https://raw.githubusercontent.com/juju35/ha-media-server-card/main/screenshots/ms-playing.png" alt="Playing" width="400"> | <img src="https://raw.githubusercontent.com/juju35/ha-media-server-card/main/screenshots/ms-coming.png" alt="Coming up" width="400"> | <img src="https://raw.githubusercontent.com/juju35/ha-media-server-card/main/screenshots/ms-queue.png" alt="Queue" width="400"> |
| <img src="https://raw.githubusercontent.com/juju35/ha-media-server-card/main/screenshots/ms-playing-dark.png" alt="Playing, dark" width="400"> | <img src="https://raw.githubusercontent.com/juju35/ha-media-server-card/main/screenshots/ms-coming-dark.png" alt="Coming up, dark" width="400"> | <img src="https://raw.githubusercontent.com/juju35/ha-media-server-card/main/screenshots/ms-queue-dark.png" alt="Queue, dark" width="400"> |

| Requests | Downloading | Idle |
|---|---|---|
| <img src="https://raw.githubusercontent.com/juju35/ha-media-server-card/main/screenshots/ms-requests.png" alt="Requests" width="400"> | <img src="https://raw.githubusercontent.com/juju35/ha-media-server-card/main/screenshots/ms-downloading.png" alt="Downloading" width="400"> | <img src="https://raw.githubusercontent.com/juju35/ha-media-server-card/main/screenshots/ms-idle.png" alt="Idle" width="400"> |
| <img src="https://raw.githubusercontent.com/juju35/ha-media-server-card/main/screenshots/ms-requests-dark.png" alt="Requests, dark" width="400"> | <img src="https://raw.githubusercontent.com/juju35/ha-media-server-card/main/screenshots/ms-downloading-dark.png" alt="Downloading, dark" width="400"> | <img src="https://raw.githubusercontent.com/juju35/ha-media-server-card/main/screenshots/ms-idle-dark.png" alt="Idle, dark" width="400"> |

| Narrow | Dark |
|---|---|
| <img src="https://raw.githubusercontent.com/juju35/ha-media-server-card/main/screenshots/ms-narrow.png" alt="Narrow" width="300"> | <img src="https://raw.githubusercontent.com/juju35/ha-media-server-card/main/screenshots/ms-narrow-dark.png" alt="Narrow, dark" width="300"> |

**Playing animation**: the television's picture breathes while something plays (still with `animations: false`, or when the system asks for reduced motion).

| Light | Dark |
|---|---|
| <img src="https://raw.githubusercontent.com/juju35/ha-media-server-card/main/screenshots/ms-playing.gif" alt="Playing animation" width="400"> | <img src="https://raw.githubusercontent.com/juju35/ha-media-server-card/main/screenshots/ms-playing-dark.gif" alt="Playing animation, dark" width="400"> |

### Media server mini

| Playing | Zoomed in |
|---|---|
| <img src="https://raw.githubusercontent.com/juju35/ha-media-server-card/main/screenshots/ms-mini-playing.png" alt="Mini, playing" width="320"> | <img src="https://raw.githubusercontent.com/juju35/ha-media-server-card/main/screenshots/ms-mini-zoom.png" alt="Mini, zoomed in" width="400"> |
| <img src="https://raw.githubusercontent.com/juju35/ha-media-server-card/main/screenshots/ms-mini-playing-dark.png" alt="Mini, playing, dark" width="320"> | <img src="https://raw.githubusercontent.com/juju35/ha-media-server-card/main/screenshots/ms-mini-zoom-dark.png" alt="Mini, zoomed in, dark" width="400"> |

| Playing animation | Dark |
|---|---|
| <img src="https://raw.githubusercontent.com/juju35/ha-media-server-card/main/screenshots/ms-mini-playing.gif" alt="Mini, playing animation" width="320"> | <img src="https://raw.githubusercontent.com/juju35/ha-media-server-card/main/screenshots/ms-mini-playing-dark.gif" alt="Mini, playing animation, dark" width="320"> |

## How it works

- **Sessions**: the `media_player` entities of Jellyfin, Plex and Emby (or `players`) that are playing or paused: their media title, series, season and episode, position and duration
- **Counts**, by platform and translation key or entity id: Tautulli's watching, transcode and total bandwidth sensors; the upcoming, queue, wanted and disk space sensors of Sonarr, Radarr and Lidarr (added up); Seerr's pending requests; `entities` sets any role
- **Lists**: the integrations' actions, when Home Assistant has them — `sonarr.get_upcoming`, `radarr.get_upcoming`, `lidarr.get_upcoming`, `sonarr.get_queue`, `radarr.get_queue`, `lidarr.get_queue`, `overseerr.get_requests` — called with `return_response` and the integration's config entry (read from the entity registry); fetched at first, every 5 minutes and when a count changes. Without them, the counters show the sensors' counts and the lists a hint
- **Read only**: the card calls no action that changes anything

## Development

```bash
npm install
npm run build        # stamps the version of package.json into dist/ha-media-server-card.js
npm run check        # builds and checks the bundle (run in CI)
npm test             # unit tests
npm run screenshots  # renders the cards with a mock media server into screenshots/ (and the GIFs, needs ffmpeg)
```

`dist/` is not committed: `npm run build` creates it locally, CI builds it on every push, and the release workflow attaches the built files to the release, which is where the Marketplace installs them from.

### Releasing

1. Bump `version` in `package.json`
2. Add a `## <version>` section at the top of [CHANGELOG.md](https://github.com/juju35/ha-media-server-card/blob/main/CHANGELOG.md)
3. Push to `main`: the **Release** workflow builds the card, creates the tag and the GitHub release with the changelog section as notes, and attaches `ha-media-server-card.js` and its translation files

## Translations

The card auto-detects the language from your Home Assistant settings. Currently supported:

| Language | Code |
|---|---|
| English | `en` |
| Français | `fr` |
| Deutsch | `de` |
| Español | `es` |
| Српски | `sr` |
| Srpski (latinica) | `sr-Latn` |
| Italiano | `it` |
| Nederlands | `nl` |
| Português (Portugal) | `pt` |
| Polski | `pl` |
| Română | `ro` |
| Dansk | `da` |
| Svenska | `sv` |
| Български | `bg` |
| Русский | `ru` |
| Українська | `uk` |
| Magyar | `hu` |
| Slovenčina | `sk` |
| Čeština | `cs` |
| Slovenščina | `sl` |
| Latviešu | `lv` |
| Ελληνικά | `el` |

Contributions for additional languages are welcome!

## License

[MIT](https://github.com/juju35/ha-media-server-card/blob/main/LICENSE)

## Support

If you find this project useful, you can support its development:

<a href="https://buymeacoffee.com/julienstep9"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me a Coffee" height="50"></a>
