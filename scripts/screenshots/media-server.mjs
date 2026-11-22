// Renders the media server cards with a mock server and saves the README screenshots.
// Usage: npm install && npm run build && node scripts/screenshots/media-server.mjs
import { pair, shoot } from "./harness.mjs";
import { pageScript, setup } from "./mock.mjs";

// Stills: animations: false stops the television's picture, so a capture only changes when the card does.
const still = (file, s) => pair(file, { ...s, config: { animations: false, ...s.config } });
const ws = pageScript();
await shoot({
  prefix: "ms",
  tag: "media-server-card",
  shots: [
    ...still("playing", { scene: "playing" }),
    ...still("coming", { scene: "playing", open: ".cn.c-coming" }),
    ...still("queue", { scene: "downloading", open: ".cn.c-queue" }),
    ...still("requests", { scene: "playing", open: ".cn.c-requests" }),
    ...still("downloading", { scene: "downloading" }),
    ...still("idle", { scene: "idle" }),
    ...still("narrow", { scene: "playing", width: 300 }),
  ],
  setup,
  ws,
});
await shoot({ prefix: "ms-mini", tag: "media-server-mini-card", shots: [...still("playing", { scene: "playing" }), ...still("zoom", { scene: "playing", open: ".zoom" })], setup, ws });
