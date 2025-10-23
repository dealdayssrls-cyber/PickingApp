const { contextBridge, ipcRenderer } = require('electron');

// Espone TUTTE le funzioni necessarie all'HTML
contextBridge.exposeInMainWorld('electronAPI', {
    // Funzioni per i pulsanti
    selezionaFileOrdine: () => ipcRenderer.invoke('seleziona-file-ordine'),
    aggiornaInventario: () => ipcRenderer.invoke('aggiorna-inventario'),
    apriCartellaDDT: () => ipcRenderer.invoke('apri-cartella-ddt'),
    getCurrentOrderName: () => ipcRenderer.invoke('get-current-order-name'),
    creaDDT: (datiDDT, nomeFileOriginale, filePathOrdineOriginale) => {
        return ipcRenderer.invoke('crea-ddt', datiDDT, nomeFileOriginale, filePathOrdineOriginale);
    },
    
    // Funzioni per gestione inventario
    caricaInventario: () => ipcRenderer.invoke('carica-inventario'),
    aggiornaInventarioConfronto: () => ipcRenderer.invoke('aggiorna-inventario-confronto'),
    salvaInventario: (inventario) => ipcRenderer.invoke('salva-inventario', inventario),
    salvaInventarioForzato: (inventario) => ipcRenderer.invoke('salva-inventario-forzato', inventario),
    esportaInventario: () => ipcRenderer.invoke('esporta-inventario'),
    
    // Event listeners
    onOrdineCaricato: (callback) => ipcRenderer.on('ordine-caricato', callback),
    onInventarioCaricato: (callback) => ipcRenderer.on('inventario-caricato', callback),
    onRichiediConfermaCampo: (callback) => ipcRenderer.on('richiedi-conferma-campo', callback),
    onAggiornamentoCompletato: (callback) => ipcRenderer.on('aggiornamento-completato', callback),
    
    // Invio risposte
    inviaConfermaCampo: (response) => ipcRenderer.send('conferma-campo-risposta', response),
    
    // Rimuovi listeners (cleanup)
    removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel)
});