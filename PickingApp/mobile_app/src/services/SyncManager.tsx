// mobile_app/src/services/SyncManager.tsx
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { orderService, SyncResult } from './orderService';
import { Ordine } from '../types';
import { serverConfig } from './ServerConfig';

export interface SyncStatus {
  isSyncing: boolean;
  lastSync: Date | null;
  pendingOperations: number;
  lastError: string | null;
  syncMode: 'online' | 'offline' | 'degraded';
}

export interface ActivityLog {
  type: string;
  operatore: string;
  ordine?: string;
  prodotto?: string;
  quantita?: number;
  details?: any;
  timestamp: string;
  deviceId: string;
}

export interface OfflineOrder extends Ordine {
  syncAttempts: number;
  lastAttempt: string;
  createdAt: string;
}

export interface SyncResults {
  activityLogs: { success: boolean; count: number };
  offlineOperations: { success: boolean; count: number };
  offlineOrders: { successful: number; failed: number };
  pendingOrders: { success: boolean; count: number };
  ordine_spostato?: boolean;
}

export interface SyncConfig {
  autoSyncInterval: number;
  maxSyncAttempts: number;
  maxQueueSize: number;
  enableNetworkDetection: boolean;
  retryBackoffBase: number;
}

export class SyncManager {
  private static instance: SyncManager;
  private syncInterval: NodeJS.Timeout | null = null;
  private isSyncing = false;
  private syncRetryCount = 0;
  private networkListener: (() => void) | null = null;

  // Configurazione
  private config: SyncConfig = {
    autoSyncInterval: 5, // minuti
    maxSyncAttempts: 3,
    maxQueueSize: 1000,
    enableNetworkDetection: true,
    retryBackoffBase: 5000 // ms
  };

  // Chiavi per AsyncStorage
  private readonly SYNC_STATUS_KEY = 'sync_status';
  private readonly SYNC_CONFIG_KEY = 'sync_config';
  private readonly ACTIVITY_LOGS_KEY = 'activity_logs_queue';
  private readonly OFFLINE_ORDERS_KEY = 'offline_orders_queue';
  private readonly DEVICE_ID_KEY = 'device_id';

  private constructor() {
    this.loadConfig();
    if (this.config.enableNetworkDetection) {
      this.setupNetworkListener();
    }
  }

  static getInstance(): SyncManager {
    if (!SyncManager.instance) {
      SyncManager.instance = new SyncManager();
    }
    return SyncManager.instance;
  }

  // === CONFIGURAZIONE ===

  private async loadConfig(): Promise<void> {
    try {
      const savedConfig = await AsyncStorage.getItem(this.SYNC_CONFIG_KEY);
      if (savedConfig) {
        this.config = { ...this.config, ...JSON.parse(savedConfig) };
      }
    } catch (error) {
      console.error('❌ Errore caricamento configurazione:', error);
    }
  }

  async updateConfig(newConfig: Partial<SyncConfig>): Promise<void> {
    try {
      Object.assign(this.config, newConfig);
      await AsyncStorage.setItem(this.SYNC_CONFIG_KEY, JSON.stringify(this.config));
      
      if (newConfig.autoSyncInterval) {
        this.restartAutoSync();
      }
    } catch (error) {
      console.error('❌ Errore aggiornamento configurazione:', error);
    }
  }

  getConfig(): SyncConfig {
    return { ...this.config };
  }

  // === GESTIONE STATO SINCRONIZZAZIONE ===

  async getSyncStatus(): Promise<SyncStatus> {
    try {
      const status = await AsyncStorage.getItem(this.SYNC_STATUS_KEY);
      if (status) {
        const parsed = JSON.parse(status);
        return {
          ...parsed,
          lastSync: parsed.lastSync ? new Date(parsed.lastSync) : null
        };
      }
    } catch (error) {
      console.error('❌ Errore lettura stato sync:', error);
    }

    // STATO DEFAULT COMPLETO
    return {
      isSyncing: false,
      lastSync: null,
      pendingOperations: 0,
      lastError: null,
      syncMode: 'online' // AGGIUNGI QUESTO
    };
  }

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

  async logActivity(activity: {
    type: string;
    operatore: string;
    ordine?: string;
    prodotto?: string;
    quantita?: number;
    details?: any;
  }): Promise<void> {
    try {
      await this.enforceQueueLimits();
      
      const logs = await AsyncStorage.getItem(this.ACTIVITY_LOGS_KEY);
      const activityLogs: ActivityLog[] = logs ? JSON.parse(logs) : [];
      
      const newLog: ActivityLog = {
        ...activity,
        timestamp: new Date().toISOString(),
        deviceId: await this.getDeviceId()
      };
      
      activityLogs.push(newLog);
      
      await AsyncStorage.setItem(this.ACTIVITY_LOGS_KEY, JSON.stringify(activityLogs));
      console.log('📝 Log attività salvato:', activity.type);
      
      await this.updatePendingOperationsCount();
      this.triggerSync();
    } catch (error) {
      console.error('❌ Errore salvataggio log attività:', error);
    }
  }

  private async getPendingActivityLogs(): Promise<ActivityLog[]> {
    try {
      const logs = await AsyncStorage.getItem(this.ACTIVITY_LOGS_KEY);
      return logs ? JSON.parse(logs) : [];
    } catch (error) {
      console.error('❌ Errore lettura log attività:', error);
      return [];
    }
  }

  private async clearSentActivityLogs(): Promise<void> {
    try {
      await AsyncStorage.removeItem(this.ACTIVITY_LOGS_KEY);
    } catch (error) {
      console.error('❌ Errore pulizia log attività:', error);
    }
  }

  // === GESTIONE ORDINI OFFLINE ===

  private async saveOrderToOfflineQueue(ordine: Ordine): Promise<void> {
    try {
      await this.enforceQueueLimits();
      
      const queue = await AsyncStorage.getItem(this.OFFLINE_ORDERS_KEY);
      const orders: OfflineOrder[] = queue ? JSON.parse(queue) : [];
      
      const existingIndex = orders.findIndex((o: OfflineOrder) => o.id === ordine.id);
      if (existingIndex === -1) {
        const offlineOrder: OfflineOrder = {
          ...ordine,
          syncAttempts: 0,
          lastAttempt: new Date().toISOString(),
          createdAt: new Date().toISOString()
        };
        
        orders.push(offlineOrder);
        await AsyncStorage.setItem(this.OFFLINE_ORDERS_KEY, JSON.stringify(orders));
        console.log('💾 Ordine salvato in coda offline:', ordine.nome);
      }
    } catch (error) {
      console.error('❌ Errore salvataggio ordine in coda offline:', error);
    }
  }

  private async removeCompletedOrderFromLocal(orderId: string): Promise<void> {
    try {
      const ORDINI_STORAGE_KEY = 'ordini_in_lavorazione';
      const ordiniSalvati = await AsyncStorage.getItem(ORDINI_STORAGE_KEY);
      
      if (ordiniSalvati) {
        const ordini: Ordine[] = JSON.parse(ordiniSalvati);
        const ordiniAggiornati = ordini.filter((ordine: Ordine) => ordine.id !== orderId);
        await AsyncStorage.setItem(ORDINI_STORAGE_KEY, JSON.stringify(ordiniAggiornati));
        console.log('✅ Ordine rimosso dalla lista locale:', orderId);
      }
    } catch (error) {
      console.error('❌ Errore rimozione ordine dalla lista locale:', error);
    }
  }

  private async processOfflineOrders(): Promise<{ successful: number; failed: number }> {
    try {
      const queue = await AsyncStorage.getItem(this.OFFLINE_ORDERS_KEY);
      if (!queue) {
        return { successful: 0, failed: 0 };
      }

      const orders: OfflineOrder[] = JSON.parse(queue);
      console.log(`🔄 Processamento ${orders.length} ordini offline`);

      let successful = 0;
      let failed = 0;
      const remainingOrders: OfflineOrder[] = [];

      for (const orderData of orders) {
        if (orderData.syncAttempts >= this.config.maxSyncAttempts) {
          console.warn(`📋 Ordine ${orderData.id} rimosso dopo ${this.config.maxSyncAttempts} tentativi falliti`);
          await this.logActivity({
            type: 'ORDER_SYNC_ABANDONED',
            operatore: orderData.operatore,
            ordine: orderData.nome,
            details: { syncAttempts: orderData.syncAttempts }
          });
          continue;
        }

        try {
          const result = await orderService.syncCompletedOrder(orderData);
          
          if (result.success) {
            successful++;
            await this.removeCompletedOrderFromLocal(orderData.id);
          } else {
            orderData.syncAttempts++;
            orderData.lastAttempt = new Date().toISOString();
            remainingOrders.push(orderData);
            failed++;
          }
        } catch (error) {
          console.error(`❌ Errore processamento ordine offline ${orderData.id}:`, error);
          orderData.syncAttempts++;
          orderData.lastAttempt = new Date().toISOString();
          remainingOrders.push(orderData);
          failed++;
        }
      }

      await AsyncStorage.setItem(this.OFFLINE_ORDERS_KEY, JSON.stringify(remainingOrders));
      return { successful, failed };
    } catch (error) {
      console.error('❌ Errore processamento ordini offline:', error);
      return { successful: 0, failed: 0 };
    }
  }

  // === SINCRONIZZAZIONE PRINCIPALE ===

  async performFullSync(): Promise<SyncResult> {
    if (this.isSyncing) {
      return { success: false, message: 'Sincronizzazione già in corso' };
    }

    try {
      this.isSyncing = true;
      await this.saveSyncStatus({ isSyncing: true, lastError: null });

      console.log('🔄 Avvio sincronizzazione completa...');

      const results: SyncResults = {
        activityLogs: { success: false, count: 0 },
        offlineOperations: { success: false, count: 0 },
        offlineOrders: { successful: 0, failed: 0 },
        pendingOrders: { success: false, count: 0 },
        ordine_spostato: false
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

      // 4. Controlla nuovi ordini
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
        pendingOperations: 0,
        lastError: null,
        syncMode: 'online'
      });

      this.syncRetryCount = 0;
      console.log('✅ Sincronizzazione completata');
      
      return {
        success: true,
        message: `Sync completata: ${results.activityLogs.count} log, ${results.offlineOperations.count} operazioni, ${results.offlineOrders.successful}/${results.offlineOrders.failed} ordini, ${results.pendingOrders.count} nuovi ordini`,
        data: results
      };

    } catch (error: any) {
      console.error('❌ Errore sincronizzazione completa:', error);
      
      this.syncRetryCount++;
      await this.saveSyncStatus({
        isSyncing: false,
        lastError: error.message,
        syncMode: 'degraded'
      });
      
      return {
        success: false,
        message: `Errore sincronizzazione: ${error.message}`,
        data: null
      };
    } finally {
      this.isSyncing = false;
      await this.updatePendingOperationsCount();
    }
  }

  async syncOrderCompletion(ordine: Ordine): Promise<SyncResult> {
    try {
      console.log(`🔄 Sincronizzazione ordine: ${ordine.nome}`);
      
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

      const result = await orderService.syncCompletedOrder(ordine);
      
      if (result.success) {
        await this.removeCompletedOrderFromLocal(ordine.id);
        
        await this.logActivity({
          type: 'ORDER_SYNC_SUCCESS',
          operatore: ordine.operatore,
          ordine: ordine.nome
        });
      } else {
        await this.saveOrderToOfflineQueue(ordine);
        
        await this.logActivity({
          type: 'ORDER_SYNC_FAILED',
          operatore: ordine.operatore,
          ordine: ordine.nome,
          details: { error: result.message }
        });
      }

      await this.updatePendingOperationsCount();
      return result;

    } catch (error: any) {
      console.error('❌ Errore sync ordine:', error);
      
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

  startAutoSync(intervalMinutes: number = this.config.autoSyncInterval): void {
    if (this.syncInterval) {
      this.stopAutoSync();
    }

    console.log(`⏰ Sync automatica avviata (${intervalMinutes} minuti)`);
    
    this.syncInterval = setInterval(async () => {
      const status = await this.getSyncStatus();
      
      if (!status.isSyncing && status.pendingOperations > 0) {
        await this.performSyncWithBackoff();
      }
    }, intervalMinutes * 60 * 1000);

    this.triggerSync();
  }

  private async performSyncWithBackoff(): Promise<void> {
    try {
      await this.performFullSync();
      this.syncRetryCount = 0;
    } catch (error) {
      console.error('❌ Sync fallita, applicando backoff...');
      
      this.syncRetryCount++;
      const delay = Math.min(
        this.config.retryBackoffBase * Math.pow(2, this.syncRetryCount),
        5 * 60 * 1000
      );
      
      console.log(`⏳ Ritento sync in ${delay}ms (tentativo ${this.syncRetryCount})`);
      setTimeout(() => this.performSyncWithBackoff(), delay);
    }
  }

  stopAutoSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
      console.log('⏹️ Sync automatica fermata');
    }
  }

  async triggerSync(): Promise<SyncResult> {
    console.log('🔔 Trigger sync manuale');
    return await this.performFullSync();
  }

  private restartAutoSync(): void {
    this.stopAutoSync();
    this.startAutoSync();
  }

  // === GESTIONE RETE ===

  private setupNetworkListener(): void {
    this.networkListener = NetInfo.addEventListener((state: any) => {
      if (state.isConnected && state.isInternetReachable) {
        console.log('🌐 Connessione ripristinata - trigger sync');
        this.saveSyncStatus({ syncMode: 'online' });
        this.triggerSync();
      } else if (!state.isConnected) {
        console.log('🌐 Connessione persa');
        this.saveSyncStatus({ syncMode: 'offline' });
      }
    });
  }

  // === UTILITY ===

  private async getDeviceId(): Promise<string> {
    try {
      let deviceId = await AsyncStorage.getItem(this.DEVICE_ID_KEY);
      if (!deviceId) {
        deviceId = `mobile_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        await AsyncStorage.setItem(this.DEVICE_ID_KEY, deviceId);
      }
      return deviceId;
    } catch (error) {
      return 'unknown_device';
    }
  }

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

      console.log(`📊 Operazioni pendenti: ${totalPending}`);
    } catch (error) {
      console.error('❌ Errore aggiornamento operazioni pendenti:', error);
    }
  }

  private async enforceQueueLimits(): Promise<void> {
    try {
      const logs = await this.getPendingActivityLogs();
      if (logs.length > this.config.maxQueueSize) {
        const excess = logs.length - this.config.maxQueueSize;
        const trimmedLogs = logs.slice(excess);
        await AsyncStorage.setItem(this.ACTIVITY_LOGS_KEY, JSON.stringify(trimmedLogs));
        console.warn(`📋 Rimosse ${excess} attività dalla coda (limite superato)`);
      }

      const ordersQueue = await AsyncStorage.getItem(this.OFFLINE_ORDERS_KEY);
      if (ordersQueue) {
        const orders: OfflineOrder[] = JSON.parse(ordersQueue);
        if (orders.length > this.config.maxQueueSize) {
          const excess = orders.length - this.config.maxQueueSize;
          const trimmedOrders = orders.slice(excess);
          await AsyncStorage.setItem(this.OFFLINE_ORDERS_KEY, JSON.stringify(trimmedOrders));
          console.warn(`📋 Rimosse ${excess} ordini dalla coda (limite superato)`);
        }
      }
    } catch (error) {
      console.error('❌ Errore enforcement limiti coda:', error);
    }
  }

  async getDiagnosticInfo(): Promise<{
    queueSizes: { activities: number; orders: number; operations: number };
    lastSync: Date | null;
    syncStatus: string;
    config: SyncConfig;
  }> {
    const status = await this.getSyncStatus();
    const activities = await this.getPendingActivityLogs();
    const ordersQueue = await AsyncStorage.getItem(this.OFFLINE_ORDERS_KEY);
    const orders = ordersQueue ? JSON.parse(ordersQueue) : [];
    const operationsQueue = await AsyncStorage.getItem('offline_operations_queue');
    const operations = operationsQueue ? JSON.parse(operationsQueue) : [];

    return {
      queueSizes: {
        activities: activities.length,
        orders: orders.length,
        operations: operations.length
      },
      lastSync: status.lastSync,
      syncStatus: status.isSyncing ? 'syncing' : status.syncMode,
      config: this.config
    };
  }

  async clearAllQueues(): Promise<void> {
    try {
      await AsyncStorage.removeItem(this.ACTIVITY_LOGS_KEY);
      await AsyncStorage.removeItem('offline_operations_queue');
      await AsyncStorage.removeItem(this.OFFLINE_ORDERS_KEY);
      
      await this.saveSyncStatus({
        pendingOperations: 0,
        lastError: null,
        syncMode: 'online'
      });
      
      console.log('🗑️ Tutte le code sincronizzazione sono state pulite');
    } catch (error) {
      console.error('❌ Errore pulizia code:', error);
      throw error;
    }
  }

  // Cleanup
  destroy(): void {
    this.stopAutoSync();
    if (this.networkListener) {
      this.networkListener();
    }
  }
}

// Esporta istanza singleton
export const syncManager = SyncManager.getInstance();