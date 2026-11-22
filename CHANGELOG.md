# Changelog

## 1.0.1 - 2026-11-22

### Performance
- Card picker: the cards no longer ask Home Assistant for a live preview (`preview: false` in `window.customCards`). The picker drew every card at once (history requests, animations), which made the list slow to open; it now shows each card's description instead.

## 1.0.0 - 2026-11-22

### Features
- First release: `media-server-card` and `media-server-mini-card`. Four counters (streams, coming up, downloading, requests) that open their list in tabs, what is playing on each session with its progress, and the download queue with the free disk space; an illustrated living room whose television plays while something streams. Jellyfin, Plex and Emby sessions, Tautulli, Sonarr, Radarr, Lidarr and Seerr (Overseerr), the lists from their actions.
