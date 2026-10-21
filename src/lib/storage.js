let database;
function openDB() {
  if (!database)
    database = new Promise((resolve, reject) => {
      const request = indexedDB.open("yincrate", 1);
      request.onupgradeneeded = () =>
        request.result.createObjectStore("history", { keyPath: "id" });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    }).catch((error) => {
      database = undefined;
      throw error;
    });
  return database;
}
async function transaction(mode, action) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("history", mode);
    const request = action(tx.objectStore("history"));
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("存储操作未完成"));
  });
}
export async function getHistory() {
  const records = await transaction("readonly", (store) => store.getAll());
  return records.sort((a, b) => b.createdAt - a.createdAt);
}
export const saveHistory = (record) =>
  transaction("readwrite", (store) => store.put(record));
export const removeHistory = (id) =>
  transaction("readwrite", (store) => store.delete(id));
export const clearHistory = () =>
  transaction("readwrite", (store) => store.clear());

export async function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  try {
    if (globalThis.chrome?.downloads?.download) {
      await chrome.downloads.download({
        url,
        filename: `YinCrate/${name}`,
        conflictAction: "uniquify",
        saveAs: false,
      });
    } else {
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = name;
      anchor.click();
    }
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}
