# ha-media-server-card

[![Marketplace](https://img.shields.io/badge/Marketplace-Custom-41BDF5.svg)](https://www.home-assistant.io/integrations/marketplace/)
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

> [!NOTE]
> This card is being designed: there is no release yet. Watch the repository to know when the first version is out.

| Card | Type | What it shows |
|---|---|---|
| Media server | `custom:media-server-card` | What is playing on the server, the upcoming episodes and films, the download queue and the requests. |
| Media server mini | `custom:media-server-mini-card` | Streams now and the next release on two lines, with a zoom to the full card. |

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

## License

[MIT](https://github.com/juju35/ha-media-server-card/blob/main/LICENSE)

## Support

If you find this project useful, you can support its development:

<a href="https://buymeacoffee.com/julienstep9"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me a Coffee" height="50"></a>
