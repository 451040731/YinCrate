import { unwrapNcm } from "./ncm.js";
self.onmessage = ({ data }) => {
  try {
    const result = unwrapNcm(data);
    self.postMessage({ result }, [result.audio.buffer, result.cover.buffer]);
  } catch (error) {
    self.postMessage({ error: error.message });
  }
};
