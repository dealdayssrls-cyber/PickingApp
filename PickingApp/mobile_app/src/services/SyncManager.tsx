// mobile_app/src/services/SyncManager.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { orderService, SyncResult } from './orderService';
import { Ordine } from '../types';

export interface SyncStatus {
  isSyncing: boolean;
  lastSync: Date | null;
  pendingOperations: number;
  lastError: string | null;
}

export class SyncManager {
  private static instance: SyncManager;
  private syncInterval: NodeJS.Timeout | null = null;
  private isSyncing = false;

  // Chiavi per AsyncStorage
  private readonly SYNC_STATUS_KEY = 'sync_status';
  private readonly ACTIVITY_LOGS_KEY = 'activity_logs_queue';
  private readonly OFFLINE_ORDERS_KEY = 'offline_orders_queue';

  private constructor() {}

  static getInstance(): SyncManager {
    if (!SyncManager.instance) {
      SyncManager.instance = new SyncManager();
    }
    return SyncManager.instance;
  }

  // === GESTIONE STATO SINCRONIZZAZIONE ===

  // Ottieni stato sincronizzazione
  async getSyncStatus(): Promise<SyncStatus> {
    try {
      const status = await AsyncStorage.getItem(this.SYNC_STATUS_KEY);
      if (status) {
        return JSON.parse(status);
      }
    } catch (error) {
      console.error('❌ Errore lettura stato sync:', error);
    }

    // Stato predefinito
    return {
      isSyncing: false,
      lastSync: null,
      pendingOperations: 0,
      lastError: null
    };
  }

  // Salva stato sincronizzazione
  private async saveSyncStatus(status: Partial<SyncStatus>): Promise<void> {
    try {
      const currentStatus = await this.getSyncStatus();
      const newStatus = { ...currentStatus, ...status };
      await AsyncStorage.setItem(this.SYNC_STATUS_KEY, JSON.stringify(newStatus));
    } catch (error) {
      console.error('❌ Errore salvataggio stato sync:', error);
    }
  }

  // === LOG ATTIVITÀ ===

  // Aggiungi log attività
  async logActivity(activity: {
    type: string;
    operatore: string;
    ordine?: string;
    prodotto?: string;
    quantita?: number;
    details?: any;
  }): Promise<void> {
    try {
      const logs = await AsyncStorage.getItem(this.ACTIVITY_LOGS_KEY);
      const activityLogs = logs ? JSON.parse(logs) : [];
      
      activityLogs.push({
        ...activity,
        timestamp: new Date().toISOString(),
        deviceId: await this.getDeviceId()
      });
      
      await AsyncStorage.setItem(this.ACTIVITY_LOGS_KEY, JSON.stringify(activityLogs));
      console.log('📝 Log attività salvato:', activity.type);
      
      // Trigger sync automatica per i log
      this.triggerSync();
    } catch (error) {
      console.error('❌ Errore salvataggio log attività:', error);
    }
  }

  // Ottieni log attività in sospeso
  private async getPendingActivityLogs(): Promise<any[]> {
    try {
      const logs = await AsyncStorage.getItem(this.ACTIVITY_LOGS_KEY);
      return logs ? JSON.parse(logs) : [];
    } catch (error) {
      console.error('❌ Errore lettura log attività:', error);
      return [];
    }
  }

  // Pulisci log attività inviati
  private async clearSentActivityLogs(): Promise<void> {
    try {
      await AsyncStorage.removeItem(this.ACTIVITY_LOGS_KEY);
    } catch (error) {
      console.error('❌ Errore pulizia log attività:', error);
    }
  }

  // === GESTIONE ORDINI OFFLINE ===

  // Salva ordine in coda offline
  private async saveOrderToOfflineQueue(ordine: Ordine): Promise<void> {
    try {
      const queue = await AsyncStorage.getItem(this.OFFLINE_ORDERS_KEY);
      const orders = queue ? JSON.parse(queue) : [];
      
      // Evita duplicati
      const existingIndex = orders.findIndex((o: any) => o.id === ordine.id);
      if (existingIndex === -1) {
        orders.push({
          ...ordine,
          syncAttempts: 0,
          lastAttempt: new Date().toISOString()
        });
        await AsyncStorage.setItem(this.OFFLINE_ORDERS_KEY, JSON.stringify(orders));
        console.log('💾 Ordine salvato in coda offline:', ordine.nome);
      }
    } catch (error) {
      console.error('❌ Errore salvataggio ordine in coda offline:', error);
    }
  }

  // Rimuovi ordine completato dalla lista locale
  private async removeCompletedOrderFromLocal(orderId: string): Promise<void> {
    try {
      const ORDINI_STORAGE_KEY = 'ordini_in_lavorazione';
      const ordiniSalvati = await AsyncStorage.getItem(ORDINI_STORAGE_KEY);
      
      if (ordiniSalvati) {
        const ordini = JSON.parse(ordiniSalvati);
        const ordiniAggiornati = ordini.filter((ordine: Ordine) => ordine.id !== orderId);
        await AsyncStorage.setItem(ORDINI_STORAGE_KEY, JSON.stringify(ordiniAggiornati));
        console.log('✅ Ordine rimosso dalla lista locale:', orderId);
      }
    } catch (error) {
      console.error('❌ Errore rimozione ordine dalla lista locale:', error);
    }
  }

  // Processa ordini offline
  private async processOfflineOrders(): Promise<{ successful: number; failed: number }> {
    try {
      const queue = await AsyncStorage.getItem(this.OFFLINE_ORDERS_KEY);
      if (!queue) {
        return { successful: 0, failed: 0 };
      }

      const orders = JSON.parse(queue);
      console.log(`🔄 Processamento ${orders.length} ordini offline`);

      let successful = 0;
      let failed = 0;
      const remainingOrders = [];

      for (const orderData of orders) {
        try {
          const result = await orderService.syncCompletedOrder(orderData);
          
          if (result.success) {
            successful++;
            await this.removeCompletedOrderFromLocal(orderData.id);
          } else {
            // Incrementa tentativi e mantieni in coda
            orderData.syncAttempts = (orderData.syncAttempts || 0) + 1;
            orderData.lastAttempt = new Date().toISOString();
            remainingOrders.push(orderData);
            failed++;
          }
        } catch (error) {
          console.error(`❌ Errore processamento ordine offline ${orderData.id}:`, error);
          orderData.syncAttempts = (orderData.syncAttempts || 0) + 1;
          orderData.lastAttempt = new Date().toISOString();
          remainingOrders.push(orderData);
          failed++;
        }
      }

      // Salva ordini rimanenti
      await AsyncStorage.setItem(this.OFFLINE_ORDERS_KEY, JSON.stringify(remainingOrders));

      return { successful, failed };
    } catch (error) {
      console.error('❌ Errore processamento ordini offline:', error);
      return { successful: 0, failed: 0 };
    }
  }

  // === SINCRONIZZAZIONE PRINCIPALE ===

  // Esegui sincronizzazione completa
  async performFullSync(): Promise<SyncResult> {
    if (this.isSyncing) {
      return { success: false, message: 'Sincronizzazione già in corso' };
    }

    try {
      this.isSyncing = true;
      await this.saveSyncStatus({ isSyncing: true, lastError: null });

      console.log('🔄 Avvio sincronizzazione completa...');

      const results = {
        activityLogs: { success: false, count: 0 },
        offlineOperations: { success: false, count: 0 },
        offlineOrders: { successful: 0, failed: 0 },
        pendingOrders: { success: false, count: 0 }
      };

      // 1. Sincronizza log attività
      const activityLogs = await this.getPendingActivityLogs();
      if (activityLogs.length > 0) {
        console.log(`📝 Invio ${activityLogs.length} log attività...`);
        const logResult = await orderService.uploadActivityLogs(activityLogs);
        if (logResult.success) {
          await this.clearSentActivityLogs();
          results.activityLogs = { success: true, count: activityLogs.length };
        }
      }

      // 2. Processa coda operazioni offline
      console.log('🔁 Processamento coda operazioni offline...');
      const queueResult = await orderService.processOfflineQueue();
      results.offlineOperations = { 
        success: queueResult.success, 
        count: queueResult.data ? (queueResult.data.successful + queueResult.data.failed) : 0 
      };

      // 3. Processa ordini offline
      console.log('📦 Processamento ordini offline...');
      const ordersResult = await this.processOfflineOrders();
      results.offlineOrders = ordersResult;

      // 4. Controlla nuovi ordini (solo info, non li carica)
      console.log('📥 Controllo nuovi ordini...');
      const pendingOrders = await orderService.getPendingOrders();
      results.pendingOrders = { 
        success: true, 
        count: pendingOrders.length 
      };

      // Aggiorna stato
      await this.saveSyncStatus({
        isSyncing: false,
        lastSync: new Date(),
        pendingOperations: 0, // Reset dopo sync completata
        lastError: null
      });

      console.log('✅ Sincronizzazione completata');
      
      return {
        success: true,
        message: `Sync completata: ${results.activityLogs.count} log, ${results.offlineOperations.count} operazioni, ${results.offlineOrders.successful}/${results.offlineOrders.failed} ordini, ${results.pendingOrders.count} nuovi ordini`,
        data: results
      };

    } catch (error: any) {
      console.error('❌ Errore sincronizzazione completa:', error);
      await this.saveSyncStatus({
        isSyncing: false,
        lastError: error.message
      });
      
      return {
        success: false,
        message: `Errore sincronizzazione: ${error.message}`,
        data: null
      };
    } finally {
      this.isSyncing = false;
    }
  }

  // Sincronizza singolo ordine completato
  async syncOrderCompletion(ordine: Ordine): Promise<SyncResult> {
    try {
      console.log(`🔄 Sincronizzazione ordine: ${ordine.nome}`);
      
      // Log attività
      await this.logActivity({
        type: 'ORDER_COMPLETED',
        operatore: ordine.operatore,
        ordine: ordine.nome,
        details: {
          prodottiCount: ordine.prodottiCount,
          quantitaTotalePrelevata: ordine.quantitaTotalePrelevata,
          quantitaTotaleOrdinata: ordine.quantitaTotaleOrdinata
        }
      });

      // Sincronizza ordine
      const result = await orderService.syncCompletedOrder(ordine);
      
      if (result.success) {
        // Rimuovi l'ordine dalla lista locale se sincronizzato con successo
        await this.removeCompletedOrderFromLocal(ordine.id);
        
        await this.logActivity({
          type: 'ORDER_SYNC_SUCCESS',
          operatore: ordine.operatore,
          ordine: ordine.nome
        });
      } else {
        // Salva in coda offline per ritentare
        await this.saveOrderToOfflineQueue(ordine);
        
        await this.logActivity({
          type: 'ORDER_SYNC_FAILED',
          operatore: ordine.operatore,
          ordine: ordine.nome,
          details: { error: result.message }
        });
      }

      // Aggiorna contatore operazioni pendenti
      await this.updatePendingOperationsCount();
      
      return result;

    } catch (error: any) {
      console.error('❌ Errore sync ordine:', error);
      
      // Salva in coda offline
      await this.saveOrderToOfflineQueue(ordine);
      
      await this.logActivity({
        type: 'ORDER_SYNC_ERROR',
        operatore: ordine.operatore,
        ordine: ordine.nome,
        details: { error: error.message }
      });

      await this.updatePendingOperationsCount();

      return {
        success: false,
        message: `Errore sync ordine: ${error.message}`,
        data: null
      };
    }
  }

  // === SINCRONIZZAZIONE AUTOMATICA ===

  // Avvia sincronizzazione automatica periodica
  startAutoSync(intervalMinutes: number = 5): void {
    if (this.syncInterval) {
      this.stopAutoSync();
    }

    console.log(`⏰ Sync automatica avviata (${intervalMinutes} minuti)`);
    
    this.syncInterval = setInterval(async () => {
      const status = await this.getSyncStatus();
      
      // Sync solo se non è già in corso e ci sono operazioni pendenti
      if (!status.isSyncing && status.pendingOperations > 0) {
        await this.performFullSync();
      }
    }, intervalMinutes * 60 * 1000);

    // Sync immediata all'avvio
    this.triggerSync();
  }

  // Ferma sincronizzazione automatica
  stopAutoSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
      console.log('⏹️ Sync automatica fermata');
    }
  }

  // Trigger sync manuale
  async triggerSync(): Promise<SyncResult> {
    console.log('🔔 Trigger sync manuale');
    return await this.performFullSync();
  }

  // === UTILITY ===

  // Ottieni ID dispositivo (semplice)
  private async getDeviceId(): Promise<string> {
    try {
      let deviceId = await AsyncStorage.getItem('device_id');
      if (!deviceId) {
        deviceId = `mobile_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        await AsyncStorage.setItem('device_id', deviceId);
      }
      return deviceId;
    } catch (error) {
      return 'unknown_device';
    }
  }

  // Forza aggiornamento stato operazioni pendenti
  async updatePendingOperationsCount(): Promise<void> {
    try {
      const activityLogs = await this.getPendingActivityLogs();
      const OFFLINE_QUEUE_KEY = 'offline_operations_queue';
      
      const queue = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
      const offlineOps = queue ? JSON.parse(queue) : [];
      
      const ordersQueue = await AsyncStorage.getItem(this.OFFLINE_ORDERS_KEY);
      const offlineOrders = ordersQueue ? JSON.parse(ordersQueue) : [];
      
      const totalPending = activityLogs.length + offlineOps.length + offlineOrders.length;
      
      await this.saveSyncStatus({
        pendingOperations: totalPending
      });

      console.log(`📊 Operazioni pendenti: ${totalPending} (${activityLogs.length} log + ${offlineOps.length} operazioni + ${offlineOrders.length} ordini)`);
    } catch (error) {
      console.error('❌ Errore aggiornamento operazioni pendenti:', error);
    }
  }

  // Pulisci completamente tutte le code
  async clearAllQueues(): Promise<void> {
    try {
      await AsyncStorage.removeItem(this.ACTIVITY_LOGS_KEY);
      await AsyncStorage.removeItem('offline_operations_queue');
      await AsyncStorage.removeItem(this.OFFLINE_ORDERS_KEY);
      
      await this.saveSyncStatus({
        pendingOperations: 0,
        lastError: null
      });
      
      console.log('🗑️ Tutte le code sincronizzazione sono state pulite');
    } catch (error) {
      console.error('❌ Errore pulizia code:', error);
      throw error;
    }
  }
}

// Esporta istanza singleton
export const syncManager = SyncManager.getInstance();