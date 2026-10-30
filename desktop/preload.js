const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('lodgeDesktop', {
  platform: process.platform,
  defaultServerUrl: 'http://localhost:3000',
  // Nur für das Auswahlfenster der Bildschirmübertragung.
  onSources: (cb) => ipcRenderer.on('picker:sources', (_e, sources) => cb(sources)),
  choose: (choice) => ipcRenderer.send('picker:choose', choice),
});
