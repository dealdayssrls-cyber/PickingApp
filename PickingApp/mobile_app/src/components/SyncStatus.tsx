// mobile_app/src/components/SyncStatus.tsx
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { syncManager, SyncStatus } from '../services/SyncManager';

interface SyncStatusProps {
  compact?: boolean;
}

export default function SyncStatusComponent({ compact = false }: SyncStatusProps) {
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    isSyncing: false,
    lastSync: null,
    pendingOperations: 0,
    lastError: null
  });
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadSyncStatus = async () => {
    try {
      const status = await syncManager.getSyncStatus();
      setSyncStatus(status);
    } catch (error) {
      console.error('❌ Errore caricamento stato sync:', error);
    }
  };

  const handleManualSync = async () => {
    if (syncStatus.isSyncing) return;
    
    setIsRefreshing(true);
    await syncManager.triggerSync();
    await loadSyncStatus();
    setIsRefreshing(false);
  };

  useEffect(() => {
    loadSyncStatus();
    
    // Aggiorna stato ogni 30 secondi
    const interval = setInterval(loadSyncStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  if (compact) {
    return (
      <TouchableOpacity 
        style={[
          styles.compactContainer,
          syncStatus.isSyncing && styles.syncing,
          syncStatus.lastError && styles.error
        ]}
        onPress={handleManualSync}
        disabled={syncStatus.isSyncing}
      >
        {syncStatus.isSyncing ? (
          <ActivityIndicator size="small" color="#ffffff" />
        ) : (
          <Text style={styles.compactText}>
            {syncStatus.pendingOperations > 0 ? '🔴' : '🟢'} 
            {syncStatus.pendingOperations}
          </Text>
        )}
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.statusRow}>
        <Text style={styles.label}>Stato Sincronizzazione:</Text>
        <View style={styles.statusIndicator}>
          {syncStatus.isSyncing ? (
            <>
              <ActivityIndicator size="small" color="#3498db" />
              <Text style={styles.syncingText}>Sincronizzazione...</Text>
            </>
          ) : syncStatus.lastError ? (
            <Text style={styles.errorText}>❌ Errore</Text>
          ) : (
            <Text style={styles.successText}>
              {syncStatus.pendingOperations === 0 ? '✅ Aggiornato' : '⚠️ In sospeso'}
            </Text>
          )}
        </View>
      </View>

      <View style={styles.detailsRow}>
        <Text style={styles.detailText}>
          Operazioni in sospeso: <Text style={styles.detailValue}>{syncStatus.pendingOperations}</Text>
        </Text>
        
        {syncStatus.lastSync && (
          <Text style={styles.detailText}>
            Ultima sync: <Text style={styles.detailValue}>
              {new Date(syncStatus.lastSync).toLocaleTimeString()}
            </Text>
          </Text>
        )}
      </View>

      {syncStatus.lastError && (
        <Text style={styles.errorMessage}>
          Errore: {syncStatus.lastError}
        </Text>
      )}

      <TouchableOpacity 
        style={[
          styles.syncButton,
          (syncStatus.isSyncing || syncStatus.pendingOperations === 0) && styles.disabledButton
        ]}
        onPress={handleManualSync}
        disabled={syncStatus.isSyncing || syncStatus.pendingOperations === 0}
      >
        {isRefreshing ? (
          <ActivityIndicator size="small" color="#ffffff" />
        ) : (
          <Text style={styles.syncButtonText}>
            🔄 Sincronizza Ora
          </Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#f8f9fa',
    padding: 15,
    borderRadius: 10,
    borderLeftWidth: 4,
    borderLeftColor: '#3498db',
    marginVertical: 10,
  },
  compactContainer: {
    backgroundColor: '#3498db',
    padding: 8,
    borderRadius: 20,
    minWidth: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
  syncing: {
    backgroundColor: '#f39c12',
  },
  error: {
    backgroundColor: '#e74c3c',
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2c3e50',
  },
  statusIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  syncingText: {
    fontSize: 12,
    color: '#f39c12',
    fontWeight: '500',
  },
  successText: {
    fontSize: 12,
    color: '#27ae60',
    fontWeight: '500',
  },
  errorText: {
    fontSize: 12,
    color: '#e74c3c',
    fontWeight: '500',
  },
  detailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  detailText: {
    fontSize: 12,
    color: '#7f8c8d',
  },
  detailValue: {
    fontWeight: '600',
    color: '#2c3e50',
  },
  errorMessage: {
    fontSize: 11,
    color: '#e74c3c',
    fontStyle: 'italic',
    marginBottom: 8,
  },
  syncButton: {
    backgroundColor: '#3498db',
    padding: 10,
    borderRadius: 6,
    alignItems: 'center',
  },
  disabledButton: {
    backgroundColor: '#bdc3c7',
  },
  syncButtonText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
});