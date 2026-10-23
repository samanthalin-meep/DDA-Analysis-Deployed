let db: Promise<IDBDatabase>;
function database() {
  return (db ??= new Promise((resolve, reject) => {
    const q = indexedDB.open("ddalab-pages", 1);
    q.onupgradeneeded = () => q.result.createObjectStore("items");
    q.onsuccess = () => resolve(q.result);
    q.onerror = () => reject(q.error);
  }));
}
export async function saved<T>(key: string): Promise<T | undefined> {
  const d = await database();
  return new Promise((resolve, reject) => {
    const q = d.transaction("items").objectStore("items").get(key);
    q.onsuccess = () => resolve(q.result);
    q.onerror = () => reject(q.error);
  });
}
export async function save(key: string, value: unknown) {
  const d = await database();
  return new Promise<void>((resolve, reject) => {
    const tx = d.transaction("items", "readwrite");
    tx.objectStore("items").put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
export function download(
  name: string,
  text: string | Blob,
  type = "text/plain",
) {
  const url = URL.createObjectURL(
    text instanceof Blob ? text : new Blob([text], { type }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
