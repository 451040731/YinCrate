import { unwrapKugou, unwrapKwm } from "./music-containers.js";

self.onmessage = ({ data }) => {
  try {
    const result = data.format === "kwm" ? unwrapKwm(data.bytes) : unwrapKugou(data.bytes, data.keys);
    self.postMessage({ result }, [result.audio.buffer, result.cover.buffer]);
  } catch (error) {
    self.postMessage({ error: error.message });
  }
};
