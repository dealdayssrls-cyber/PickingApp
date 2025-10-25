// mobile_app/src/services/orderService.ts
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ordine, Prodotto } from '../types';
import { serverConfig } from './ServerConfig';

export interface OrderFile {
  name: string;
  path: string;
  size: number;
  modified: Date;
}

export interface SyncResult {
  success: boolean;
  message: string;
  data?: any;
  ordine_spostato?: boolean;
}

export class OrderService {
  private readonly API_TIMEOUT = 15000;
  private readonly MAX_RETRIES = 3;

  // === GESTIONE RICHIESTE MIGLIORATA ===

  private async makeRequest(
    method: 'get' | 'post', 
    endpoint: string, 
    data?: any,
    retryCount: number = 0
  ): Promise<any> {
    try {
      const baseURL = serverConfig.getBaseURL();
      const url = `${baseURL}${endpoint}`;
      
      console.log(`🌐 ${method.toUpperCase()} ${url} (tentativo ${retryCount + 1})`);
      
      const config = {
        timeout: this.API_TIMEOUT,
        ...(method === 'post' && { data })
      };

      let response;
      if (method === 'get') {
        response = await axios.get(url, config);
      } else {
        response = await axios.post(url, data, config);
      }

      console.log(`✅ Risposta da ${endpoint}:`, response.data);
      return response.data;

    } catch (error: any) {
      console.error(`❌ Errore ${method.toUpperCase()} ${endpoint}:`, error.message);
      
      // Ritenta solo per errori di rete
      if (retryCount < this.MAX_RETRIES && this.shouldRetry(error)) {
        const delayTime = 1000 * (retryCount + 1);
        console.log(`🔄 Retry ${retryCount + 1}/${this.MAX_RETRIES} in ${delayTime}ms`);
        await this.delay(delayTime);
        return this.makeRequest(method, endpoint, data, retryCount + 1);
      }
      
      throw error;
    }
  }

  private shouldRetry(error: any): boolean {
    return (
      error.code === 'ECONNREFUSED' ||
      error.code === 'ETIMEDOUT' || 
      error.code === 'ENETUNREACH' ||
      error.message.includes('Network Error') ||
      error.message.includes('timeout')
    );
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // === TEST CONNESSIONE MIGLIORATO ===

  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      console.log('🔍 Test connessione server...');
      
      const response = await axios.get(`${serverConfig.getBaseURL()}/api/debug/test`, {
        timeout: 8000
      });

      if (response.data.success) {
        return { 
          success: true, 
          message: 'Server raggiungibile e funzionante' 
        };
      } else {
        return { 
          success: false, 
          message: 'Server non risponde correttamente' 
        };
      }
    } catch (error: any) {
      let errorMessage = 'Impossibile raggiungere il server';
      
      if (error.code === 'ECONNREFUSED') {
        errorMessage = 'Server non in ascolto sulla porta 3001';
      } else if (error.code === 'ENETUNREACH') {
        errorMessage = 'Rete non raggiungibile. Verifica WiFi.';
      } else if (error.code === 'ETIMEDOUT') {
        errorMessage = 'Timeout connessione. Server lento o IP errato.';
      } else if (error.message.includes('Network Error')) {
        errorMessage = 'Errore di rete. Verifica connessione.';
      }
      
      return { success: false, message: errorMessage };
    }
  }

  // === API DI SINCRONIZZAZIONE (TUTTE LE FUNZIONI ORIGINALI) ===

  async syncCompletedOrder(ordine: Ordine): Promise<SyncResult> {
    try {
      console.log('🔄 Sincronizzazione ordine completato:', ordine.nome);
      
      const response = await this.makeRequest('post', '/api/sync/complete-order', {
        ordine: ordine,
        timestamp: new Date().toISOString()
      });

      if (response.success) {
        console.log('✅ Ordine sincronizzato con successo');
        return {
          success: true,
          message: 'Ordine sincronizzato con successo',
          data: response,
          ordine_spostato: response.ordine_spostato
        };
      } else {
        throw new Error(response.error || response.message || 'Risposta del server non valida');
      }
    } catch (error: any) {
      console.log('❌ Errore sincronizzazione ordine:', error.message);
      
      // Salva in coda offline (funzione originale)
      await this.saveOfflineOperation('complete-order', { ordine });
      
      return {
        success: false,
        message: `Errore sincronizzazione: ${error.message}`,
        data: null
      };
    }
  }

  // Carica DDT generato (funzione originale)
  async uploadDDT(ddtData: any): Promise<SyncResult> {
    try {
      console.log('📄 Invio DDT al server...');
      
      const response = await this.makeRequest('post', '/api/sync/upload-ddt', {
        ddt: ddtData,
        timestamp: new Date().toISOString()
      });

      if (response.success) {
        console.log('✅ DDT inviato con successo');
        return {
          success: true,
          message: 'DDT inviato con successo',
          data: response
        };
      } else {
        throw new Error(response.message || 'Risposta del server non valida');
      }
    } catch (error: any) {
      console.log('❌ Errore invio DDT:', error.message);
      
      await this.saveOfflineOperation('upload-ddt', { ddtData });
      
      return {
        success: false,
        message: `Errore invio DDT: ${error.message}`,
        data: null
      };
    }
  }

  // Carica log attività (funzione originale)
  async uploadActivityLogs(logs: any[]): Promise<SyncResult> {
    try {
      console.log('📝 Invio log attività al server...');
      
      const response = await this.makeRequest('post', '/api/sync/upload-logs', {
        logs: logs,
        timestamp: new Date().toISOString()
      });

      if (response.success) {
        console.log('✅ Log attività inviati con successo');
        return {
          success: true,
          message: 'Log inviati con successo',
          data: response
        };
      } else {
        throw new Error(response.message || 'Risposta del server non valida');
      }
    } catch (error: any) {
      console.log('❌ Errore invio log:', error.message);
      
      await this.saveOfflineOperation('upload-logs', { logs });
      
      return {
        success: false,
        message: `Errore invio log: ${error.message}`,
        data: null
      };
    }
  }

  // Ottieni nuovi ordini disponibili (funzione originale)
  async getPendingOrders(): Promise<Ordine[]> {
    try {
      console.log('📥 Controllo nuovi ordini...');
      
      const response = await this.makeRequest('get', '/api/sync/pending-orders');

      if (response.success && response.orders) {
        console.log(`✅ ${response.orders.length} nuovi ordini disponibili`);
        return response.orders;
      } else {
        return [];
      }
    } catch (error: any) {
      console.log('❌ Errore caricamento nuovi ordini:', error.message);
      return [];
    }
  }

  // Inizia sessione di picking (funzione originale)
  async startPickingSession(operatore: string): Promise<SyncResult> {
    try {
      console.log('🚀 Inizio sessione picking per:', operatore);
      
      const response = await this.makeRequest('post', '/api/sync/start-session', {
        operatore: operatore,
        timestamp: new Date().toISOString()
      });

      if (response.success) {
        console.log('✅ Sessione picking iniziata');
        return {
          success: true,
          message: 'Sessione iniziata',
          data: response
        };
      } else {
        throw new Error(response.message || 'Risposta del server non valida');
      }
    } catch (error: any) {
      console.log('❌ Errore inizio sessione:', error.message);
      return {
        success: false,
        message: `Errore inizio sessione: ${error.message}`,
        data: null
      };
    }
  }

  // === GESTIONE OFFLINE (TUTTE LE FUNZIONI ORIGINALI) ===

  // Salva operazione in coda offline (funzione originale)
  private async saveOfflineOperation(operationType: string, data: any): Promise<void> {
    try {
      const OFFLINE_QUEUE_KEY = 'offline_operations_queue';
      const queue = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
      const operations = queue ? JSON.parse(queue) : [];
      
      operations.push({
        type: operationType,
        data: data,
        timestamp: new Date().toISOString(),
        attempts: 0
      });
      
      await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(operations));
      console.log(`💾 Operazione salvata in coda offline: ${operationType}`);
    } catch (error) {
      console.error('❌ Errore salvataggio coda offline:', error);
    }
  }

  // Processa coda operazioni offline (funzione originale)
  async processOfflineQueue(): Promise<SyncResult> {
    try {
      const OFFLINE_QUEUE_KEY = 'offline_operations_queue';
      const queue = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
      
      if (!queue) {
        return { success: true, message: 'Nessuna operazione in coda' };
      }

      const operations = JSON.parse(queue);
      console.log(`🔄 Processamento coda offline: ${operations.length} operazioni`);

      const successfulOps = [];
      const failedOps = [];

      for (const op of operations) {
        try {
          let result;
          
          switch (op.type) {
            case 'complete-order':
              result = await this.syncCompletedOrder(op.data.ordine);
              break;
            case 'upload-ddt':
              result = await this.uploadDDT(op.data.ddtData);
              break;
            case 'upload-logs':
              result = await this.uploadActivityLogs(op.data.logs);
              break;
            default:
              console.log(`❌ Tipo operazione sconosciuto: ${op.type}`);
              continue;
          }

          if (result.success) {
            successfulOps.push(op);
          } else {
            failedOps.push({ ...op, error: result.message });
          }
        } catch (error: any) {
          failedOps.push({ ...op, error: error.message });
        }
      }

      // Salva solo le operazioni fallite
      await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(failedOps));

      return {
        success: true,
        message: `Coda processata: ${successfulOps.length} successi, ${failedOps.length} falliti`,
        data: { successful: successfulOps.length, failed: failedOps.length }
      };
    } catch (error: any) {
      console.error('❌ Errore processamento coda offline:', error);
      return {
        success: false,
        message: `Errore processamento coda: ${error.message}`,
        data: null
      };
    }
  }

  // === API ESISTENTI (TUTTE LE FUNZIONI ORIGINALI) ===

  // Ottieni lista file ordini REALI dalla cartella shared_documents/ordini/
  async getOrderFiles(): Promise<OrderFile[]> {
    try {
      console.log('📁 Tentativo di caricare ordini reali dal server...');
      
      const response = await this.makeRequest('get', '/api/orders/list');

      if (response.success && response.files) {
        console.log(`✅ Trovati ${response.files.length} file ordine reali`);
        return response.files.map((file: any) => ({
          name: file.name,
          path: file.path,
          size: file.size,
          modified: new Date(file.modified)
        }));
      } else {
        throw new Error('Risposta del server non valida');
      }
    } catch (error: any) {
      console.log('❌ Server non raggiungibile per lista ordini:', error.message);
      return [];
    }
  }

  // Carica un ordine specifico dal file Excel REALE
  async loadOrderFromFile(fileName: string): Promise<Ordine> {
    try {
      console.log(`📁 Tentativo di caricare ordine reale: ${fileName}`);
      
      // PRIMA controlla se esiste già una versione modificata di questo ordine
      const ORDINI_STORAGE_KEY = 'ordini_in_lavorazione';
      const ordiniSalvati = await AsyncStorage.getItem(ORDINI_STORAGE_KEY);
      
      if (ordiniSalvati) {
        const ordini = JSON.parse(ordiniSalvati);
        const ordineEsistente = ordini.find((ordine: Ordine) => 
          ordine.fileName?.toLowerCase() === fileName.toLowerCase()
        );
        
        if (ordineEsistente) {
          console.log('📂 Trovata versione modificata dell\'ordine, uso quella salvata');
          return ordineEsistente;
        }
      }
      
      // Se non esiste una versione modificata, carica dal server
      const response = await this.makeRequest('post', '/api/orders/load', {
        fileName: fileName
      });

      if (response.success && response.ordine) {
        console.log(`✅ Ordine reale caricato: ${response.ordine.nome}`);
        
        const ordineDalServer = response.ordine;
        
        // Calcola correttamente le quantità totali
        const quantitaTotaleOrdinata = ordineDalServer.prodotti.reduce(
          (sum: number, p: any) => sum + (p.quantitaOrdinata || 0), 0
        );
        
        const quantitaTotalePrelevata = ordineDalServer.prodotti.reduce(
          (sum: number, p: any) => sum + (p.quantitaPrelevata || 0), 0
        );
        
        const ordineCorretto: Ordine = {
          ...ordineDalServer,
          quantitaTotaleOrdinata: quantitaTotaleOrdinata,
          quantitaTotalePrelevata: quantitaTotalePrelevata,
          operatore: 'Operatore' // Questo verrà sovrascritto dopo
        };
        
        console.log('📊 Quantità calcolate:', {
          ordinata: quantitaTotaleOrdinata,
          prelevata: quantitaTotalePrelevata
        });
        
        return ordineCorretto;
      } else {
        throw new Error('Risposta del server non valida');
      }
      
    } catch (error: any) {
      console.log(`❌ Errore caricamento ordine reale ${fileName}:`, error.message);
      throw new Error(`Impossibile caricare l'ordine: ${error.message}`);
    }
  }

  // Crea un nuovo ordine vuoto (per lavoro offline)
  async createNewOrder(orderName: string, operatore: string): Promise<Ordine> {
    try {
      const nuovoOrdine: Ordine = {
        id: Date.now().toString(),
        nome: orderName,
        fileName: `${orderName.replace(/ /g, '_')}.xlsx`,
        prodotti: [],
        operatore: operatore,
        dataCreazione: new Date().toISOString().split('T')[0],
        dataCompletamento: undefined,
        stato: 'in_lavorazione',
        totale: 0,
        prodottiCount: 0,
        quantitaTotaleOrdinata: 0,
        quantitaTotalePrelevata: 0
      };

      console.log('✅ Nuovo ordine creato:', nuovoOrdine);
      return nuovoOrdine;
    } catch (error) {
      console.error('❌ Errore creazione ordine:', error);
      throw error;
    }
  }

  // Salva ordine completato (versione legacy - mantenuta per compatibilità)
  async saveCompletedOrder(ordine: Ordine): Promise<void> {
    try {
      console.log('💾 Salvataggio ordine completato:', ordine);
      await this.syncCompletedOrder(ordine);
    } catch (error) {
      console.error('❌ Errore salvataggio ordine:', error);
      throw error;
    }
  }

  // Cerca prodotto nell'inventario
  async searchProduct(codice: string): Promise<Prodotto | null> {
      try {
          console.log(`🔍 Cercando prodotto con codice: ${codice}`);
          
          const inventario = await this.loadInventory();
          const codiceClean = codice.toString().trim().toUpperCase();

          const prodottoTrovato = inventario.find((prodotto: any) => {
              const codProdotto = (prodotto['Cod.'] || prodotto.Cod || '').toString().trim().toUpperCase();
              if (codProdotto === codiceClean) {
                  return true;
              }

              let eanArray: string[] = [];
              if (Array.isArray(prodotto['Cod. a barre'])) {
                  eanArray = prodotto['Cod. a barre'];
              } else if (prodotto['Cod. a barre']) {
                  eanArray = [prodotto['Cod. a barre']];
              }

              return eanArray.some(ean => 
                  ean && ean.toString().trim().toUpperCase() === codiceClean
              );
          });

          if (prodottoTrovato) {
              console.log('✅ Prodotto trovato nell\'inventario:', prodottoTrovato);
              
              const prezzoInventario = prodottoTrovato['Listino 1 (ivato)'] || 0;
              const prezzoFormattato = `€ ${prezzoInventario.toFixed(3).replace('.', ',')}`;
              
              return {
                  codice: (prodottoTrovato['Cod.'] || prodottoTrovato.Cod || codiceClean).toString().trim(),
                  descrizione: prodottoTrovato.Descrizione || prodottoTrovato['Desc.'] || 'Descrizione non disponibile',
                  prezzo: prezzoFormattato,
                  quantita: prodottoTrovato['Q.tà disponibile'] || 0,
                  codiceOriginale: prodottoTrovato['Cod.'] || prodottoTrovato.Cod
              };
          } else {
              console.log('❌ Prodotto non trovato nell\'inventario');
              return null;
          }

      } catch (error: any) {
          console.log('❌ Errore nella ricerca:', error.message);
          throw new Error(`Errore durante la ricerca: ${error.message}`);
      }
  }

  // Carica inventario dal server
  async loadInventory(): Promise<any[]> {
    try {
      console.log('📦 Tentativo di caricare inventario dal server...');
      
      const response = await this.makeRequest('get', '/api/sync/inventory');

      if (response.success && response.data) {
        console.log(`✅ Inventario caricato: ${response.data.length} prodotti`);
        return response.data;
      } else {
        throw new Error('Risposta del server non valida');
      }
    } catch (error: any) {
      console.log('❌ Errore caricamento inventario:', error.message);
      throw error;
    }
  }

  // Aggiorna IP del server - ora usa serverConfig
  updateServerIP(newIP: string) {
    serverConfig.setIPAddress(newIP);
  }
}

export const orderService = new OrderService();