// Variabili globali
let ordineCorrente = null;
let inventario = null;
let prodottiScansionati = new Map();
let filePathOrdineCorrente = null;
let scrollPosition = 0;
let isEditingQuantity = false;
let currentEditingInput = null;
let nomeFileOrdineCorrente = null;

// Elementi DOM
let scannerInput, ordineTable, statusInfo, fileInfo, alertContainer, counterOrdine, progressFill, progressText, inventarioInfo;

function setupAutoSave() {
    // Funzione vuota - risolve l'errore
    console.log('AutoSave setup (placeholder)');
}

// Inizializzazione
document.addEventListener('DOMContentLoaded', function() {
    console.log('App inizializzata');
    inizializzaApp();
});

function inizializzaApp() {
    console.log('Inizializzazione app...');
    
    // Riferimenti agli elementi DOM
    scannerInput = document.getElementById('scannerInput');
    ordineTable = document.getElementById('ordineTable');
    statusInfo = document.getElementById('statusInfo');
    fileInfo = document.getElementById('fileInfo');
    alertContainer = document.getElementById('alertContainer');
    counterOrdine = document.getElementById('counterOrdine');
    progressFill = document.getElementById('progressFill');
    progressText = document.getElementById('progressText');
    inventarioInfo = document.getElementById('inventarioInfo');
    
    // Verifica che electronAPI sia disponibile
    if (!window.electronAPI) {
        console.error('❌ electronAPI non disponibile!');
        mostraAlert('❌ Errore: API non disponibile. Ricarica l\'app.', 'error');
        return;
    }
    
    console.log('✅ electronAPI disponibile');
    
    // Setup event listeners
    setupEventListeners();
    setupAutoSave();
    
    // Carica inventario
    mostraAlert('🔄 Caricamento inventario in corso...', 'info');
    window.electronAPI.caricaInventario();
}

function setupEventListeners() {
    console.log('🔧 Setup event listeners...');
    
    // Ascolta input scanner (tasto Enter)
    scannerInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            gestisciScansione();
        }
    });
    
    // Ascolta messaggi dal processo principale per l'ordine
    window.electronAPI.onOrdineCaricato((event, result) => {
        if (result.success) {
            ordineCorrente = result.data;
            filePathOrdineCorrente = result.filePath;
            nomeFileOrdineCorrente = result.fileName;
            
            fileInfo.innerHTML = `
                <strong>📁 Ordine caricato:</strong> ${result.fileName}<br>
                <strong>📦 Prodotti:</strong> ${result.data.length}
            `;
            
            prodottiScansionati.clear();
            aggiornaInterfaccia();
            mostraAlert(`✅ Ordine caricato: ${result.data.length} prodotti`, 'success');
            gestisciFocusScanner();
        } else {
            mostraAlert(`❌ Errore: ${result.error}`, 'error');
        }
    });
    
    // Ascolta messaggi dal processo principale per l'inventario
    window.electronAPI.onInventarioCaricato((event, result) => {
        if (result.success) {
            inventario = result.data;
            const count = inventario ? inventario.length : 0;
            inventarioInfo.innerHTML = `<small>✅ Inventario pronto: ${count} prodotti</small>`;
            
            if (count > 0) {
                mostraAlert(`✅ Inventario caricato: ${count} prodotti`, 'success');
            }
        } else {
            inventarioInfo.innerHTML = `<small>❌ Errore: ${result.error}</small>`;
            inventario = [];
            mostraAlert(`❌ Errore nel caricamento: ${result.error}`, 'error');
        }
    });

    // Ascolta messaggio di aggiornamento completato
    window.electronAPI.onAggiornamentoCompletato((event, result) => {
        if (result.success) {
            mostraAlert(`✅ ${result.message}`, 'success');
        }
    });

    // Ascolta richieste di conferma campo
    window.electronAPI.onRichiediConfermaCampo((event, data) => {
        // Gestione conferma campi (se necessario in futuro)
        console.log('Richiesta conferma campo:', data);
    });

    // Event delegation per la tabella
    ordineTable.addEventListener('click', function(e) {
        if (e.target.tagName === 'INPUT') {
            return;
        }
        
        if (e.target.classList.contains('modifica-quantita')) {
            const cod = e.target.getAttribute('data-codice');
            attivaInputQuantita(cod, e.target);
            return;
        }
        
        if (e.target.classList.contains('qty-btn')) {
            const cod = e.target.getAttribute('data-codice');
            const variazione = parseInt(e.target.getAttribute('data-variazione'));
            e.preventDefault();
            e.stopPropagation();
            modificaQuantita(cod, variazione);
            return;
        }
    });

    // Focus automatico
    document.addEventListener('click', function(e) {
        const inventarioModal = document.getElementById('inventarioModal');
        if (inventarioModal && inventarioModal.style.display === 'block') {
            return;
        }
        
        if (e.target.tagName !== 'INPUT' && 
            !e.target.classList.contains('modifica-quantita') && 
            !e.target.classList.contains('qty-btn') &&
            !isEditingQuantity && 
            !currentEditingInput) {
            
            setTimeout(() => {
                if (document.activeElement !== scannerInput) {
                    scannerInput.focus();
                }
            }, 50);
        }
    });

    // Tasto ESC per annullare modifica quantità
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && (isEditingQuantity || currentEditingInput)) {
            if (currentEditingInput && currentEditingInput.parentNode) {
                const originalElement = document.createElement('span');
                originalElement.className = 'modifica-quantita';
                originalElement.setAttribute('data-codice', currentEditingInput.getAttribute('data-codice'));
                originalElement.textContent = prodottiScansionati.get(currentEditingInput.getAttribute('data-codice')) || 0;
                originalElement.style.cssText = `
                    cursor: pointer; padding: 8px 12px; border-radius: 4px; 
                    background: rgba(255,255,255,0.9); border: 2px solid #3498db; 
                    display: inline-block; min-width: 60px; text-align: center; 
                    font-weight: bold; font-size: 1.2em; transition: all 0.2s ease; 
                    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                `;
                
                currentEditingInput.parentNode.replaceChild(originalElement, currentEditingInput);
            }
            isEditingQuantity = false;
            currentEditingInput = null;
            gestisciFocusScanner();
        }
    });
}

// FUNZIONE PER RINOMINARE L'ORDINE - ESPLICITAMENTE ESPOSTA
window.impostaNomeOrdine = function() {
    const nomeAttuale = nomeFileOrdineCorrente || 'Ordine senza nome';
    
    // Crea un modal per inserire il nome
    const modalHTML = `
        <div id="renameModal" style="position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:10000;">
            <div style="background:white;padding:20px;border-radius:10px;width:400px;">
                <h3>📝 Rinomina Ordine</h3>
                <p>Inserisci un nuovo nome per questo ordine:</p>
                <input type="text" id="newOrderName" value="${nomeAttuale}" style="width:100%;padding:10px;margin:10px 0;border:2px solid #3498db;border-radius:5px;font-size:16px;">
                <div style="text-align:right;margin-top:15px;">
                    <button onclick="annullaRinomina()" style="padding:8px 15px;margin-right:10px;background:#95a5a6;color:white;border:none;border-radius:5px;cursor:pointer;">Annulla</button>
                    <button onclick="confermaRinomina()" style="padding:8px 15px;background:#3498db;color:white;border:none;border-radius:5px;cursor:pointer;">Salva</button>
                </div>
            </div>
        </div>
    `;
    
    // Aggiungi il modal al body
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    // Focus sull'input
    setTimeout(() => {
        const input = document.getElementById('newOrderName');
        if (input) {
            input.focus();
            input.select();
        }
    }, 100);
};

// Aggiungi queste funzioni helper
function confermaRinomina() {
    const input = document.getElementById('newOrderName');
    if (!input) return;
    
    const nuovoNome = input.value.trim();
    
    if (nuovoNome === '') {
        mostraAlert('⚠️ Il nome non può essere vuoto', 'warning');
        return;
    }
    
    nomeFileOrdineCorrente = nuovoNome;
    
    // Rimuovi il modal
    const modal = document.getElementById('renameModal');
    if (modal) modal.remove();
    
    // Aggiorna l'interfaccia
    aggiornaInterfaccia();
    mostraAlert(`✅ Nome ordine cambiato in: "${nomeFileOrdineCorrente}"`, 'success');
}

function annullaRinomina() {
    const modal = document.getElementById('renameModal');
    if (modal) modal.remove();
}

// ============================================================================
// FUNZIONI PER GESTIONE INVENTARIO - SALVATAGGIO AUTOMATICO NEL DATABASE
// ============================================================================

function apriModuloInventario() {
    if (!inventario) {
        mostraAlert('❌ Inventario non caricato!', 'error');
        return;
    }
    
    creaModalInventario();
}

function creaModalInventario() {
    const existingModal = document.getElementById('inventarioModal');
    if (existingModal) {
        existingModal.remove();
    }
    
    const modalHTML = `
    <div id="inventarioModal" class="modal" style="display: block;">
        <div class="modal-content" style="max-width: 800px;">
            <div class="modal-header">
                <h3>📊 CONTROLLO INVENTARIO</h3>
                <button class="modal-close" onclick="chiudiModalInventario()">✕ Chiudi</button>
            </div>
            <div class="modal-body">
                <div class="scanner-section" style="margin: 0 0 20px 0;">
                    <h4>🔍 Scannerizza codice EAN o inserisci codice prodotto</h4>
                    <input type="text" id="scannerInventario" 
                           placeholder="Scansiona EAN o inserisci codice..."
                           autocomplete="off" style="width: 100%;">
                    <br>
                    <button class="btn btn-success" onclick="cercaProdottoInventario()" 
                            style="margin-top: 10px;">
                        🔍 Cerca Prodotto
                    </button>
                </div>
                
                <div id="dettaglioProdotto" style="display: none;">
                    <div class="section-header" style="margin-bottom: 15px;">
                        <span>📦 DETTAGLIO PRODOTTO</span>
                    </div>
                    
                    <div id="infoProdotto" style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin-bottom: 15px;">
                    </div>
                    
                    <div class="form-group" style="margin-top: 10px;">
                        <label><strong>🆕 Nuova Quantità Disponibile:</strong></label>
                        <input type="number" id="nuovaQuantita" min="0" 
                               style="width: 120px; padding: 8px; font-size: 1.2em; text-align: center; margin-left: 10px;">
                    </div>
                    
                    <div class="form-group" style="margin-top: 15px;">
                        <label><strong>➕ Aggiungi Nuovo EAN:</strong></label>
                        <input type="text" id="nuovoEANInput" placeholder="Inserisci nuovo codice EAN..."
                               style="width: 200px; padding: 8px; margin-left: 10px;">
                        <button class="btn" onclick="aggiungiEAN()" style="margin-left: 10px;">
                            ➕ Aggiungi EAN
                        </button>
                    </div>
                    
                    <div style="text-align: center; margin-top: 20px;">
                        <button class="btn btn-success" onclick="confermaAggiornamentoInventario()">
                            ✅ Salva Modifiche
                        </button>
                        <button class="btn btn-warning" onclick="annullaModificaInventario()" 
                                style="margin-left: 10px;">
                            ❌ Annulla
                        </button>
                    </div>
                </div>
                
                <div id="nessunProdotto" style="display: none; text-align: center; padding: 40px; color: #7f8c8d;">
                    <p>🔍 Nessun prodotto trovato con il codice inserito</p>
                    <button class="btn" onclick="creaNuovoProdotto()">
                        ➕ Crea Nuovo Prodotto
                    </button>
                </div>
            </div>
        </div>
    </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    // Disabilita scanner principale
    scannerInput.disabled = true;
    scannerInput.style.opacity = '0.5';
    scannerInput.placeholder = 'Scanner disabilitato - Modal Inventario aperto';
    
    // Setup event listener per Enter
    const scannerInventario = document.getElementById('scannerInventario');
    scannerInventario.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            cercaProdottoInventario();
        }
    });
    
    setTimeout(() => {
        scannerInventario.focus();
    }, 100);
}

// FUNZIONE MIGLIORATA CHE VERIFICA IL SALVATAGGIO
async function salvaModificheInventario() {
    if (!inventario) {
        mostraAlert('❌ Nessun inventario da salvare', 'error');
        return false;
    }
    
    try {
        console.log('💾 Tentativo di salvataggio...');
        console.log('Inventario da salvare:', inventario.length, 'prodotti');
        
        // DEBUG: Verifica che l'API esista
        if (!window.electronAPI || !window.electronAPI.salvaInventario) {
            console.error('❌ API salvaInventario non trovata!');
            mostraAlert('❌ Errore: API non disponibile', 'error');
            return false;
        }
        
        console.log('📡 Chiamando API salvaInventario...');
        const result = await window.electronAPI.salvaInventario(inventario);
        console.log('Risultato API:', result);
        
        if (result && result.success) {
            console.log('✅ Inventario salvato!');
            mostraAlert('💾 Modifiche salvate correttamente', 'success');
            return true;
        } else {
            console.error('❌ Errore API:', result?.error);
            mostraAlert(`❌ Errore salvataggio: ${result?.error || 'Sconosciuto'}`, 'error');
            return false;
        }
    } catch (error) {
        console.error('❌ Eccezione durante salvataggio:', error);
        mostraAlert(`❌ Errore di connessione: ${error.message}`, 'error');
        return false;
    }
}

function cercaProdottoInventario() {
    const scannerInventario = document.getElementById('scannerInventario');
    const codice = scannerInventario.value.trim();
    
    if (!codice) {
        mostraAlert('⚠️ Inserisci un codice', 'warning');
        return;
    }
    
    const prodotto = cercaProdottoInInventarioCompleto(codice);
    
    if (prodotto) {
        window.prodottoInInventario = prodotto;
        mostraDettaglioProdotto(prodotto);
        document.getElementById('nessunProdotto').style.display = 'none';
        mostraAlert('✅ Prodotto trovato', 'success');
    } else {
        window.prodottoInInventario = null;
        document.getElementById('dettaglioProdotto').style.display = 'none';
        
        // ✅ VERSIONE RESTRITTIVA: Solo messaggio, NESSUN pulsante
        document.getElementById('nessunProdotto').style.display = 'block';
        document.getElementById('nessunProdotto').innerHTML = `
            <div style="text-align: center; padding: 30px; color: #e74c3c;">
                <div style="font-size: 3em; margin-bottom: 10px;">❌</div>
                <p style="font-weight: bold; font-size: 1.2em;">CODICE NON TROVATO</p>
                <p style="color: #7f8c8d; margin-top: 10px;">
                    Il codice <strong>"${codice}"</strong> non esiste nell'inventario.
                </p>
                <p style="color: #95a5a6; font-size: 0.9em; margin-top: 15px;">
                    Controlla il codice e riprova.
                </p>
            </div>
        `;
        
        mostraAlert('❌ Codice non trovato', 'error');
    }
    
    scannerInventario.focus();
}

function cercaProdottoInInventarioCompleto(codice) {
    if (!inventario || !codice) return null;
    
    const codiceClean = codice.toString().trim().toUpperCase();
    
    return inventario.find(prodotto => {
        const codProdotto = (prodotto['Cod.'] || prodotto.Cod || '').toString().trim().toUpperCase();
        if (codProdotto === codiceClean) {
            return true;
        }
        
        let eanArray = [];
        if (Array.isArray(prodotto['Cod. a barre'])) {
            eanArray = prodotto['Cod. a barre'];
        } else if (prodotto['Cod. a barre']) {
            eanArray = [prodotto['Cod. a barre']];
        }
        
        // ✅ AGGIUNTA VALIDAZIONE PER VALORI NULL
        return eanArray.some(ean => ean && ean.toString().trim().toUpperCase() === codiceClean);
    });
}

function mostraDettaglioProdotto(prodotto) {
    const eanArray = Array.isArray(prodotto['Cod. a barre']) ? prodotto['Cod. a barre'] : 
                    (prodotto['Cod. a barre'] ? [prodotto['Cod. a barre']] : []);
    
    const infoHTML = `
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 0.95em;">
            <div><strong>Codice:</strong> ${prodotto['Cod.'] || 'N/A'}</div>
            <div><strong>Quantità attuale:</strong> ${prodotto['Q.tà disponibile'] || 0}</div>
            <div><strong>Prezzo:</strong> ${prodotto['Listino 1 (ivato)'] || '0'} €</div>
            <div><strong>IVA:</strong> ${prodotto['Cod. Iva'] || 'N/A'}%</div>
            <div><strong>UDM:</strong> ${prodotto['Cod. Udm'] || 'Pz'}</div>
            <div colspan="2" style="grid-column: 1 / span 2;">
                <strong>Descrizione:</strong><br>${prodotto.Descrizione || 'N/A'}
            </div>
        </div>
        
        <div style="margin-top: 15px; border-top: 1px solid #ddd; padding-top: 15px;">
            <strong>🏷️ Codici EAN Associati:</strong>
            <div id="listaEAN" style="max-height: 120px; overflow-y: auto; margin-top: 10px; border: 1px solid #ddd; border-radius: 5px; padding: 10px; background: white;">
                ${eanArray.length > 0 ? 
                  eanArray.map((ean, index) => `
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px; border-bottom: 1px solid #eee; margin-bottom: 5px;">
                        <span style="font-family: monospace; font-size: 1.1em;">${ean}</span>
                        <button class="btn btn-warning" onclick="eliminaEAN(${index})" 
                                style="padding: 4px 8px; font-size: 0.8em; background: #e74c3c; color: white; border: none; border-radius: 3px; cursor: pointer;">
                            🗑️ Elimina
                        </button>
                    </div>
                  `).join('') :
                  '<div style="text-align: center; color: #777; padding: 15px; font-style: italic;">Nessun EAN registrato</div>'
                }
            </div>
        </div>
    `;
    
    document.getElementById('infoProdotto').innerHTML = infoHTML;
    document.getElementById('nuovaQuantita').value = prodotto['Q.tà disponibile'] || 0;
    document.getElementById('nuovoEANInput').value = '';
    
    document.getElementById('dettaglioProdotto').style.display = 'block';
    document.getElementById('nessunProdotto').style.display = 'none';
}

async function aggiungiEAN() {
    if (!window.prodottoInInventario) {
        mostraAlert('❌ Nessun prodotto selezionato', 'error');
        return;
    }
    
    const nuovoEANInput = document.getElementById('nuovoEANInput');
    const nuovoEAN = nuovoEANInput.value.trim();
    
    if (!nuovoEAN) {
        mostraAlert('⚠️ Inserisci un codice EAN', 'warning');
        return;
    }
    
    // Verifica se l'EAN è già presente
    let eanArray = [];
    if (Array.isArray(window.prodottoInInventario['Cod. a barre'])) {
        eanArray = window.prodottoInInventario['Cod. a barre'];
    } else if (window.prodottoInInventario['Cod. a barre']) {
        eanArray = [window.prodottoInInventario['Cod. a barre']];
    }
    
    const eanEsistente = eanArray.find(ean => ean && ean.toString().trim() === nuovoEAN);
    
    if (eanEsistente) {
        mostraAlert('❌ EAN già esistente', 'error');
        return;
    }
    
    // Aggiungi EAN all'array in memoria
    eanArray.push(nuovoEAN);
    window.prodottoInInventario['Cod. a barre'] = eanArray;
    
    // Aggiorna la visualizzazione
    mostraDettaglioProdotto(window.prodottoInInventario);
    nuovoEANInput.value = '';
    
    // SALVA AUTOMATICAMENTE NEL DATABASE
    const salvato = await salvaModificheInventario();
    
    if (salvato) {
        mostraAlert(`✅ EAN ${nuovoEAN} aggiunto e salvato nel database`, 'success');
    } else {
        // Se il salvataggio fallisce, rimuovi l'EAN
        const index = eanArray.indexOf(nuovoEAN);
        if (index !== -1) {
            eanArray.splice(index, 1);
        }
        mostraAlert('❌ Errore nel salvataggio', 'error');
    }
}

async function eliminaEAN(index) {
    if (!window.prodottoInInventario) {
        mostraAlert('❌ Nessun prodotto selezionato', 'error');
        return;
    }
    
    const conferma = confirm('Sei sicuro di voler eliminare questo EAN?');
    if (!conferma) return;
    
    let eanArray = [];
    if (Array.isArray(window.prodottoInInventario['Cod. a barre'])) {
        eanArray = window.prodottoInInventario['Cod. a barre'];
    } else if (window.prodottoInInventario['Cod. a barre']) {
        eanArray = [window.prodottoInInventario['Cod. a barre']];
    }
    
    const eanEliminato = eanArray[index];
    
    // Rimuovi EAN dall'array in memoria
    eanArray.splice(index, 1);
    window.prodottoInInventario['Cod. a barre'] = eanArray;
    
    // Aggiorna la visualizzazione
    mostraDettaglioProdotto(window.prodottoInInventario);
    
    // SALVA AUTOMATICAMENTE NEL DATABASE
    const salvato = await salvaModificheInventario();
    
    if (salvato) {
        mostraAlert(`✅ EAN ${eanEliminato} eliminato e salvato nel database`, 'success');
    } else {
        // Se il salvataggio fallisce, ripristina l'EAN
        eanArray.splice(index, 0, eanEliminato);
        mostraAlert('❌ Errore nel salvataggio', 'error');
    }
}

// QUESTA È LA FUNZIONE CHE SALVA LA QUANTITÀ NEL DATABASE
async function confermaAggiornamentoInventario() {
    if (!window.prodottoInInventario) {
        mostraAlert('❌ Nessun prodotto selezionato', 'error');
        return;
    }
    
    const nuovaQuantita = parseInt(document.getElementById('nuovaQuantita').value) || 0;
    
    if (nuovaQuantita < 0) {
        mostraAlert('❌ La quantità non può essere negativa', 'error');
        return;
    }
    
    // Aggiorna la quantità nell'array in memoria
    window.prodottoInInventario['Q.tà disponibile'] = nuovaQuantita;
    
    // Trova il prodotto nell'array inventario e aggiornalo
    const index = inventario.findIndex(p => p['Cod.'] === window.prodottoInInventario['Cod.']);
    if (index !== -1) {
        inventario[index] = window.prodottoInInventario;
        
        // SALVA AUTOMATICAMENTE NEL DATABASE
        const salvato = await salvaModificheInventario();
        
        if (salvato) {
            mostraAlert(`✅ Quantità aggiornata a ${nuovaQuantita} e salvata nel database!`, 'success');
        } else {
            mostraAlert('❌ Errore nel salvataggio delle modifiche', 'error');
        }
    } else {
        mostraAlert('❌ Prodotto non trovato nell\'inventario', 'error');
    }
}

function annullaModificaInventario() {
    document.getElementById('scannerInventario').value = '';
    document.getElementById('dettaglioProdotto').style.display = 'none';
    document.getElementById('nessunProdotto').style.display = 'none';
    window.prodottoInInventario = null;
    
    const scannerInventario = document.getElementById('scannerInventario');
    if (scannerInventario) {
        scannerInventario.focus();
    }
}

function chiudiModalInventario() {
    const inventarioModal = document.getElementById('inventarioModal');
    if (inventarioModal) {
        inventarioModal.style.display = 'none';
    }
    
    // Riabilita scanner principale
    scannerInput.disabled = false;
    scannerInput.style.opacity = '1';
    scannerInput.placeholder = 'Scansiona codice EAN o Codice Prodotto...';
    
    setTimeout(() => {
        scannerInput.focus();
    }, 100);
}

async function creaNuovoProdotto() {
    const codice = document.getElementById('scannerInventario').value.trim();
    
    if (!codice) {
        mostraAlert('⚠️ Inserisci un codice', 'warning');
        return;
    }
    
    // Controlla se il codice esiste già (doppio controllo)
    const codiceEsistente = inventario.find(p => p['Cod.'] && p['Cod.'].toString().trim().toUpperCase() === codice.toUpperCase());
    
    if (codiceEsistente) {
        mostraAlert(`❌ Codice già esistente: ${codiceEsistente.Descrizione}`, 'error');
        // Mostra il prodotto esistente
        window.prodottoInInventario = codiceEsistente;
        mostraDettaglioProdotto(codiceEsistente);
        document.getElementById('nessunProdotto').style.display = 'none';
        return;
    }
    
    const descrizione = prompt('Inserisci la descrizione del nuovo prodotto:');
    if (!descrizione) {
        mostraAlert('❌ Descrizione obbligatoria', 'error');
        return;
    }
    
    // Crea nuovo prodotto nell'array in memoria
    const nuovoProdotto = {
        'Cod.': codice,
        'Descrizione': descrizione,
        'Cod. Udm': 'Pz',
        'Cod. a barre': [],
        'Q.tà disponibile': 0,
        'Listino 1 (ivato)': 0,
        'Cod. Iva': '22'
    };
    
    inventario.push(nuovoProdotto);
    window.prodottoInInventario = nuovoProdotto;
    
    // SALVA AUTOMATICAMENTE NEL DATABASE
    const salvato = await salvaModificheInventario();
    
    if (salvato) {
        mostraDettaglioProdotto(nuovoProdotto);
        document.getElementById('nessunProdotto').style.display = 'none';
        mostraAlert(`✅ Prodotto "${descrizione}" creato e salvato nel database!`, 'success');
        
        // Reset campo di ricerca
        document.getElementById('scannerInventario').value = '';
    } else {
        // Se il salvataggio fallisce, rimuovi il prodotto
        const index = inventario.indexOf(nuovoProdotto);
        if (index !== -1) {
            inventario.splice(index, 1);
        }
        mostraAlert('❌ Errore nella creazione del prodotto', 'error');
    }
}

// ============================================================================
// FUNZIONI PER PICKING
// ============================================================================

function gestisciFocusScanner() {
    if (isEditingQuantity || currentEditingInput) {
        return;
    }
    
    setTimeout(() => {
        if (scannerInput && document.activeElement !== scannerInput) {
            scannerInput.focus();
        }
    }, 50);
}

function cercaProdotto(codice) {
    if (!inventario) {
        console.log('Inventario non caricato');
        return null;
    }
    
    const codiceClean = codice.toString().trim().toUpperCase();
    
    return inventario.find(p => {
        const codInv1 = p.Cod ? p.Cod.toString().trim().toUpperCase() : '';
        const codInv2 = p['Cod.'] ? p['Cod.'].toString().trim().toUpperCase() : '';
        
        let eanArray = [];
        if (Array.isArray(p['Cod. a barre'])) {
            eanArray = p['Cod. a barre'];
        } else if (p['Cod. a barre']) {
            eanArray = [p['Cod. a barre']];
        }
        
        return codInv1 === codiceClean || 
               codInv2 === codiceClean || 
               eanArray.some(ean => ean && ean.toString().trim().toUpperCase() === codiceClean);
    });
}

function gestisciScansione() {
    const codice = scannerInput.value.trim();
    
    if (!codice) {
        mostraAlert('⚠️ Inserisci un codice', 'warning');
        scannerInput.focus();
        return;
    }
    
    if (!inventario) {
        mostraAlert('❌ Inventario non caricato!', 'error');
        scannerInput.value = '';
        scannerInput.focus();
        return;
    }
    
    const prodotto = cercaProdotto(codice);
    
    if (!prodotto) {
        mostraAlert('❌ Codice non trovato!', 'error');
        scannerInput.value = '';
        scannerInput.focus();
        return;
    }
    
    const prodottoInOrdine = ordineCorrente ? ordineCorrente.find(p => {
        const codOrd = (p.Cod || p['Cod.'] || '').toString().trim().toUpperCase();
        const codProdotto = (prodotto.Cod || prodotto['Cod.'] || '').toString().trim().toUpperCase();
        return codOrd === codProdotto;
    }) : null;
    
    if (!prodottoInOrdine && ordineCorrente && ordineCorrente.length > 0) {
        const descrizione = prodotto.Descrizione || prodotto.Desc || prodotto['Desc.'] || 'Prodotto';
        const codProdotto = prodotto.Cod || prodotto['Cod.'] || 'N/A';
        
        const conferma = confirm(
            `⚠️ PRODOTTO NON NELL'ORDINE\n\nCodice: ${codProdotto}\nDescrizione: ${descrizione}\n\nAggiungere comunque?`
        );
        
        if (conferma) {
            aggiungiProdottoScansionato(prodotto);
        } else {
            mostraAlert('❌ Scansione annullata', 'warning');
        }
    } else {
        aggiungiProdottoScansionato(prodotto);
    }
    
    scannerInput.value = '';
}

async function selezionaFileOrdine() {
    try {
        // Chiedi conferma se c'è un ordine in corso
        if ((ordineCorrente && ordineCorrente.length > 0) || prodottiScansionati.size > 0) {
            const conferma = confirm(
                '⚠️ C\'È UN ORDINE IN CORSO!\n\nSe carichi un nuovo ordine, i dati correnti verranno persi.\n\nVuoi continuare?'
            );
            if (!conferma) {
                return;
            }
        }
        
        // RESET PRIMA di caricare il nuovo file
        ordineCorrente = null;
        prodottiScansionati.clear();
        filePathOrdineCorrente = null;
        nomeFileOrdineCorrente = null;
        
        // FORZA UN AGGIORNAMENTO VISUALE IMMEDIATO
        aggiornaInterfaccia();
        
        mostraAlert('📁 Seleziona file ordine...', 'info');
        const result = await window.electronAPI.selezionaFileOrdine();
        
        if (result && result.success) {
            ordineCorrente = result.data;
            filePathOrdineCorrente = result.filePath;
            nomeFileOrdineCorrente = result.fileName;
            
            prodottiScansionati.clear();
            aggiornaInterfaccia();
            mostraAlert(`✅ Ordine "${result.fileName}" caricato`, 'success');
            gestisciFocusScanner();
        } else {
            mostraAlert(`❌ Errore: ${result?.error || 'Sconosciuto'}`, 'error');
        }
    } catch (error) {
        mostraAlert(`❌ Errore: ${error.message}`, 'error');
    }
}

function creaOrdineVuoto() {
    console.log('🔄 CREA ORDINE VUOTO - Reset FORZATO');
    
    // Controlla se c'è un ordine in corso
    const hasActiveOrder = (ordineCorrente && ordineCorrente.length > 0) || prodottiScansionati.size > 0;
    
    if (hasActiveOrder) {
        // Usa la conferma di Electron invece di prompt()
        const choice = confirm(
            '⚠️ C\'È UN ORDINE IN CORSO!\n\n' +
            'Se procedi, l\'ordine corrente verrà perso.\n\n' +
            'Vuoi continuare?'
        );
        
        if (!choice) {
            console.log('❌ Creazione ordine annullata');
            return;
        }
    }
    
    // Reset IMMEDIATO di TUTTE le variabili
    ordineCorrente = [];
    prodottiScansionati.clear();
    filePathOrdineCorrente = null;
    nomeFileOrdineCorrente = 'Ordine Vuoto ' + new Date().toLocaleDateString();
    
    console.log('✅ NUOVO ORDINE VUOTO CREATO:', nomeFileOrdineCorrente);
    
    // FORZA il reset visuale
    fileInfo.innerHTML = `
        <strong>📁 Ordine:</strong> 
        <span style="cursor: pointer; color: #3498db; text-decoration: underline;" 
              onclick="impostaNomeOrdine()" 
              title="Clicca per rinominare">
            ${nomeFileOrdineCorrente}
        </span>
        <br>
        <strong>📦 Prodotti scansionati:</strong> 0
    `;
    
    // RESET COMPLETO della tabella
    ordineTable.innerHTML = `
        <div style="text-align: center; padding: 60px; background: #f8f9fa; border-radius: 10px; border: 2px dashed #9b59b6;">
            <div style="font-size: 4em; margin-bottom: 15px;">🎯</div>
            <div style="font-weight: bold; font-size: 1.3em; color: #9b59b6; margin-bottom: 10px;">Ordine Vuoto Creato</div>
            <div style="color: #7f8c8d; margin-bottom: 5px;">Nome: ${nomeFileOrdineCorrente}</div>
            <div style="color: #95a5a6; font-size: 0.9em; margin-top: 15px;">Inizia a scansionare prodotti usando lo scanner</div>
        </div>
    `;
    
    // Reset progresso
    progressFill.style.width = '0%';
    progressText.textContent = '0%';
    counterOrdine.textContent = '0 prodotti';
    
    statusInfo.innerHTML = `
        <span style="color: #9b59b6; font-weight: bold;">🟣 ORDINE VUOTO CREATO</span>
        <br><small>Nome: ${nomeFileOrdineCorrente}</small>
        <br><small>📦 Prodotti scansionati: 0</small>
    `;
    
    mostraAlert(`✅ Ordine vuoto "${nomeFileOrdineCorrente}" creato`, 'success');
    setTimeout(() => scannerInput.focus(), 100);
}
function anteprimaOrdine() {
    if ((!ordineCorrente || ordineCorrente.length === 0) && prodottiScansionati.size === 0) {
        mostraAlert('❌ Nessun ordine caricato!', 'error');
        return;
    }
    
    let anteprimaHTML = '';
    
    if (ordineCorrente && ordineCorrente.length > 0) {
        ordineCorrente.forEach((prodotto, index) => {
            const cod = (prodotto.Cod || prodotto['Cod.'] || `RIGA-${index + 1}`).toString().trim();
            const descrizione = prodotto.Descrizione || prodotto.Desc || prodotto['Desc.'] || 'Descrizione non disponibile';
            const ordinato = prodotto['Q.tà'] || prodotto.Quantità || prodotto.Qtà || 0;
            const scansionato = prodottiScansionati.get(cod) || 0;
            
            let stato, classe, extraInfo = '';
            if (scansionato > ordinato) {
                stato = '🟢 EXTRA (' + (scansionato - ordinato) + ' in più)';
                classe = 'extra';
                extraInfo = `<br><small style="color: #2e7d32; font-weight: bold;">⚠️ ATTENZIONE: ${scansionato - ordinato} unità in più rispetto all'ordine</small>`;
            } else if (scansionato === ordinato) {
                stato = '✅ COMPLETATO';
                classe = 'completato';
            } else if (scansionato > 0) {
                stato = '🟡 PARZIALE';
                classe = 'parziale';
            } else {
                stato = '❌ MANCANTE';
                classe = 'mancante';
            }
            
            anteprimaHTML += `
                <div class="anteprima-item ${classe}">
                    <strong>${cod}: ${descrizione}</strong><br>
                    <small>Ordinato: ${ordinato} | Scansionato: ${scansionato}</small>
                    ${extraInfo}
                    <br><strong>${stato}</strong>
                </div>
            `;
        });
    }
    
    const prodottiExtra = Array.from(prodottiScansionati.entries()).filter(([cod, quantita]) => {
        const codClean = cod.toString().trim();
        if (!ordineCorrente || ordineCorrente.length === 0) return true;
        return !ordineCorrente.find(p => {
            const codOrd = (p.Cod || p['Cod.'] || '').toString().trim();
            return codOrd === codClean;
        });
    });
    
    if (prodottiExtra.length > 0) {
        if (ordineCorrente && ordineCorrente.length > 0) {
            anteprimaHTML += `<div style="margin-top: 20px; padding-top: 10px; border-top: 2px solid #9b59b6;"><strong>📦 PRODOTTI EXTRA (NON IN ORDINE):</strong></div>`;
        } else {
            anteprimaHTML += `<div style="margin-bottom: 15px;"><strong>📦 PRODOTTI NELL'ORDINE VUOTO:</strong></div>`;
        }
        
        prodottiExtra.forEach(([cod, quantita]) => {
            const prodotto = inventario ? cercaProdotto(cod) : null;
            const descrizione = prodotto ? 
                (prodotto.Descrizione || prodotto.Desc || prodotto['Desc.'] || 'Descrizione non disponibile') : 
                'Prodotto non in inventario';
            
            anteprimaHTML += `
                <div class="anteprima-item" style="border-left-color: #9b59b6; background: #e8f4fd;">
                    <strong>${cod}: ${descrizione}</strong><br>
                    <small>Quantità scansionata: ${quantita}</small><br>
                    <strong style="color: #8e44ad;">🟣 ${ordineCorrente && ordineCorrente.length > 0 ? 'PRODOTTO EXTRA' : 'PRODOTTO AGGIUNTO'}</strong>
                </div>
            `;
        });
    }
    
    document.getElementById('anteprimaContent').innerHTML = anteprimaHTML;
    document.getElementById('anteprimaModal').style.display = 'block';
}

function chiudiAnteprima() {
    document.getElementById('anteprimaModal').style.display = 'none';
}

async function completaPicking() {
    if ((!ordineCorrente || ordineCorrente.length === 0) && prodottiScansionati.size === 0) {
        mostraAlert('❌ Nessun ordine caricato!', 'error');
        return;
    }
    
    let messaggioConferma = '⚠️ CONFERMA CREAZIONE DDT\n\n';
    
    if (ordineCorrente && ordineCorrente.length > 0) {
        messaggioConferma += `Ordine: ${nomeFileOrdineCorrente || 'Senza nome'}\n`;
        messaggioConferma += '• Prodotti in ordine: ' + ordineCorrente.length + '\n';
        messaggioConferma += '• Prodotti scansionati: ' + prodottiScansionati.size + '\n\n';
    } else {
        messaggioConferma += `Ordine: ${nomeFileOrdineCorrente || 'Ordine Vuoto'}\n`;
        messaggioConferma += '• Prodotti scansionati: ' + prodottiScansionati.size + '\n\n';
    }
    
    messaggioConferma += 'Sei sicuro di voler procedere?';
    
    const conferma = confirm(messaggioConferma);
    if (!conferma) {
        return;
    }
    
    if (prodottiScansionati.size === 0) {
        const confermaVuoto = confirm(
            '⚠️ Nessun prodotto scansionato!\n\nProcedere comunque?'
        );
        if (!confermaVuoto) {
            return;
        }
    }
    
    try {
        const datiDDT = [];
        
        if (ordineCorrente && ordineCorrente.length > 0) {
            // AGGIUNGI PRODOTTI DELL'ORDINE
            ordineCorrente.forEach(prodotto => {
                const cod = (prodotto.Cod || prodotto['Cod.'] || '').toString().trim();
                const scansionato = prodottiScansionati.get(cod) || 0;
                
                if (scansionato === 0) return;
                
                const descrizione = prodotto.Descrizione || prodotto.Desc || prodotto['Desc.'] || '';
                const prezzoIvato = prodotto['Prezzo ivato'] || prodotto.Prezzo || '';
                const sconti = prodotto.Sconti || '';
                const iva = prodotto.Iva || '';
                
                const rigaDDT = {
                    'Cod.': cod,
                    'Descrizione': descrizione,
                    'Q.tà': scansionato,
                    'Prezzo ivato': prezzoIvato,
                    'U.m.': 'Pz',
                    'Sconti': sconti,
                    'Iva': iva,
                    'Mag.': 'Si',
                    'Importo ivato': ''
                };
                
                datiDDT.push(rigaDDT);
            });
            
            // AGGIUNGI PRODOTTI EXTRA
            const codiciOrdine = new Set();
            ordineCorrente.forEach(prodotto => {
                const cod = (prodotto.Cod || prodotto['Cod.'] || '').toString().trim();
                if (cod) codiciOrdine.add(cod);
            });
            
            Array.from(prodottiScansionati.entries()).forEach(([cod, quantita]) => {
                if (quantita === 0) return;
                
                const codClean = cod.toString().trim();
                if (!codiciOrdine.has(codClean)) {
                    const prodottoInv = inventario ? cercaProdotto(cod) : null;
                    const descrizione = prodottoInv ? 
                        (prodottoInv.Descrizione || prodottoInv.Desc || prodottoInv['Desc.'] || '') : 
                        'Prodotto non in inventario';
                    
                    const prezzoIvato = prodottoInv ? (prodottoInv['Listino 1 (ivato)'] || '') : '';
                    const iva = prodottoInv ? (prodottoInv['Cod. Iva'] || '') : '';
                    
                    const rigaExtra = {
                        'Cod.': cod,
                        'Descrizione': descrizione + ' (EXTRA)',
                        'Q.tà': quantita,
                        'Prezzo ivato': prezzoIvato,
                        'U.m.': 'Pz',
                        'Sconti': '',
                        'Iva': iva,
                        'Mag.': 'Si',
                        'Importo ivato': ''
                    };
                    
                    datiDDT.push(rigaExtra);
                }
            });
        } else {
            // ORDINE VUOTO - AGGIUNGI TUTTI I PRODOTTI SCANSIONATI
            prodottiScansionati.forEach((quantita, cod) => {
                if (quantita === 0) return;
                
                const prodottoInv = inventario ? cercaProdotto(cod) : null;
                const descrizione = prodottoInv ? 
                    (prodottoInv.Descrizione || prodottoInv.Desc || prodottoInv['Desc.'] || '') : 
                    'Prodotto non in inventario';
                
                const prezzoIvato = prodottoInv ? (prodottoInv['Listino 1 (ivato)'] || '') : '';
                const iva = prodottoInv ? (prodottoInv['Cod. Iva'] || '') : '';
                
                const rigaDDT = {
                    'Cod.': cod,
                    'Descrizione': descrizione,
                    'Q.tà': quantita,
                    'Prezzo ivato': prezzoIvato,
                    'U.m.': 'Pz',
                    'Sconti': '',
                    'Iva': iva,
                    'Mag.': 'Si',
                    'Importo ivato': ''
                };
                
                datiDDT.push(rigaDDT);
            });
        }
        
        // SE NON CI SONO PRODOTTI, AGGIUNGI UNA RIGA VUOTA
        if (datiDDT.length === 0) {
            datiDDT.push({
                'Cod.': 'NESSUN_PRODOTTO',
                'Descrizione': 'Nessun prodotto scansionato durante il picking',
                'Q.tà': 0,
                'Prezzo ivato': '',
                'U.m.': 'Pz',
                'Sconti': '',
                'Iva': '',
                'Mag.': 'Si',
                'Importo ivato': ''
            });
        }
        
        // USA IL NOME PERSONALIZZATO DELL'ORDINE
        let nomeFileOriginale = nomeFileOrdineCorrente || 'Ordine_Vuoto';
        
        const result = await window.electronAPI.creaDDT(datiDDT, nomeFileOriginale, filePathOrdineCorrente);

        if (result.success) {
            mostraAlert(`✅ DDT creato: ${result.fileName}`, 'success');
            
            // RESET COMPLETO DI TUTTE LE VARIABILI
            ordineCorrente = null;
            prodottiScansionati.clear();
            nomeFileOrdineCorrente = null;
            filePathOrdineCorrente = null;
            
            // AGGIORNA L'INTERFACCIA
            aggiornaInterfaccia();
            
            setTimeout(() => {
                mostraAlert('🎉 Picking completato!', 'success');
            }, 1000);
            
        } else {
            mostraAlert(`❌ Errore: ${result.error}`, 'error');
        }
        
    } catch (error) {
        console.error('❌ Errore durante il completamento del picking:', error);
        mostraAlert(`❌ Errore durante il completamento: ${error.message}`, 'error');
    }
}

async function caricaInventario() {
    try {
        mostraAlert('📂 Caricamento inventario...', 'info');
        const result = await window.electronAPI.caricaInventario();
        
        if (result && result.success) {
            mostraAlert('✅ Inventario caricato!', 'success');
        } else {
            mostraAlert('❌ Errore nel caricamento', 'error');
        }
    } catch (error) {
        mostraAlert(`❌ Errore: ${error.message}`, 'error');
    }
}

async function aggiornaInventario() {
    try {
        mostraAlert('📁 Seleziona file Excel per creare/aggiornare inventario...', 'info');
        const result = await window.electronAPI.aggiornaInventario();
        
        if (result && result.success) {
            mostraAlert(`✅ ${result.message}`, 'success');
        } else {
            mostraAlert(`❌ Errore: ${result.error}`, 'error');
        }
    } catch (error) {
        mostraAlert(`❌ Errore: ${error.message}`, 'error');
    }
}

async function aggiornaInventarioConfronto() {
    try {
        const result = await window.electronAPI.aggiornaInventarioConfronto();
        if (result.success) {
            mostraAlert(`✅ ${result.messaggio}`, 'success');
        } else {
            mostraAlert(`❌ Errore: ${result.error}`, 'error');
        }
    } catch (error) {
        mostraAlert(`❌ Errore: ${error.message}`, 'error');
    }
}

async function esportaInventario() {
    try {
        if (!inventario || inventario.length === 0) {
            mostraAlert('❌ Nessun inventario da esportare', 'error');
            return;
        }
        
        const conferma = confirm(`Esportare ${inventario.length} prodotti in Excel?`);
        if (!conferma) return;
        
        const result = await window.electronAPI.esportaInventario();
        
        if (result.success) {
            mostraAlert(`✅ Inventario esportato: ${result.fileName}`, 'success');
        } else {
            mostraAlert(`❌ Errore: ${result.error}`, 'error');
        }
        
    } catch (error) {
        mostraAlert(`❌ Errore: ${error.message}`, 'error');
    }
}

async function apriCartellaDDT() {
    try {
        const result = await window.electronAPI.apriCartellaDDT();
        if (result.success) {
            mostraAlert('📁 Cartella DDT aperta', 'success');
        } else {
            mostraAlert(`❌ Errore: ${result.error}`, 'error');
        }
    } catch (error) {
        mostraAlert(`❌ Errore: ${error.message}`, 'error');
    }
}

function aggiungiProdottoScansionato(prodotto) {
    const cod = (prodotto.Cod || prodotto['Cod.']).toString().trim();
    const quantitaAttuale = prodottiScansionati.get(cod) || 0;
    prodottiScansionati.set(cod, quantitaAttuale + 1);
    
    const descrizione = prodotto.Descrizione || prodotto.Desc || prodotto['Desc.'] || 'Prodotto';
    mostraAlert(`✅ ${descrizione} aggiunto (quantità: ${quantitaAttuale + 1})`, 'success');
    
    aggiornaInterfaccia();
    gestisciFocusScanner();
}

function modificaQuantita(cod, variazione) {
    const quantitaAttuale = prodottiScansionati.get(cod) || 0;
    const nuovaQuantita = Math.max(0, quantitaAttuale + variazione);
    
    if (nuovaQuantita === 0) {
        prodottiScansionati.delete(cod);
        mostraAlert(`❌ Prodotto ${cod} rimosso`, 'success');
    } else {
        prodottiScansionati.set(cod, nuovaQuantita);
        mostraAlert(`✅ Quantità ${cod} aggiornata: ${nuovaQuantita}`, 'success');
    }
    
    aggiornaInterfaccia();
}

function attivaInputQuantita(cod, element) {
    const quantitaAttuale = prodottiScansionati.get(cod) || 0;
    
    const input = document.createElement('input');
    input.type = 'number';
    input.value = quantitaAttuale;
    input.min = '0';
    input.className = 'quantita-input-manuale';
    input.style.cssText = `
        width: 80px; padding: 8px; border: 2px solid #3498db; border-radius: 4px;
        text-align: center; font-size: 1.2em; font-weight: bold; background: white;
        box-shadow: 0 2px 5px rgba(0,0,0,0.2);
    `;
    
    element.parentNode.replaceChild(input, element);
    input.focus();
    input.select();
    
    isEditingQuantity = true;
    currentEditingInput = input;
    
    input.addEventListener('click', function(e) {
        e.stopPropagation();
    });
    
    const confermaHandler = function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            confermaModificaQuantita(input, cod);
        }
    };
    input.addEventListener('keypress', confermaHandler);
    
    const annullaHandler = function(e) {
        if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            annullaModificaQuantita(input, element, quantitaAttuale);
        }
    };
    input.addEventListener('keydown', annullaHandler);
    
    input.addEventListener('blur', function(e) {
        setTimeout(() => {
            confermaModificaQuantita(input, cod);
        }, 200);
    });
}

function confermaModificaQuantita(input, cod) {
    if (!input || !input.parentNode) {
        isEditingQuantity = false;
        currentEditingInput = null;
        return;
    }
    
    const nuovaQuantita = parseInt(input.value) || 0;
    
    isEditingQuantity = false;
    currentEditingInput = null;
    
    if (nuovaQuantita === 0) {
        prodottiScansionati.delete(cod);
        mostraAlert(`❌ Prodotto ${cod} rimosso`, 'success');
    } else {
        prodottiScansionati.set(cod, nuovaQuantita);
        mostraAlert(`✅ Quantità ${cod} impostata a ${nuovaQuantita}`, 'success');
    }
    
    aggiornaInterfaccia();
}

function annullaModificaQuantita(input, originalElement, quantitaOriginale) {
    if (!input || !input.parentNode) {
        isEditingQuantity = false;
        currentEditingInput = null;
        return;
    }
    
    isEditingQuantity = false;
    currentEditingInput = null;
    
    input.parentNode.replaceChild(originalElement, input);
}

function aggiornaTabellaOrdine() {
    console.log('🔍 aggiornaTabellaOrdine - Stato:', {
        ordineCorrente: ordineCorrente ? ordineCorrente.length : 'null',
        prodottiScansionati: prodottiScansionati.size,
        nomeFile: nomeFileOrdineCorrente
    });

    // CASO 1: NESSUN ORDINE E NESSUN PRODOTTO SCANSIONATO
    if (!ordineCorrente && prodottiScansionati.size === 0) {
        console.log('📭 Caso 1: Nessun ordine, nessun prodotto');
        // NON resetare fileInfo qui - mantieni quello che c'è già
        ordineTable.innerHTML = `
            <div class="nessun-prodotto-message">
                <div class="icon">📝</div>
                <div class="title">Nessun Ordine Caricato</div>
                <div class="subtitle">Seleziona un file ordine per iniziare il picking</div>
                <div class="hint">Oppure crea un ordine vuoto</div>
            </div>
        `;
        return;
    }

    // CASO 2: ORDINE VUOTO MA CON PRODOTTI SCANSIONATI
if ((!ordineCorrente || ordineCorrente.length === 0) && prodottiScansionati.size > 0) {
    console.log('📦 Caso 2: Ordine vuoto con prodotti scansionati');
    fileInfo.innerHTML = `
        <strong>📁 Ordine:</strong> 
        <span style="cursor: pointer; color: #3498db; text-decoration: underline;" 
              onclick="impostaNomeOrdine()" 
              title="Clicca per rinominare">
            ${nomeFileOrdineCorrente || 'Ordine Vuoto'}
        </span>
        <br>
        <strong>📦 Prodotti scansionati:</strong> ${prodottiScansionati.size}
        <br>
        <small><em>Clicca sul nome dell'ordine per rinominare</em></small>
    `;
        
        // MOSTRA SOLO I PRODOTTI SCANSIONATI
        let html = `
            <table style="border-collapse: collapse; width: 100%;">
                <thead>
                    <tr>
                        <th style="padding: 15px; text-align: left; background: #34495e; color: white; position: sticky; top: 0;">Codice</th>
                        <th style="padding: 15px; text-align: left; background: #34495e; color: white; position: sticky; top: 0;">Descrizione</th>
                        <th style="padding: 15px; text-align: left; background: #34495e; color: white; position: sticky; top: 0;">Ordinato</th>
                        <th style="padding: 15px; text-align: left; background: #34495e; color: white; position: sticky; top: 0;">Scansionato</th>
                        <th style="padding: 15px; text-align: left; background: #34495e; color: white; position: sticky; top: 0;">Azioni</th>
                    </tr>
                </thead>
                <tbody>
        `;

        prodottiScansionati.forEach((quantita, cod) => {
            const prodotto = inventario ? cercaProdotto(cod) : null;
            const descrizione = prodotto ? 
                (prodotto.Descrizione || prodotto.Desc || prodotto['Desc.'] || 'Descrizione non disponibile') : 
                'Prodotto non in inventario';
            
            const codEscaped = cod.replace(/"/g, '&quot;');
            
            html += `
                <tr style="background-color: #e3f2fd; border-bottom: 1px solid #ecf0f1;">
                    <td style="padding: 12px 15px;"><strong>${cod}</strong></td>
                    <td style="padding: 12px 15px;">${descrizione} <small style="color: #9b59b6;">(extra)</small></td>
                    <td style="padding: 12px 15px;">0</td>
                    <td style="padding: 12px 15px;">
                        <span class="modifica-quantita" data-codice="${codEscaped}" 
                            style="cursor: pointer; padding: 8px 12px; border-radius: 4px; background: rgba(255,255,255,0.9); border: 2px solid #3498db; display: inline-block; min-width: 60px; text-align: center; font-weight: bold; font-size: 1.2em; transition: all 0.2s ease; box-shadow: 0 2px 4px rgba(0,0,0,0.1); color: #000;">
                            ${quantita}
                        </span>
                    </td>
                    <td style="padding: 12px 15px;" class="quantity-controls">
                        <button class="qty-btn" data-codice="${codEscaped}" data-variazione="-1" type="button">-</button>
                        <button class="qty-btn" data-codice="${codEscaped}" data-variazione="1" type="button">+</button>
                    </td>
                </tr>
            `;
        });

        html += '</tbody></table>';
        ordineTable.innerHTML = html;
        return;
    }

    // CASO 3: ORDINE NORMALE CARICATO
    if (ordineCorrente && ordineCorrente.length > 0) {
        console.log('📄 Caso 3: Ordine normale caricato');
        fileInfo.innerHTML = `
            <strong>📁 Ordine:</strong> 
            <span style="cursor: pointer; color: #3498db; text-decoration: underline;" 
                  onclick="impostaNomeOrdine()" 
                  title="Clicca per rinominare">
                ${nomeFileOrdineCorrente || 'Ordine senza nome'}
            </span>
            <br>
            <strong>📦 Prodotti ordinati:</strong> ${ordineCorrente.length}
            <br>
            <small><em>Clicca sul nome dell'ordine per rinominare</em></small>
        `;

        let html = `
            <table style="border-collapse: collapse; width: 100%;">
                <thead>
                    <tr>
                        <th style="padding: 15px; text-align: left; background: #34495e; color: white; position: sticky; top: 0;">Codice</th>
                        <th style="padding: 15px; text-align: left; background: #34495e; color: white; position: sticky; top: 0;">Descrizione</th>
                        <th style="padding: 15px; text-align: left; background: #34495e; color: white; position: sticky; top: 0;">Ordinato</th>
                        <th style="padding: 15px; text-align: left; background: #34495e; color: white; position: sticky; top: 0;">Scansionato</th>
                        <th style="padding: 15px; text-align: left; background: #34495e; color: white; position: sticky; top: 0;">Azioni</th>
                    </tr>
                </thead>
                <tbody>
        `;

        const prodottiProcessati = new Set();

        ordineCorrente.forEach((prodotto, index) => {
            const cod = (prodotto.Cod || prodotto['Cod.'] || `RIGA-${index + 1}`).toString().trim();
            const descrizione = prodotto.Descrizione || prodotto.Desc || prodotto['Desc.'] || 'Descrizione non disponibile';
            const ordinato = prodotto['Q.tà'] || prodotto.Quantità || prodotto.Qtà || 0;
            const scansionato = prodottiScansionati.get(cod) || 0;

            prodottiProcessati.add(cod);

            let stileRiga = 'border-bottom: 1px solid #ecf0f1;';
            if (scansionato === 0) {
                stileRiga += 'background-color: #ffebee;';
            } else if (scansionato > 0 && scansionato < ordinato) {
                stileRiga += 'background-color: #fff3cd;';
            } else if (scansionato === ordinato) {
                stileRiga += 'background-color: #d4edda;';
            } else if (scansionato > ordinato) {
                stileRiga += 'background-color: #c8e6c9;';
            }

            const codEscaped = cod.replace(/"/g, '&quot;');
            
            html += `
                <tr style="${stileRiga}">
                    <td style="padding: 12px 15px;"><strong>${cod}</strong></td>
                    <td style="padding: 12px 15px;">${descrizione}</td>
                    <td style="padding: 12px 15px;">${ordinato}</td>
                    <td style="padding: 12px 15px;">
                        <span class="modifica-quantita" data-codice="${codEscaped}" 
                              style="cursor: pointer; padding: 8px 12px; border-radius: 4px; background: rgba(255,255,255,0.9); border: 2px solid #3498db; display: inline-block; min-width: 60px; text-align: center; font-weight: bold; font-size: 1.2em; transition: all 0.2s ease; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                            ${scansionato}
                        </span>
                    </td>
                    <td style="padding: 12px 15px;" class="quantity-controls">
                        <button class="qty-btn" data-codice="${codEscaped}" data-variazione="-1" type="button">-</button>
                        <button class="qty-btn" data-codice="${codEscaped}" data-variazione="1" type="button">+</button>
                    </td>
                </tr>
            `;
        });

        // AGGIUNGI PRODOTTI EXTRA (NON NELL'ORDINE ORIGINALE)
        prodottiScansionati.forEach((quantita, cod) => {
            const codClean = cod.toString().trim();
            
            if (!prodottiProcessati.has(codClean)) {
                const prodotto = inventario ? cercaProdotto(cod) : null;
                const descrizione = prodotto ? 
                    (prodotto.Descrizione || prodotto.Desc || prodotto['Desc.'] || 'Descrizione non disponibile') : 
                    'Prodotto non in inventario';
                
                const codEscaped = cod.replace(/"/g, '&quot;');
                
                html += `
                    <tr style="background-color: #e3f2fd; border-bottom: 1px solid #ecf0f1;">
                        <td style="padding: 12px 15px;"><strong>${cod}</strong></td>
                        <td style="padding: 12px 15px;">${descrizione} <small style="color: #9b59b6;">(extra)</small></td>
                        <td style="padding: 12px 15px;">0</td>
                        <td style="padding: 12px 15px;">
                            <span class="modifica-quantita" data-codice="${codEscaped}" 
                                style="cursor: pointer; padding: 8px 12px; border-radius: 4px; background: rgba(255,255,255,0.9); border: 2px solid #3498db; display: inline-block; min-width: 60px; text-align: center; font-weight: bold; font-size: 1.2em; transition: all 0.2s ease; box-shadow: 0 2px 4px rgba(0,0,0,0.1); color: #000;">
                                ${quantita}
                            </span>
                        </td>
                        <td style="padding: 12px 15px;" class="quantity-controls">
                            <button class="qty-btn" data-codice="${codEscaped}" data-variazione="-1" type="button">-</button>
                            <button class="qty-btn" data-codice="${codEscaped}" data-variazione="1" type="button">+</button>
                        </td>
                    </tr>
                `;
            }
        });

        html += '</tbody></table>';
        ordineTable.innerHTML = html;
        return;
    }

    // CASO 4: FALLBACK - SE ARRIVIAMO QUI C'È UN PROBLEMA
    console.error('❌ Stato inconsistente raggiunto in aggiornaTabellaOrdine');
    fileInfo.innerHTML = `
        <p style="text-align: center; color: #e74c3c;">
            ⚠️ Errore nello stato dell'applicazione
        </p>
    `;
    ordineTable.innerHTML = `
        <p style="text-align: center; padding: 40px; color: #e74c3c;">
            ⚠️ Errore: stato inconsistente. Ricarica l'applicazione.
        </p>
    `;
}

function aggiornaInterfaccia() {
    console.log('🔄 AGGIORNA INTERFACCIA - Stato:', {
        ordine: ordineCorrente ? ordineCorrente.length : 'null',
        scansionati: prodottiScansionati.size,
        nome: nomeFileOrdineCorrente
    });
    
    // PRIMA aggiorna fileInfo
    if (!ordineCorrente && prodottiScansionati.size === 0) {
        fileInfo.innerHTML = `
            <strong>📁 Ordine:</strong> 
            <span style="cursor: pointer; color: #3498db; text-decoration: underline;" 
                  onclick="impostaNomeOrdine()" 
                  title="Clicca per rinominare">
                ${nomeFileOrdineCorrente || 'Nessun ordine'}
            </span>
            <br>
            <strong>📦 Prodotti scansionati:</strong> 0
        `;
    } else if (ordineCorrente && ordineCorrente.length > 0) {
        fileInfo.innerHTML = `
            <strong>📁 Ordine:</strong> 
            <span style="cursor: pointer; color: #3498db; text-decoration: underline;" 
                  onclick="impostaNomeOrdine()" 
                  title="Clicca per rinominare">
                ${nomeFileOrdineCorrente || 'Ordine senza nome'}
            </span>
            <br>
            <strong>📦 Prodotti ordinati:</strong> ${ordineCorrente.length}
        `;
    } else {
        fileInfo.innerHTML = `
            <strong>📁 Ordine:</strong> 
            <span style="cursor: pointer; color: #3498db; text-decoration: underline;" 
                  onclick="impostaNomeOrdine()" 
                  title="Clicca per rinominare">
                ${nomeFileOrdineCorrente || 'Ordine Vuoto'}
            </span>
            <br>
            <strong>📦 Prodotti scansionati:</strong> ${prodottiScansionati.size}
        `;
    }
    
    // POI aggiorna la tabella
    aggiornaTabellaOrdine();
    aggiornaProgresso();
    aggiornaStato();
}

function aggiornaProgresso() {
    if (!ordineCorrente || ordineCorrente.length === 0) {
        counterOrdine.textContent = '0/0';
        progressFill.style.width = '0%';
        progressText.textContent = '0%';
        return;
    }

    let totaleOrdinato = 0;
    let totaleScansionato = 0;

    ordineCorrente.forEach(prodotto => {
        const cod = (prodotto.Cod || prodotto['Cod.'] || '').toString().trim();
        const ordinato = prodotto['Q.tà'] || prodotto.Quantità || prodotto.Qtà || 0;
        const scansionato = prodottiScansionati.get(cod) || 0;

        totaleOrdinato += ordinato;
        totaleScansionato += Math.min(scansionato, ordinato);
    });

    const percentuale = totaleOrdinato > 0 ? Math.round((totaleScansionato / totaleOrdinato) * 100) : 0;
    
    counterOrdine.textContent = `${totaleScansionato}/${totaleOrdinato}`;
    progressFill.style.width = `${percentuale}%`;
    progressText.textContent = `${percentuale}%`;
}

function aggiornaStato() {
    if (!ordineCorrente || ordineCorrente.length === 0) {
        if (prodottiScansionati.size > 0) {
            statusInfo.innerHTML = `
                <span style="color: #9b59b6; font-weight: bold;">🟣 ORDINE VUOTO CON PRODOTTI</span>
                ${nomeFileOrdineCorrente ? `
                    <br><small>Nome: 
                        <span style="cursor: pointer; color: #3498db; text-decoration: underline;" 
                              onclick="impostaNomeOrdine()" 
                              title="Clicca per rinominare">
                            ${nomeFileOrdineCorrente}
                        </span>
                    </small>
                ` : ''}
                <br><small>📦 Prodotti scansionati: ${prodottiScansionati.size}</small>
            `;
        } else {
            statusInfo.innerHTML = `
                <span style="color: #7f8c8d;">⏳ Nessun ordine caricato</span>
                ${nomeFileOrdineCorrente ? `
                    <br><small>Nome: 
                        <span style="cursor: pointer; color: #3498db; text-decoration: underline;" 
                              onclick="impostaNomeOrdine()" 
                              title="Clicca per rinominare">
                            ${nomeFileOrdineCorrente}
                        </span>
                    </small>
                ` : ''}
            `;
        }
        return;
    }

    let completati = 0;
    let parziali = 0;
    let mancanti = 0;
    let extra = 0;
    let totaleOrdinato = 0;
    let totaleScansionato = 0;

    ordineCorrente.forEach(prodotto => {
        const cod = (prodotto.Cod || prodotto['Cod.'] || '').toString().trim();
        const ordinato = prodotto['Q.tà'] || prodotto.Quantità || prodotto.Qtà || 0;
        const scansionato = prodottiScansionati.get(cod) || 0;

        totaleOrdinato += ordinato;
        totaleScansionato += Math.min(scansionato, ordinato);

        if (scansionato === 0) {
            mancanti++;
        } else if (scansionato > 0 && scansionato < ordinato) {
            parziali++;
        } else if (scansionato === ordinato) {
            completati++;
        } else if (scansionato > ordinato) {
            extra++;
            completati++;
        }
    });

    // Conta prodotti extra (non nell'ordine originale)
    const prodottiExtra = Array.from(prodottiScansionati.entries()).filter(([cod, quantita]) => {
        const codClean = cod.toString().trim();
        return !ordineCorrente.find(p => {
            const codOrd = (p.Cod || p['Cod.'] || '').toString().trim();
            return codOrd === codClean;
        });
    }).length;

    let statoHTML = '';
    
    if (completati === ordineCorrente.length && extra === 0 && prodottiExtra === 0) {
        statoHTML = `<span style="color: #27ae60; font-weight: bold;">✅ ORDINE COMPLETATO</span>`;
    } else if (completati === ordineCorrente.length && (extra > 0 || prodottiExtra > 0)) {
        const extraTotali = extra + prodottiExtra;
        statoHTML = `<span style="color: #9b59b6; font-weight: bold;">🟢 ORDINE COMPLETATO + ${extraTotali} EXTRA</span>`;
    } else if (completati > 0 || parziali > 0) {
        statoHTML = `<span style="color: #f39c12; font-weight: bold;">🟡 IN LAVORAZIONE</span>`;
    } else {
        statoHTML = `<span style="color: #e74c3c; font-weight: bold;">❌ DA INIZIARE</span>`;
    }

    // Calcola percentuale di completamento
    const percentuale = totaleOrdinato > 0 ? Math.round((totaleScansionato / totaleOrdinato) * 100) : 0;

    // Costruisci il dettaglio dello stato
    statoHTML += `
        <br>
        <small>
            ✅ ${completati} completati | 
            🟡 ${parziali} parziali | 
            ❌ ${mancanti} mancanti
            ${extra > 0 ? `| 🔴 ${extra} sovrascansioni` : ''}
            ${prodottiExtra > 0 ? `| 🟣 ${prodottiExtra} extra` : ''}
        </small>
        <br>
        <small>📊 Progresso: ${totaleScansionato}/${totaleOrdinato} (${percentuale}%)</small>
        ${nomeFileOrdineCorrente ? `
            <br><small>📁 Nome: 
                <span style="cursor: pointer; color: #3498db; text-decoration: underline;" 
                      onclick="impostaNomeOrdine()" 
                      title="Clicca per rinominare">
                    ${nomeFileOrdineCorrente}
                </span>
            </small>
        ` : ''}
    `;

    // Aggiungi avvisi speciali
    if (extra > 0) {
        statoHTML += `<br><small style="color: #e74c3c; font-weight: bold;">⚠️ ATTENZIONE: ${extra} prodotti con quantità superiore all'ordinato</small>`;
    }
    
    if (prodottiExtra > 0) {
        statoHTML += `<br><small style="color: #9b59b6; font-weight: bold;">ℹ️ ${prodottiExtra} prodotti extra non presenti nell'ordine originale</small>`;
    }
    
    if (mancanti === ordineCorrente.length && prodottiScansionati.size > 0) {
        statoHTML += `<br><small style="color: #9b59b6; font-weight: bold;">ℹ️ Tutti i prodotti scansionati sono extra rispetto all'ordine</small>`;
    }

    statusInfo.innerHTML = statoHTML;
}

function mostraAlert(messaggio, tipo = 'info') {
    const icona = {
        success: '✅',
        error: '❌',
        warning: '⚠️',
        info: 'ℹ️'
    }[tipo];
    
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert-message ${tipo}`;
    alertDiv.innerHTML = `
        <span style="font-size: 1.2em;">${icona}</span>
        <span>${messaggio}</span>
    `;
    
    alertContainer.insertBefore(alertDiv, alertContainer.firstChild);
    
    setTimeout(() => {
        if (alertDiv.parentNode) {
            alertDiv.style.animation = 'slideOutRight 0.3s ease-in forwards';
            setTimeout(() => {
                if (alertDiv.parentNode) {
                    alertDiv.parentNode.removeChild(alertDiv);
                }
            }, 300);
        }
    }, 4000);
}

// Chiudi modale se si clicca fuori
window.onclick = function(event) {
    const modal = document.getElementById('anteprimaModal');
    if (event.target === modal) {
        chiudiAnteprima();
    }
    
    const modalInventario = document.getElementById('inventarioModal');
    if (event.target === modalInventario) {
        chiudiModalInventario();
    }
}

// ESPONI LE FUNZIONI AL GLOBALE
window.selezionaFileOrdine = selezionaFileOrdine;
window.creaOrdineVuoto = creaOrdineVuoto;
window.anteprimaOrdine = anteprimaOrdine;
window.completaPicking = completaPicking;
window.aggiornaInventario = aggiornaInventario;
window.apriCartellaDDT = apriCartellaDDT;
window.gestisciScansione = gestisciScansione;
window.chiudiAnteprima = chiudiAnteprima;
window.caricaInventario = caricaInventario;
window.apriModuloInventario = apriModuloInventario;
window.aggiornaInventarioConfronto = aggiornaInventarioConfronto;
window.esportaInventario = esportaInventario;
window.chiudiModalInventario = chiudiModalInventario;
window.cercaProdottoInventario = cercaProdottoInventario;
window.aggiungiEAN = aggiungiEAN;
window.eliminaEAN = eliminaEAN;
window.confermaAggiornamentoInventario = confermaAggiornamentoInventario;
window.annullaModificaInventario = annullaModificaInventario;
window.creaNuovoProdotto = creaNuovoProdotto;
window.mostraDettaglioProdotto = mostraDettaglioProdotto;