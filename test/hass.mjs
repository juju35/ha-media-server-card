// The mock server of the screenshots (scripts/screenshots/mock.mjs), with callWS answering in Node and the calls
// recorded.
import { answer, NOW, setup } from "../scripts/screenshots/mock.mjs";

export { NOW };

export const makeHass = (scene = "playing", { ws = true, ...overrides } = {}) => {
  const { hass } = setup({ scene });
  const h = { ...hass, themes: { darkMode: false }, ws: [], calls: [], ...overrides };
  h.callService = (domain, service, data) => h.calls.push([domain, service, data]);
  if (ws)
    h.callWS = async (msg) => {
      h.ws.push(msg);
      return answer.call(h, msg);
    };
  return h;
};
