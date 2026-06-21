// Utility to save and load directory handle in IndexedDB
const DB_NAME = 'ManifestHubDB';
const STORE_NAME = 'settings';
const KEY_HANDLE = 'steamDirHandle';

export async function saveDirectoryHandle(handle) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = (e) => {
      const db = e.target.result;
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(handle, KEY_HANDLE);
      tx.oncomplete = () => resolve(true);
      tx.onerror = (err) => reject(err);
    };
    request.onerror = (err) => reject(err);
  });
}

export async function loadDirectoryHandle() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = (e) => {
      const db = e.target.result;
      const tx = db.transaction(STORE_NAME, 'readonly');
      const getReq = tx.objectStore(STORE_NAME).get(KEY_HANDLE);
      getReq.onsuccess = () => resolve(getReq.result || null);
      getReq.onerror = (err) => reject(err);
    };
    request.onerror = (err) => reject(err);
  });
}

// Helper to check and request permissions for the folder handle
export async function verifyPermission(fileHandle, readWrite) {
  const options = {};
  if (readWrite) {
    options.mode = 'readwrite';
  }
  if ((await fileHandle.queryPermission(options)) === 'granted') {
    return true;
  }
  if ((await fileHandle.requestPermission(options)) === 'granted') {
    return true;
  }
  return false;
}

// Fetch and write manifest file using only appid
export async function installManifestFile(dirHandle, apikey, appid) {
  const url = `https://api.manifesthub1.filegear-sg.me/manifest?apikey=${encodeURIComponent(apikey)}&appid=${encodeURIComponent(appid)}`;
  
  // Use corsproxy.io to bypass browser CORS
  const proxyUrl = `https://corsproxy.io/?url=${encodeURIComponent(url)}`;
  
  const res = await fetch(proxyUrl);
  if (!res.ok) {
    throw new Error(`Failed to fetch manifest: HTTP ${res.status}`);
  }
  
  // Try to parse filename from Content-Disposition header
  let fileName = `appmanifest_${appid}.acf`;
  const disposition = res.headers.get('Content-Disposition');
  if (disposition && disposition.indexOf('attachment') !== -1) {
    const filenameRegex = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/;
    const matches = filenameRegex.exec(disposition);
    if (matches != null && matches[1]) { 
      fileName = matches[1].replace(/['"]/g, '');
    }
  }

  const blob = await res.blob();
  
  // Try to find or navigate to Steam/steamapps/
  let targetDir = dirHandle;
  
  try {
    // If the user selected the main Steam folder, we try to write into steamapps
    let steamappsDir;
    try {
      steamappsDir = await dirHandle.getDirectoryHandle('steamapps', { create: false });
      targetDir = steamappsDir;
    } catch {
      // If no steamapps folder, write directly to the selected directory
      targetDir = dirHandle;
    }
  } catch (e) {
    console.warn('Could not locate steamapps, writing to chosen root', e);
  }

  // Create the manifest file
  const fileHandle = await targetDir.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(blob);
  await writable.close();
  
  return { fileName, folderName: targetDir.name };
}
