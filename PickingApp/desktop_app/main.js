const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');
const express = require('express');

// CONFIGURAZIONE SICUREZZA E STABILITÀ
app.commandLine.appendSwitch('--disable-gpu-sandbox');
app.commandLine.appendSwitch('--disable-software-rasterizer');
app.commandLine.appendSwitch('--no-sandbox');

let mainWindow;
let isSelectingFile = false;
let ipcHandlersRegistered = false;
let currentOrderFileName = null;

// FUNZIONI PER LA GESTIONE DEL DATABASE
function getDatabaseDir() {
   const appPath = app.getAppPath();
    const databaseDir = path.join(path.dirname(appPath), 'database');
    console.log('📁 Database directory:', databaseDir);
    return databaseDir;
}

function getDatabasePath() {
    return path.join(getDatabaseDir(), 'inventario.json');
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: true,
      allowRunningInsecureContent: false,
      offscreen: false,
      backgroundThrottling: false
    },
    show: false,
    backgroundColor: '#ffffff',
    titleBarStyle: 'default'
  });

  mainWindow.loadFile('index.html');
  
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    console.log('✅ Finestra principale pronta e visualizzata');
  });

  mainWindow.webContents.on('render-process-gone', (event, details) => {
    console.error('❌ Render process crashed:', details);
  });

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('❌ Failed to load:', errorDescription);
  });

  mainWindow.webContents.once('did-finish-load', () => {
    console.log('🎯 Finestra caricata - avvio caricamento automatico inventario');
    setTimeout(() => {
      caricaInventarioAutomatico();
    }, 1000);
  });
}

// FUNZIONE PER SPOSTARE ORDINE COMPLETATO
function spostaOrdineCompletato(fileName) {
    try {
        const ordersPath = path.join(__dirname, '..', 'shared_documents', 'ordini');
        const completedPath = path.join(__dirname, '..', 'shared_documents', 'ordini_completati');
        
        // Crea cartella ordini_completati se non esiste
        ensureDirectoryExists(completedPath);
        
        const sourcePath = path.join(ordersPath, fileName);
        const destPath = path.join(completedPath, fileName);
        
        // Verifica che il file esista
        if (!fs.existsSync(sourcePath)) {
            console.log('⚠️ File ordine non trovato:', fileName);
            return { success: false, error: 'File non trovato' };
        }
        
        // Sposta il file
        fs.renameSync(sourcePath, destPath);
        console.log('✅ Ordine spostato in ordini_completati:', fileName);
        
        return { success: true, message: 'Ordine spostato con successo' };
        
    } catch (error) {
        console.error('❌ Errore spostamento ordine:', error);
        return { success: false, error: error.message };
    }
}

// SERVER API PER MOBILE
function startMobileApiServer() {
    try {
        const apiServer = express();
        apiServer.use(express.json());
        
        // Middleware per CORS (permetti connessioni dal mobile)
        apiServer.use((req, res, next) => {
            res.header('Access-Control-Allow-Origin', '*');
            res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
            res.header('Access-Control-Allow-Headers', 'Content-Type');
            next();
        });

        // === DEBUG API - TEST FONDAMENTALE ===
        apiServer.get('/api/debug/test', (req, res) => {
            console.log('✅✅✅ DEBUG TEST ENDPOINT CHIAMATO ✅✅✅');
            res.json({
                success: true,
                message: 'Server raggiungibile!',
                server_time: new Date().toISOString(),
                endpoints_available: [
                    '/api/sync/inventory',
                    '/api/sync/complete-order', 
                    '/api/health',
                    '/api/debug/test'
                ]
            });
        });

// API 1: Ottieni inventario completo
apiServer.get('/api/sync/inventory', (req, res) => {
    // ... resto del codice esistente
});

        // API 1: Ottieni inventario completo
        apiServer.get('/api/sync/inventory', (req, res) => {
            try {
                console.log('📱 Mobile: Richiesta inventario');
                const databasePath = getDatabasePath();
                
                if (!fs.existsSync(databasePath)) {
                    return res.json({ success: false, error: 'Inventario non trovato' });
                }
                
                const data = fs.readFileSync(databasePath, 'utf8');
                const inventario = JSON.parse(data);
                
                res.json({
                    success: true,
                    data: inventario,
                    last_updated: new Date().toISOString(),
                    count: inventario.length
                });
                
            } catch (error) {
                console.error('❌ Errore API inventario:', error);
                res.json({ success: false, error: error.message });
            }
        });

        // API 2: Ottieni informazioni sistema
        apiServer.get('/api/sync/system-info', (req, res) => {
            res.json({
                success: true,
                app_name: 'Picking App Desktop',
                version: '1.0.0',
                server_time: new Date().toISOString(),
                status: 'running'
            });
        });

        // API 3: Ricevi DDT dal mobile
        apiServer.post('/api/sync/upload-ddt', (req, res) => {
            try {
                console.log('📱 Mobile: Ricevuto DDT');
                const ddtData = req.body;
                
                console.log('DDT ricevuto:', ddtData);
                
                res.json({
                    success: true,
                    message: 'DDT ricevuto correttamente',
                    received_at: new Date().toISOString()
                });
                
            } catch (error) {
                console.error('❌ Errore ricezione DDT:', error);
                res.json({ success: false, error: error.message });
            }
        });

        // API 4: Health check semplice
        apiServer.get('/api/health', (req, res) => {
            console.log('📱 Health check richiesto');
            res.json({ 
                status: 'ok', 
                timestamp: new Date().toISOString(),
                message: 'Server desktop funzionante'
            });
        });

        // API 5: Health check esteso
        apiServer.get('/api/sync/health', (req, res) => {
            try {
                const databasePath = getDatabasePath();
                const inventoryLoaded = fs.existsSync(databasePath);
                let inventoryCount = 0;
                
                if (inventoryLoaded) {
                    const data = fs.readFileSync(databasePath, 'utf8');
                    const inventario = JSON.parse(data);
                    inventoryCount = inventario.length;
                }
                
                res.json({
                    status: 'ok',
                    timestamp: new Date().toISOString(),
                    inventory_loaded: inventoryLoaded,
                    inventory_count: inventoryCount,
                    server: 'Picking App Desktop',
                    version: '1.0.0'
                });
            } catch (error) {
                res.json({
                    status: 'error',
                    timestamp: new Date().toISOString(),
                    error: error.message
                });
            }
        });

        // API 6: Lista file ordini
        apiServer.get('/api/orders/list', async (req, res) => {
            try {
                console.log('📱 Mobile: Richiesta lista ordini');
                const ordersPath = path.join(__dirname, '..', 'shared_documents', 'ordini');
                
                // Verifica se la cartella esiste
                try {
                    await fs.promises.access(ordersPath);
                } catch (error) {
                    console.log('❌ Cartella ordini non trovata, creazione...');
                    await fs.promises.mkdir(ordersPath, { recursive: true });
                    return res.json({ 
                        success: true, 
                        files: [] 
                    });
                }
                
                const files = await fs.promises.readdir(ordersPath);
                const orderFiles = [];

                for (const file of files) {
                    if (file.endsWith('.xlsx') || file.endsWith('.xls')) {
                        const filePath = path.join(ordersPath, file);
                        const stats = await fs.promises.stat(filePath);
                        
                        orderFiles.push({
                            name: file,
                            path: filePath,
                            size: stats.size,
                            modified: stats.mtime
                        });
                    }
                }

                console.log(`✅ Trovati ${orderFiles.length} file ordine`);
                res.json({
                    success: true,
                    files: orderFiles
                });
                
            } catch (error) {
                console.error('❌ Errore lettura ordini:', error);
                res.json({ 
                    success: false, 
                    error: error.message 
                });
            }
        });

        // API 7: Carica ordine specifico - CORRETTA
        // API 7: Carica ordine specifico - AGGIUNGI SCONTI
        apiServer.post('/api/orders/load', async (req, res) => {
            try {
                const { fileName } = req.body;
                console.log(`📱 Mobile: Caricamento ordine: ${fileName}`);
                
                const ordersPath = path.join(__dirname, '..', 'shared_documents', 'ordini');
                const filePath = path.join(ordersPath, fileName);
                
                await fs.promises.access(filePath);

                const workbook = XLSX.readFile(filePath);
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                
                const data = XLSX.utils.sheet_to_json(worksheet);
                
                console.log(`📊 File letto: ${data.length} righe`);
                console.log('🔍 Colonne trovate:', Object.keys(data[0] || {}));
                
                // Mappa i prodotti - AGGIUNGI SCONTI
                const prodotti = data.map((row, index) => {
                    console.log(`📦 Riga ${index}:`, {
                        cod: row['Cod.'],
                        desc: row['Descrizione'],
                        quantita: row['Q.tà'],
                        sconti: row['Sconti'] // ⭐⭐⭐ AGGIUNGI QUESTO ⭐⭐⭐
                    });

                    return {
                        codice: row['Cod.'] || `COD_${index}`,
                        descrizione: row['Descrizione'] || 'Prodotto senza descrizione',
                        prezzo: (row['Prezzo ivato'] || '0') + '€',
                        quantita: 0,
                        quantitaOrdinata: row['Q.tà'] || 1,
                        quantitaPrelevata: 0,
                        sconti: row['Sconti'] || '' // ⭐⭐⭐ AGGIUNGI SCONTI ⭐⭐⭐
                    };
                });

                const ordine = {
                    id: fileName.replace('.xlsx', '').replace('.xls', ''),
                    nome: fileName.replace('.xlsx', '').replace('.xls', '').replace(/_/g, ' '),
                    fileName: fileName,
                    prodotti: prodotti,
                    operatore: 'Operatore',
                    dataCreazione: new Date().toISOString().split('T')[0],
                    dataCompletamento: undefined,
                    stato: 'in_lavorazione',
                    totale: prodotti.reduce((sum, p) => sum + (parseFloat(p.prezzo) || 0) * (p.quantitaOrdinata || 0), 0),
                    prodottiCount: prodotti.length,
                    quantitaTotaleOrdinata: prodotti.reduce((sum, p) => sum + (p.quantitaOrdinata || 0), 0),
                    quantitaTotalePrelevata: 0
                };

                console.log(`✅ Ordine caricato con ${prodotti.length} prodotti e sconti`);
                
                res.json({
                    success: true,
                    ordine: ordine
                });
                
            } catch (error) {
                console.error('❌ Errore caricamento ordine:', error);
                res.json({ 
                    success: false, 
                    error: error.message 
                });
            }
        });

        // === NUOVE API AGGIUNTE ===

        // API 8: Completa ordine (aggiorna quantità inventario)
        apiServer.post('/api/sync/complete-order', async (req, res) => {
            try {
                console.log('📱 Mobile: Ricevuto ordine completato');
                const { ordine, timestamp } = req.body;
                
                console.log('📦 Ordine completato:', ordine.nome);
                console.log('👤 Operatore:', ordine.operatore);
                console.log('📊 Prodotti prelevati:', ordine.quantitaTotalePrelevata);
                
                // Carica inventario corrente
                const databasePath = getDatabasePath();
                if (!fs.existsSync(databasePath)) {
                    return res.json({ success: false, error: 'Inventario non trovato' });
                }
                
                const data = fs.readFileSync(databasePath, 'utf8');
                const inventario = JSON.parse(data);
                
                // Aggiorna quantità per ogni prodotto prelevato
                let aggiornamenti = 0;
                let errori = 0;
                
                for (const prodottoOrdine of ordine.prodotti) {
                    const quantitaPrelevata = prodottoOrdine.quantitaPrelevata || 0;
                    
                    if (quantitaPrelevata > 0) {
                        // Cerca prodotto nell'inventario
                        const prodottoInventario = inventario.find(p => 
                            p['Cod.'] === prodottoOrdine.codice || 
                            p.Cod === prodottoOrdine.codice
                        );
                        
                        if (prodottoInventario) {
                            // Sottrai la quantità prelevata
                            const quantitaAttuale = parseInt(prodottoInventario['Q.tà disponibile']) || 0;
                            prodottoInventario['Q.tà disponibile'] = quantitaAttuale - quantitaPrelevata;
                            prodottoInventario['ultima_modifica'] = new Date().toISOString();
                            aggiornamenti++;
                            
                            console.log(`📉 Aggiornato ${prodottoOrdine.codice}: ${quantitaAttuale} -> ${prodottoInventario['Q.tà disponibile']}`);
                        } else {
                            console.log(`⚠️ Prodotto non trovato: ${prodottoOrdine.codice}`);
                            errori++;
                        }
                    }
                }
                
                // Salva inventario aggiornato
                fs.writeFileSync(databasePath, JSON.stringify(inventario, null, 2));
                
                // Crea DDT
                console.log('📄🎯 CHIAMATA a creaDDTAutomaticoPerMobile...');
                const ddtResult = await creaDDTAutomaticoPerMobile(ordine);
                
                // ⭐⭐⭐ NUOVO: SPOSTA ORDINE COMPLETATO ⭐⭐⭐
                let spostamentoResult = { success: false, message: 'Nessun file da spostare' };
                
                if (ordine.fileName) {
                    console.log(`🔄 Spostamento ordine completato: ${ordine.fileName}`);
                    spostamentoResult = spostaOrdineCompletato(ordine.fileName);
                }
                
                res.json({
                    success: true,
                    message: `Ordine processato: ${aggiornamenti} prodotti aggiornati, ${errori} errori`,
                    aggiornamenti: aggiornamenti,
                    errori: errori,
                    ddt_creato: ddtResult.success,
                    ordine_spostato: spostamentoResult.success,
                    spostamento_message: spostamentoResult.message
                });
                
            } catch (error) {
                console.error('❌ Errore processamento ordine:', error);
                res.json({ 
                    success: false, 
                    error: error.message 
                });
            }
        });

        // API 9: Carica log attività
        apiServer.post('/api/sync/upload-logs', async (req, res) => {
            try {
                console.log('📱 Mobile: Ricevuti log attività');
                const { logs, timestamp } = req.body;
                
                console.log('📝 Log ricevuti:', logs.length);
                
                // Salva log in file
                const logsDir = path.join(__dirname, '..', 'shared_documents', 'logs');
                ensureDirectoryExists(logsDir);
                
                const logFile = path.join(logsDir, `activity_logs_${new Date().toISOString().split('T')[0]}.json`);
                
                let logsEsistenti = [];
                if (fs.existsSync(logFile)) {
                    const data = fs.readFileSync(logFile, 'utf8');
                    logsEsistenti = JSON.parse(data);
                }
                
                logsEsistenti.push(...logs);
                fs.writeFileSync(logFile, JSON.stringify(logsEsistenti, null, 2));
                
                res.json({
                    success: true,
                    message: `Log salvati: ${logs.length} attività`,
                    count: logs.length
                });
                
            } catch (error) {
                console.error('❌ Errore salvataggio log:', error);
                res.json({ 
                    success: false, 
                    error: error.message 
                });
            }
        });

        // API 10: Ordini in sospeso
        apiServer.get('/api/sync/pending-orders', async (req, res) => {
            try {
                console.log('📱 Mobile: Richiesta ordini in sospeso');
                
                const ordersPath = path.join(__dirname, '..', 'shared_documents', 'ordini');
                
                // Verifica se la cartella esiste
                try {
                    await fs.promises.access(ordersPath);
                } catch (error) {
                    console.log('❌ Cartella ordini non trovata');
                    return res.json({ 
                        success: true, 
                        orders: [] 
                    });
                }
                
                const files = await fs.promises.readdir(ordersPath);
                const orderFiles = files.filter(file => 
                    file.endsWith('.xlsx') || file.endsWith('.xls')
                );

                console.log(`✅ ${orderFiles.length} ordini disponibili`);
                
                res.json({
                    success: true,
                    orders: orderFiles.map(file => ({
                        fileName: file,
                        name: file.replace('.xlsx', '').replace('.xls', '').replace(/_/g, ' '),
                        size: fs.statSync(path.join(ordersPath, file)).size,
                        modified: fs.statSync(path.join(ordersPath, file)).mtime
                    }))
                });
                
            } catch (error) {
                console.error('❌ Errore lettura ordini:', error);
                res.json({ 
                    success: false, 
                    error: error.message 
                });
            }
        });

        // API 11: Inizia sessione picking
        apiServer.post('/api/sync/start-session', (req, res) => {
            try {
                console.log('📱 Mobile: Inizio sessione picking');
                const { operatore, timestamp } = req.body;
                
                console.log('👤 Operatore:', operatore);
                
                // Salva log sessione
                const logsDir = path.join(__dirname, '..', 'shared_documents', 'logs');
                ensureDirectoryExists(logsDir);
                
                const sessionLog = {
                    tipo: 'SESSIONE_INIZIATA',
                    operatore: operatore,
                    timestamp: timestamp,
                    data: new Date().toISOString()
                };
                
                const sessionFile = path.join(logsDir, `session_${operatore}_${Date.now()}.json`);
                fs.writeFileSync(sessionFile, JSON.stringify(sessionLog, null, 2));
                
                res.json({
                    success: true,
                    message: `Sessione iniziata per ${operatore}`,
                    session_id: Date.now().toString()
                });
                
            } catch (error) {
                console.error('❌ Errore inizio sessione:', error);
                res.json({ 
                    success: false, 
                    error: error.message 
                });
            }
        });

        // Aggiungi questa API di test DOPO tutte le altre API
        apiServer.get('/api/debug/test-complete-order', (req, res) => {
            console.log('✅ Test endpoint chiamato');
            res.json({
                success: true,
                message: 'API /api/sync/complete-order è configurata correttamente',
                timestamp: new Date().toISOString()
            });
        });

        // Avvia server sulla porta 3001
        const PORT = 3001;
        apiServer.listen(PORT, '0.0.0.0', () => {
            console.log(`🔄 Server API mobile in ascolto su http://localhost:${PORT}`);
            console.log(`📱 Pronto per connessioni da dispositivi mobile sulla stessa rete`);
            console.log(`🌐 Indirizzi di rete disponibili:`);
            
            // Mostra gli IP di rete
            const os = require('os');
            const networkInterfaces = os.networkInterfaces();
            
            Object.keys(networkInterfaces).forEach(interfaceName => {
                networkInterfaces[interfaceName].forEach(interface => {
                    if (interface.family === 'IPv4' && !interface.internal) {
                        console.log(`   → http://${interface.address}:${PORT}`);
                    }
                });
            });
        });

        return true;
    } catch (error) {
        console.error('❌ Errore avvio server API:', error);
        return false;
    }
}

    // FUNZIONE PER CREARE DDT AUTOMATICO - UNICA VERSIONE
    async function creaDDTAutomatico(ordine) {
      try {
          console.log('📄 CREAZIONE DDT - PERCORSO CORRETTO');
          
          const sharedDocumentsPath = path.join(__dirname, '..', 'shared_documents');
          const cartellaDDT = path.join(sharedDocumentsPath, 'DDT');
          
          console.log('📁 PERCORSO DDT CORRETTO:', cartellaDDT);
          
          ensureDirectoryExists(cartellaDDT);
          
          const data = new Date().toISOString().split('T')[0];
          const nomePulito = ordine.nome.replace(/[^a-zA-Z0-9-_]/g, '_');
          const nomeDDT = `DDT_${data}_${nomePulito}_${ordine.operatore}.xlsx`;
          const percorsoDDT = path.join(cartellaDDT, nomeDDT);
          
          console.log('📊 Preparazione dati DDT...');
          
          // Prepara dati per DDT - FORMATO CORRETTO
          const datiDDT = ordine.prodotti
              .filter(prodotto => (prodotto.quantitaPrelevata || 0) > 0)
              .map(prodotto => {
                  // Prezzo solo numerico
                  let prezzoNumerico = '0,000';
                  if (prodotto.prezzo) {
                      prezzoNumerico = prodotto.prezzo.toString()
                          .replace('€', '')
                          .replace('.', ',')
                          .trim();
                  }
                  
                  return {
                      'Cod.': prodotto.codice || '',
                      'Descrizione': prodotto.descrizione || '',
                      'Q.tà': prodotto.quantitaPrelevata || 0,
                      'Prezzo ivato': prezzoNumerico,
                      'U.m.': 'pz',
                      'Sconti': prodotto.sconti || '', // ⭐⭐⭐ USA SCONTI ORIGINALI ⭐⭐⭐
                      'Iva': '22',
                      'Mag.': 'Si',
                      'Importo ivato': ''
                  };
              });
                    
          if (datiDDT.length === 0) {
              console.log('⚠️ Nessun prodotto prelevato, DDT vuoto');
              return { success: false, error: 'Nessun prodotto prelevato' };
          }
          
          console.log(`📦 DDT con ${datiDDT.length} prodotti`);
          
          const colonneOrdinata = [
              'Cod.',
              'Descrizione', 
              'Q.tà',
              'Prezzo ivato',
              'U.m.',
              'Sconti',
              'Iva',
              'Mag.',
              'Importo ivato'
          ];
          
          const worksheet = XLSX.utils.json_to_sheet(datiDDT, {
              header: colonneOrdinata,
              skipHeader: false
          });
          
          const workbook = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(workbook, worksheet, 'DDT');
          XLSX.writeFile(workbook, percorsoDDT);
          
          console.log('✅✅✅ DDT CREATO IN: shared_documents/DDT/');
          console.log('✅✅✅ Prezzi in formato NUMERICO (senza €)');
          console.log('✅✅✅ Colonna Mag. con "Si" fisso');
          
          return { 
              success: true, 
              filePath: percorsoDDT,
              fileName: nomeDDT
          };
          
      } catch (error) {
          console.error('❌ Errore creazione DDT:', error);
          return { 
              success: false, 
              error: error.message 
          };
      }
  }

// FUNZIONE PER REGISTRARE HANDLER IPC
function registerIpcHandlers() {
  if (ipcHandlersRegistered) {
    console.log('⚠️ Handler IPC già registrati, skip...');
    return;
  }

  console.log('🔧 Registrazione handler IPC...');

  // Handler per caricamento inventario
  ipcMain.handle('carica-inventario', async () => {
    return await caricaInventarioManualmente();
  });

  // Handler per aggiornamento inventario normale
  ipcMain.handle('aggiorna-inventario', async () => {
    return await aggiornaInventario();
  });

  // Handler per aggiornamento inventario con confronto
  ipcMain.handle('aggiorna-inventario-confronto', async () => {
    return await aggiornaInventarioConConfronto();
  });

  // Handler per salvataggio inventario
  ipcMain.handle('salva-inventario', async (event, inventario) => {
    try {
      const success = salvaInventarioDatabase(inventario);
      return { success: success };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // Handler per salvataggio forzato
  ipcMain.handle('salva-inventario-forzato', async (event, inventario) => {
    try {
      console.log('💾 Salvataggio forzato...');
      const success = salvaInventarioDatabase(inventario);
      return { success: success };
    } catch (error) {
      console.error('❌ Errore salvataggio forzato:', error);
      return { success: false, error: error.message };
    }
  });

  // Handler per esportazione inventario
  ipcMain.handle('esporta-inventario', async (event) => {
    try {
      const databasePath = getDatabasePath();
      
      if (!fs.existsSync(databasePath)) {
        return { success: false, error: 'Nessun inventario da esportare' };
      }
      
      const data = fs.readFileSync(databasePath, 'utf8');
      const inventario = JSON.parse(data);
      
      const result = esportaInventarioExcel(inventario);
      return result;
      
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // Handler per selezione file ordine
  ipcMain.handle('seleziona-file-ordine', async () => {
    return await selezionaFileOrdine();
  });

  // Handler per aprire cartella DDT
  ipcMain.handle('apri-cartella-ddt', async () => {
      try {
          const sharedDocumentsPath = path.join(__dirname, '..', 'shared_documents');
          const cartellaDDT = path.join(sharedDocumentsPath, 'DDT');
          
          if (fs.existsSync(cartellaDDT)) {
              require('electron').shell.openPath(cartellaDDT);
              return { success: true };
          } else {
              ensureDirectoryExists(cartellaDDT);
              require('electron').shell.openPath(cartellaDDT);
              return { success: true };
          }
      } catch (error) {
          return { success: false, error: error.message };
      }
  });

  // FUNZIONE PER CREARE DDT AUTOMATICO - UNICA VERSIONE
  async function creaDDTAutomatico(ordine) {
    try {
        console.log('📄 CREAZIONE DDT - PERCORSO CORRETTO');
        
        const sharedDocumentsPath = path.join(__dirname, '..', 'shared_documents');
        const cartellaDDT = path.join(sharedDocumentsPath, 'DDT');
        
        console.log('📁 PERCORSO DDT CORRETTO:', cartellaDDT);
        
        ensureDirectoryExists(cartellaDDT);
        
        const data = new Date().toISOString().split('T')[0];
        const nomePulito = ordine.nome.replace(/[^a-zA-Z0-9-_]/g, '_');
        const nomeDDT = `DDT_${data}_${nomePulito}_${ordine.operatore}.xlsx`;
        const percorsoDDT = path.join(cartellaDDT, nomeDDT);
        
        console.log('📊 Preparazione dati DDT...');
        
        // Prepara dati per DDT - FORMATO CORRETTO
        const datiDDT = ordine.prodotti
            .filter(prodotto => (prodotto.quantitaPrelevata || 0) > 0)
            .map(prodotto => {
                // Prezzo solo numerico
                let prezzoNumerico = '0,000';
                if (prodotto.prezzo) {
                    prezzoNumerico = prodotto.prezzo.toString()
                        .replace('€', '')
                        .replace('.', ',')
                        .trim();
                }
                
                return {
                    'Cod.': prodotto.codice || '',
                    'Descrizione': prodotto.descrizione || '',
                    'Q.tà': prodotto.quantitaPrelevata || 0,
                    'Prezzo ivato': prezzoNumerico,
                    'U.m.': 'pz',
                    'Sconti': prodotto.sconti || '', // ⭐⭐⭐ USA SCONTI ORIGINALI ⭐⭐⭐
                    'Iva': '22',
                    'Mag.': 'Si',
                    'Importo ivato': ''
                };
            });
        
        if (datiDDT.length === 0) {
            console.log('⚠️ Nessun prodotto prelevato, DDT vuoto');
            return { success: false, error: 'Nessun prodotto prelevato' };
        }
        
        console.log(`📦 DDT con ${datiDDT.length} prodotti`);
        
        const colonneOrdinata = [
            'Cod.',
            'Descrizione', 
            'Q.tà',
            'Prezzo ivato',
            'U.m.',
            'Sconti',
            'Iva',
            'Mag.',
            'Importo ivato'
        ];
        
        const worksheet = XLSX.utils.json_to_sheet(datiDDT, {
            header: colonneOrdinata,
            skipHeader: false
        });
        
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'DDT');
        XLSX.writeFile(workbook, percorsoDDT);
        
        console.log('✅✅✅ DDT CREATO IN: shared_documents/DDT/');
        console.log('✅✅✅ Prezzi in formato NUMERICO (senza €)');
        console.log('✅✅✅ Colonna Mag. con "Sì" fisso');
        
        return { 
            success: true, 
            filePath: percorsoDDT,
            fileName: nomeDDT
        };
        
    } catch (error) {
        console.error('❌ Errore creazione DDT:', error);
        return { 
            success: false, 
            error: error.message 
        };
    }
}

  // Handler per ottenere nome ordine corrente
  ipcMain.handle('get-current-order-name', async () => {
    return currentOrderFileName;
  });

  ipcHandlersRegistered = true;
  console.log('✅ Handler IPC registrati con successo');
}

// AGGIUNGI QUESTA API al server Express (dopo le altre API)
apiServer.get('/api/debug/inventory-test', (req, res) => {
    try {
        console.log('🔍 DEBUG: Test endpoint inventario chiamato');
        const databasePath = getDatabasePath();
        
        if (!fs.existsSync(databasePath)) {
            console.log('❌ DEBUG: Database inventario non trovato');
            return res.json({ 
                success: false, 
                error: 'Database non trovato',
                path: databasePath 
            });
        }
        
        const data = fs.readFileSync(databasePath, 'utf8');
        const inventario = JSON.parse(data);
        
        console.log(`✅ DEBUG: Inventario letto: ${inventario.length} prodotti`);
        
        res.json({
            success: true,
            message: 'Inventario accessibile',
            count: inventario.length,
            sample: inventario.slice(0, 3), // Prime 3 righe per debug
            path: databasePath
        });
        
    } catch (error) {
        console.error('❌ DEBUG: Errore test inventario:', error);
        res.json({ 
            success: false, 
            error: error.message,
            stack: error.stack 
        });
    }
});

// FUNZIONE PER CREARE CARTELLE IN MODO SICURO
function ensureDirectoryExists(dirPath) {
  try {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
      console.log('✅ Cartella creata:', dirPath);
    }
    return true;
  } catch (error) {
    console.error('❌ Errore creazione cartella:', dirPath, error);
    return false;
  }
}

// FUNZIONE PER CREARE DDT AUTOMATICO - SOLO PER MOBILE
async function creaDDTAutomaticoPerMobile(ordine) {
    try {
        console.log('📄 MOBILE: Creazione DDT automatico per ordine:', ordine.nome);
        
        // USA LA CARTELLA SHARED_DOCUMENTS/DDT
        const sharedDocumentsPath = path.join(__dirname, '..', 'shared_documents');
        const cartellaDDT = path.join(sharedDocumentsPath, 'DDT');
        
        console.log('📁 PERCORSO CORRETTO DDT:', cartellaDDT);
        
        ensureDirectoryExists(cartellaDDT);
        
        const data = new Date().toISOString().split('T')[0];
        const nomePulito = ordine.nome.replace(/[^a-zA-Z0-9-_]/g, '_');
        const nomeDDT = `DDT_${data}_${nomePulito}_${ordine.operatore}.xlsx`;
        const percorsoDDT = path.join(cartellaDDT, nomeDDT);
        
        console.log('📊 Preparazione dati DDT con formato corretto...');
        
        // Prepara dati per DDT - FORMATO ESATTO COME ORDINE
        // Nella funzione creaDDTAutomatico, cambia questa parte:
        const datiDDT = ordine.prodotti
            .filter(prodotto => (prodotto.quantitaPrelevata || 0) > 0)
            .map(prodotto => {
                // Prezzo solo numerico
                let prezzoNumerico = '0,000';
                if (prodotto.prezzo) {
                    prezzoNumerico = prodotto.prezzo.toString()
                        .replace('€', '')
                        .replace('.', ',')
                        .trim();
                }
                
                return {
                    'Cod.': prodotto.codice || '',
                    'Descrizione': prodotto.descrizione || '',
                    'Q.tà': prodotto.quantitaPrelevata || 0,
                    'Prezzo ivato': prezzoNumerico,
                    'U.m.': 'pz',
                    'Sconti': prodotto.sconti || '', // ⭐⭐⭐ USA SCONTI ORIGINALI ⭐⭐⭐
                    'Iva': '22',
                    'Mag.': 'Si',
                    'Importo ivato': ''
                };
            });
        
        if (datiDDT.length === 0) {
            console.log('⚠️ Nessun prodotto prelevato, DDT vuoto');
            return { success: false, error: 'Nessun prodotto prelevato' };
        }
        
        console.log(`📦 DDT con ${datiDDT.length} prodotti - FORMATO CORRETTO`);
        
        // DEBUG: mostra i dati
        console.log('🔍 Dati DDT:', datiDDT);
        
        const colonneOrdinata = [
            'Cod.',
            'Descrizione', 
            'Q.tà',
            'Prezzo ivato',
            'U.m.',
            'Sconti',
            'Iva',
            'Mag.',
            'Importo ivato'
        ];
        
        const worksheet = XLSX.utils.json_to_sheet(datiDDT, {
            header: colonneOrdinata,
            skipHeader: false
        });
        
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'DDT');
        XLSX.writeFile(workbook, percorsoDDT);
        
        console.log('✅✅✅ DDT MOBILE creato con successo nel percorso corretto:', percorsoDDT);
        
        return { 
            success: true, 
            filePath: percorsoDDT,
            fileName: nomeDDT
        };
        
    } catch (error) {
        console.error('❌ Errore creazione DDT automatico MOBILE:', error);
        return { 
            success: false, 
            error: error.message 
        };
    }
}

// FUNZIONE PER CARICAMENTO AUTOMATICO INVENTARIO ALL'AVVIO
function caricaInventarioAutomatico() {
  try {
    console.log('🔄 Caricamento automatico inventario all\'avvio...');
    
    const databasePath = getDatabasePath();
    console.log('📁 Percorso database:', databasePath);
    
    if (!fs.existsSync(databasePath)) {
      console.log('📝 Creazione nuovo database vuoto...');
      const inventarioVuoto = [];
      ensureDirectoryExists(getDatabaseDir());
      fs.writeFileSync(databasePath, JSON.stringify(inventarioVuoto, null, 2));
      console.log('✅ Database vuoto creato');
      
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('inventario-caricato', {
          success: true,
          data: inventarioVuoto
        });
      }
      return;
    }
    
    console.log('📖 Lettura database esistente...');
    const data = fs.readFileSync(databasePath, 'utf8');
    
    if (!data || data.trim() === '') {
      console.log('⚠️ Database vuoto - reinizializzazione');
      const inventarioVuoto = [];
      ensureDirectoryExists(getDatabaseDir());
      fs.writeFileSync(databasePath, JSON.stringify(inventarioVuoto, null, 2));
      
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('inventario-caricato', {
          success: true,
          data: inventarioVuoto
        });
      }
      return;
    }
    
    const inventario = JSON.parse(data);
    console.log(`✅ Inventario caricato automaticamente: ${inventario.length} prodotti`);
    
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('inventario-caricato', {
        success: true,
        data: inventario
      });
    }
    
  } catch (error) {
    console.error('❌ ERRORE nel caricamento automatico inventario:', error);
    
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('inventario-caricato', {
        success: false,
        error: error.message,
        data: []
      });
    }
  }
}

// FUNZIONE PER CARICARE INVENTARIO MANUALMENTE
function caricaInventarioManualmente() {
    try {
        console.log('🔄 Caricamento manuale inventario...');
        
        const databaseDir = getDatabaseDir();
        const databasePath = getDatabasePath();
        
        console.log('📁 Percorso database:', databasePath);
        
        if (!ensureDirectoryExists(databaseDir)) {
            throw new Error('Impossibile accedere alla cartella database');
        }
        
        if (!fs.existsSync(databasePath)) {
            console.log('📝 Database non trovato, creazione nuovo database vuoto...');
            const inventarioVuoto = [];
            fs.writeFileSync(databasePath, JSON.stringify(inventarioVuoto, null, 2));
        }
        
        const data = fs.readFileSync(databasePath, 'utf8');
        
        if (!data || data.trim() === '') {
            console.log('⚠️ Database vuoto');
            const inventarioVuoto = [];
            fs.writeFileSync(databasePath, JSON.stringify(inventarioVuoto, null, 2));
            
            return { 
                success: true, 
                data: inventarioVuoto,
                message: 'Database vuoto reinizializzato'
            };
        }
        
        const inventario = JSON.parse(data);
        console.log(`✅ Inventario caricato: ${inventario.length} prodotti`);
        
        return { 
            success: true, 
            data: inventario,
            message: `Inventario caricato: ${inventario.length} prodotti`
        };
        
    } catch (error) {
        console.error('❌ Errore caricamento manuale:', error);
        return { 
            success: false, 
            error: error.message,
            data: []
        };
    }
}

// SALVA INVENTARIO NEL DATABASE
function salvaInventarioDatabase(data) {
  try {
    console.log('💾 Inizio salvataggio database...');
    
    const databaseDir = getDatabaseDir();
    const databasePath = getDatabasePath();
    
    console.log('📁 Database dir:', databaseDir);
    console.log('📁 Database path:', databasePath);
    
    if (!data || !Array.isArray(data)) {
      console.log('❌ Dati non validi per il salvataggio');
      return false;
    }
    
    console.log(`📦 Prodotti da salvare: ${data.length}`);
    
    if (!ensureDirectoryExists(databaseDir)) {
      throw new Error('Impossibile creare la cartella database');
    }
    
    const datiFiltrati = data.map(prodotto => {
      let codABarre = prodotto['Cod. a barre'];
      if (codABarre && !Array.isArray(codABarre)) {
        codABarre = [codABarre];
      } else if (!codABarre) {
        codABarre = [];
      }
      
      return {
        'Cod.': prodotto['Cod.'] || prodotto.Cod || 'COD_NON_DEFINITO',
        'Descrizione': prodotto.Descrizione || 'Prodotto senza descrizione',
        'Cod. Udm': 'Pz',
        'Cod. a barre': codABarre,
        'Q.tà disponibile': prodotto['Q.tà disponibile'] || 0,
        'Listino 1 (ivato)': prodotto['Listino 1 (ivato)'] || 0,
        'Cod. Iva': prodotto['Cod. Iva'] || '22'
      };
    });
    
    console.log('💫 Scrittura file...');
    fs.writeFileSync(databasePath, JSON.stringify(datiFiltrati, null, 2));
    
    if (fs.existsSync(databasePath)) {
      const stats = fs.statSync(databasePath);
      console.log(`✅ Salvataggio completato! File: ${stats.size} bytes`);
      return true;
    } else {
      console.log('❌ File non creato!');
      return false;
    }
    
  } catch (error) {
    console.error('❌ Errore critico nel salvataggio:', error);
    return false;
  }
}

// FUNZIONE PER AGGIORNARE INVENTARIO (senza confronto)
async function aggiornaInventario() {
    if (isSelectingFile) {
        return { success: false, error: 'Operazione già in corso' };
    }
    
    isSelectingFile = true;
    
    try {
        console.log('📁 Apertura dialogo selezione file...');
        const result = await dialog.showOpenDialog(mainWindow, {
            properties: ['openFile'],
            filters: [
                { name: 'Excel Files', extensions: ['xlsx', 'xls'] },
                { name: 'All Files', extensions: ['*'] }
            ]
        });
        
        if (result.canceled || result.filePaths.length === 0) {
            isSelectingFile = false;
            return { success: false, error: 'Nessun file selezionato' };
        }
        
        const filePath = result.filePaths[0];
        console.log('📄 File selezionato:', filePath);
        
        const workbook = XLSX.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const nuovoInventario = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
        
        console.log(`📊 File letto: ${nuovoInventario.length} righe`);
        
        if (nuovoInventario.length === 0) {
            throw new Error('Il file Excel è vuoto o non contiene dati validi');
        }
        
        const success = salvaInventarioDatabase(nuovoInventario);
        
        if (success) {
            const inventarioCaricato = caricaInventarioManualmente();
            
            if (inventarioCaricato.success) {
                mainWindow.webContents.send('inventario-caricato', {
                    success: true,
                    data: inventarioCaricato.data
                });
                
                return { 
                    success: true, 
                    message: `Inventario aggiornato: ${nuovoInventario.length} prodotti` 
                };
            } else {
                throw new Error('Errore nel ricaricamento inventario: ' + inventarioCaricato.error);
            }
        } else {
            throw new Error('Salvataggio database fallito');
        }
        
    } catch (error) {
        console.error('❌ Errore aggiornamento inventario:', error);
        
        mainWindow.webContents.send('inventario-caricato', {
            success: false,
            error: error.message
        });
        
        return { success: false, error: error.message };
        
    } finally {
        isSelectingFile = false;
    }
}

// FUNZIONE PER ESPORTARE INVENTARIO IN EXCEL
function esportaInventarioExcel(inventario) {
  try {
    const documentsPath = app.getPath('documents');
    const cartellaInventario = path.join(documentsPath, 'Inventario_App');
    
    ensureDirectoryExists(cartellaInventario);
    
    const data = new Date().toISOString().split('T')[0];
    const nomeFile = `Inventario_${data}.xlsx`;
    const percorsoFile = path.join(cartellaInventario, nomeFile);
    
    const datiEsportazione = inventario.map(prodotto => {
      let ean = '';
      if (Array.isArray(prodotto['Cod. a barre'])) {
        ean = prodotto['Cod. a barre'].join(', ');
      } else {
        ean = prodotto['Cod. a barre'] || '';
      }
      
      return {
        'Cod.': prodotto['Cod.'] || '',
        'Descrizione': prodotto.Descrizione || '',
        'Cod. Udm': 'Pz',
        'Cod. a barre': ean,
        'Q.tà disponibile': prodotto['Q.tà disponibile'] || 0
      };
    });
    
    const worksheet = XLSX.utils.json_to_sheet(datiEsportazione);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Inventario');
    XLSX.writeFile(workbook, percorsoFile);
    
    console.log('✅ Inventario esportato in Excel con successo');
    
    setTimeout(() => {
      require('electron').shell.showItemInFolder(percorsoFile);
    }, 500);
    
    return { 
      success: true, 
      filePath: percorsoFile,
      fileName: nomeFile
    };
    
  } catch (error) {
    console.error('Errore nell\'esportazione inventario:', error);
    return { 
      success: false, 
      error: `Errore di sistema: ${error.message}` 
    };
  }
}

// FUNZIONE PER AGGIORNARE INVENTARIO CON CONFRONTO
async function aggiornaInventarioConConfronto() {
  if (isSelectingFile) {
    console.log('⚠️ Operazione già in corso');
    return { success: false, error: 'Operazione già in corso' };
  }
  
  isSelectingFile = true;
  
  try {
    console.log('📁 Apertura dialogo selezione file per aggiornamento con confronto...');
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [
        { name: 'Excel Files', extensions: ['xlsx', 'xls'] },
        { name: 'All Files', extensions: ['*'] }
      ],
      title: 'Seleziona file Excel per aggiornamento con confronto'
    });
    
    if (result.canceled || result.filePaths.length === 0) {
      isSelectingFile = false;
      console.log('❌ Nessun file selezionato');
      return { success: false, error: 'Nessun file selezionato' };
    }
    
    const filePath = result.filePaths[0];
    console.log('📄 File selezionato per confronto:', filePath);
    
    // Leggi il file Excel
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const nuovoInventario = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
    
    console.log(`📊 File letto: ${nuovoInventario.length} righe`);
    
    if (nuovoInventario.length === 0) {
      throw new Error('Il file Excel è vuoto o non contiene dati validi');
    }
    
    // Carica inventario attuale
    const databasePath = getDatabasePath();
    let inventarioAttuale = [];
    if (fs.existsSync(databasePath)) {
      const data = fs.readFileSync(databasePath, 'utf8');
      inventarioAttuale = JSON.parse(data);
      console.log(`📚 Inventario attuale: ${inventarioAttuale.length} prodotti`);
    } else {
      console.log('📚 Inventario attuale: vuoto (primo caricamento)');
    }
    
    // Processa l'aggiornamento
    const risultatoAggiornamento = await processaAggiornamentoInventario(inventarioAttuale, nuovoInventario);

    if (risultatoAggiornamento.success) {
      // Salva il nuovo inventario
      console.log('💾 Salvataggio inventario aggiornato...');
      const success = salvaInventarioDatabase(risultatoAggiornamento.inventarioAggiornato);
      
      if (success) {
        console.log('✅ Inventario salvato con successo');
        
        // Ricarica l'inventario nell'interfaccia
        const inventarioCaricato = caricaInventarioManualmente();
        
        if (inventarioCaricato.success) {
          // Invia l'inventario aggiornato al frontend
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('inventario-caricato', {
              success: true,
              data: inventarioCaricato.data
            });
            
            // Invia messaggio di successo specifico per l'aggiornamento
            mainWindow.webContents.send('aggiornamento-completato', {
              success: true,
              message: risultatoAggiornamento.riepilogo
            });
          }
          
          console.log(`✅ ${risultatoAggiornamento.riepilogo}`);
          return {
            success: true, 
            messaggio: risultatoAggiornamento.riepilogo
          };
        } else {
          throw new Error('Errore nel ricaricamento inventario: ' + inventarioCaricato.error);
        }
      } else {
        throw new Error('Errore nel salvataggio database');
      }
    } else {
      throw new Error(risultatoAggiornamento.error);
    }
    
  } catch (error) {
    console.error('❌ Errore aggiornamento inventario con confronto:', error);
    
    // Invia errore al frontend
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('inventario-caricato', {
        success: false,
        error: error.message
      });
      
      // Invia anche messaggio di errore specifico
      mainWindow.webContents.send('aggiornamento-completato', {
        success: false,
        error: error.message
      });
    }
    
    console.log(`❌ Errore: ${error.message}`);
    return { success: false, error: error.message };
    
  } finally {
    isSelectingFile = false;
    console.log('🔄 Operazione aggiornamento con confronto completata');
  }
}

// FUNZIONE PER PROCESSARE AGGIORNAMENTO INVENTARIO CON CONFERME
async function processaAggiornamentoInventario(inventarioAttuale, nuovoInventario) {
  console.log('🔄 Processa aggiornamento - Inventario attuale:', inventarioAttuale.length, 'Nuovo:', nuovoInventario.length);
  
  const inventarioAggiornato = [...inventarioAttuale];
  let nuoviProdotti = 0;
  let aggiornamentiQuantita = 0;
  let aggiornamentiPrezzo = 0;
  let aggiornamentiEAN = 0;
  let aggiornamentiDescrizione = 0;

  for (const nuovoProdotto of nuovoInventario) {
    const codice = nuovoProdotto['Cod.'] || nuovoProdotto.Cod;
    if (!codice) {
      console.log('⚠️ Salto prodotto senza codice:', nuovoProdotto);
      continue;
    }

    const codiceClean = codice.toString().trim();
    
    // CERCA PER CODICE (PRINCIPALE)
    let prodottoEsistenteIndex = inventarioAggiornato.findIndex(p => {
      const codEsistente = p['Cod.'] || p.Cod;
      return codEsistente && codEsistente.toString().trim() === codiceClean;
    });

    // SE NON TROVATO PER CODICE, CERCA PER EAN
    if (prodottoEsistenteIndex === -1 && nuovoProdotto['Cod. a barre']) {
      const eanCercato = nuovoProdotto['Cod. a barre'].toString().trim();
      prodottoEsistenteIndex = inventarioAggiornato.findIndex(p => {
        let eanEsistenti = [];
        if (Array.isArray(p['Cod. a barre'])) {
          eanEsistenti = p['Cod. a barre'];
        } else if (p['Cod. a barre']) {
          eanEsistenti = [p['Cod. a barre']];
        }
        return eanEsistenti.some(ean => ean && ean.toString().trim() === eanCercato);
      });
    }

    if (prodottoEsistenteIndex === -1) {
      // NUOVO PRODOTTO - CHIEDI CONFERMA
      const confermaNuovo = await chiediConfermaNuovoProdotto(nuovoProdotto);
      if (confermaNuovo) {
        const nuovoProdottoFiltrato = {
          'Cod.': codiceClean,
          'Descrizione': nuovoProdotto.Descrizione || nuovoProdotto['Desc.'] || 'Nuovo Prodotto',
          'Cod. Udm': 'Pz',
          'Cod. a barre': nuovoProdotto['Cod. a barre'] ? [nuovoProdotto['Cod. a barre'].toString()] : [],
          'Q.tà disponibile': parseInt(nuovoProdotto['Q.tà disponibile']) || 0,
          'Listino 1 (ivato)': parseFloat(nuovoProdotto['Listino 1 (ivato)']) || 0,
          'Cod. Iva': nuovoProdotto['Cod. Iva'] || '22'
        };
        inventarioAggiornato.push(nuovoProdottoFiltrato);
        nuoviProdotti++;
        console.log('➕ Nuovo prodotto aggiunto:', codiceClean);
      }
    } else {
      // PRODOTTO ESISTENTE - GESTISCI AGGIORNAMENTI CON CONFERME
      const prodottoEsistente = inventarioAggiornato[prodottoEsistenteIndex];
      
      // AGGIORNA QUANTITÀ (automatico - nessuna conferma)
      if (nuovoProdotto['Q.tà disponibile'] !== undefined && nuovoProdotto['Q.tà disponibile'] !== '') {
        const nuovaQuantita = parseInt(nuovoProdotto['Q.tà disponibile']);
        if (!isNaN(nuovaQuantita)) {
          const quantitaVecchia = prodottoEsistente['Q.tà disponibile'] || 0;
          if (quantitaVecchia !== nuovaQuantita) {
            prodottoEsistente['Q.tà disponibile'] = nuovaQuantita;
            aggiornamentiQuantita++;
            console.log(`📦 Quantità aggiornata automaticamente: ${codiceClean} - DA: ${quantitaVecchia} A: ${nuovaQuantita}`);
          }
        }
      }
      
      // AGGIORNA PREZZO (automatico - nessuna conferma)
      if (nuovoProdotto['Listino 1 (ivato)'] !== undefined && nuovoProdotto['Listino 1 (ivato)'] !== '') {
        const nuovoPrezzo = parseFloat(nuovoProdotto['Listino 1 (ivato)']);
        if (!isNaN(nuovoPrezzo)) {
          const prezzoVecchio = prodottoEsistente['Listino 1 (ivato)'] || 0;
          if (prezzoVecchio !== nuovoPrezzo) {
            prodottoEsistente['Listino 1 (ivato)'] = nuovoPrezzo;
            aggiornamentiPrezzo++;
            console.log(`💰 Prezzo aggiornato automaticamente: ${codiceClean} - DA: ${prezzoVecchio} A: ${nuovoPrezzo}`);
          }
        }
      }
      
      // GESTIONE EAN - CHIEDI CONFERMA
      if (nuovoProdotto['Cod. a barre'] && nuovoProdotto['Cod. a barre'] !== '') {
        let eanEsistenti = [];
        if (Array.isArray(prodottoEsistente['Cod. a barre'])) {
          eanEsistenti = prodottoEsistente['Cod. a barre'];
        } else if (prodottoEsistente['Cod. a barre']) {
          eanEsistenti = [prodottoEsistente['Cod. a barre']];
        }
        
        const nuovoEAN = nuovoProdotto['Cod. a barre'].toString().trim();
        if (nuovoEAN && !eanEsistenti.includes(nuovoEAN)) {
          const confermaEAN = await chiediConfermaCampo(
            codiceClean,
            'Codice EAN',
            eanEsistenti.join(', ') || '(nessuno)',
            nuovoEAN
          );
          if (confermaEAN) {
            eanEsistenti.push(nuovoEAN);
            prodottoEsistente['Cod. a barre'] = eanEsistenti;
            aggiornamentiEAN++;
            console.log(`🏷️ EAN aggiunto: ${codiceClean} - ${nuovoEAN}`);
          }
        }
      }
      
      // AGGIORNA DESCRIZIONE - CHIEDI CONFERMA
      const nuovaDescrizione = nuovoProdotto.Descrizione || nuovoProdotto['Desc.'];
      if (nuovaDescrizione && nuovaDescrizione !== prodottoEsistente.Descrizione) {
        const confermaDescrizione = await chiediConfermaCampo(
          codiceClean,
          'Descrizione',
          prodottoEsistente.Descrizione,
          nuovaDescrizione
        );
        if (confermaDescrizione) {
          prodottoEsistente.Descrizione = nuovaDescrizione;
          aggiornamentiDescrizione++;
          console.log(`📝 Descrizione aggiornata: ${codiceClean}`);
        }
      }
    }
  }

  const riepilogo = `${nuoviProdotti} nuovi prodotti, ${aggiornamentiQuantita} quantità aggiornate, ${aggiornamentiPrezzo} prezzi aggiornati, ${aggiornamentiEAN} EAN aggiunti, ${aggiornamentiDescrizione} descrizioni aggiornate`;
  console.log(`✅ Aggiornamento completato: ${riepilogo}`);

  return {
    success: true,
    inventarioAggiornato,
    riepilogo: riepilogo
  };
}

// FUNZIONE PER CHIEDERE CONFERMA PER NUOVI PRODOTTI
async function chiediConfermaNuovoProdotto(prodotto) {
  const codice = prodotto['Cod.'] || prodotto.Cod;
  const descrizione = prodotto.Descrizione || prodotto['Desc.'] || 'Nessuna descrizione';
  const quantita = prodotto['Q.tà disponibile'] || 0;
  const prezzo = prodotto['Listino 1 (ivato)'] || 0;
  const ean = prodotto['Cod. a barre'] || 'Nessuno';

  const messaggio = `
NUOVO PRODOTTO TROVATO

Codice: ${codice}
Descrizione: ${descrizione}
Quantità: ${quantita}
Prezzo: ${prezzo} €
EAN: ${ean}

Aggiungere questo nuovo prodotto all'inventario?
  `;

  try {
    const result = await dialog.showMessageBox(mainWindow, {
      type: 'question',
      buttons: ['Sì, aggiungi', 'No, salta'],
      defaultId: 0,
      cancelId: 1,
      title: 'Conferma Nuovo Prodotto',
      message: messaggio,
      detail: `Il prodotto con codice ${codice} non esiste nell'inventario corrente.`
    });

    return result.response === 0;
  } catch (error) {
    console.error('Errore nella conferma nuovo prodotto:', error);
    return false;
  }
}

// FUNZIONE PER CHIEDERE CONFERMA PER MODIFICHE AI CAMPI
async function chiediConfermaCampo(codiceProdotto, nomeCampo, valoreAttuale, nuovoValore) {
  // Se il nuovo valore è vuoto, mantieni il vecchio (NON chiedere conferma)
  if (!nuovoValore || nuovoValore.toString().trim() === '') {
    console.log(`ℹ️ Campo ${nomeCampo} vuoto nel nuovo file - mantengo valore esistente`);
    return false;
  }

  // Se i valori sono uguali, non fare nulla
  if (valoreAttuale === nuovoValore) {
    return false;
  }

  const messaggio = `
MODIFICA CAMPO PRODOTTO

Prodotto: ${codiceProdotto}
Campo: ${nomeCampo}

VALORE ATTUALЕ:
${valoreAttuale}

NUOVO VALORE:
${nuovoValore}

Applicare la modifica?
  `;

  try {
    const result = await dialog.showMessageBox(mainWindow, {
      type: 'question',
      buttons: ['Sì, applica', 'No, mantieni vecchio'],
      defaultId: 0,
      cancelId: 1,
      title: 'Conferma Modifica Campo',
      message: `Modifica ${nomeCampo} per prodotto ${codiceProdotto}`,
      detail: messaggio
    });

    return result.response === 0;
  } catch (error) {
    console.error('Errore nella conferma campo:', error);
    return false;
  }
}

// FUNZIONE PER SELEZIONARE ORDINE
async function selezionaFileOrdine() {
  if (isSelectingFile) {
    return { success: false, error: 'Operazione già in corso' };
  }
  
  isSelectingFile = true;
  
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [
        { name: 'Excel Files', extensions: ['xlsx', 'xls'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });
    
    if (result.canceled || result.filePaths.length === 0) {
      isSelectingFile = false;
      return { success: false, error: 'Nessun file selezionato' };
    }
    
    const filePath = result.filePaths[0];
    console.log('📄 File selezionato:', filePath);
    
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const data = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
    
    currentOrderFileName = path.basename(filePath);
    
    return {
      success: true,
      fileName: currentOrderFileName,
      data: data,
      filePath: filePath
    };
    
  } catch (error) {
    console.error('❌ Errore nel caricamento file ordine:', error);
    return { 
      success: false, 
      error: error.message 
    };
  } finally {
    isSelectingFile = false;
  }
}

// Salvataggio automatico prima della chiusura dell'app
app.on('before-quit', async (event) => {
  console.log('🔄 App in chiusura - salvataggio automatico...');
  
  if (mainWindow && !mainWindow.isDestroyed()) {
    try {
      const inventarioAggiornato = await mainWindow.webContents.executeJavaScript('inventario');
      if (inventarioAggiornato && Array.isArray(inventarioAggiornato)) {
        console.log(`📦 Salvataggio finale di ${inventarioAggiornato.length} prodotti...`);
        salvaInventarioDatabase(inventarioAggiornato);
      }
    } catch (error) {
      console.error('❌ Errore nel salvataggio automatico:', error);
    }
  }
});

// Gestione errori globale
process.on('uncaughtException', (error) => {
  console.error('❌ Errore non catturato:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Promise rejection non gestita:', reason);
});

// AVVIO APPLICAZIONE
app.whenReady().then(() => {
  registerIpcHandlers();
  createWindow();
  startMobileApiServer();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    registerIpcHandlers();
    createWindow();
  }
});