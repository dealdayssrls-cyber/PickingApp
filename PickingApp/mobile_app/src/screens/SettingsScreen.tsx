// mobile_app/src/screens/SettingsScreen.tsx
import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TextInput, 
  TouchableOpacity, 
  ScrollView, 
  Alert, 
  Switch,
  ActivityIndicator
} from 'react-native';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import SyncStatusComponent from '../components/SyncStatus';
import { syncManager } from '../services/SyncManager';
import { SyncStatus } from '../services/SyncManager';
import { orderService } from '../services/orderService';

interface SettingsScreenProps {
  navigation: any;
  route: any;
}

export default function SettingsScreen({ navigation, route }: SettingsScreenProps) {
  const { operatore } = route.params || { operatore: 'Operatore' };
  const [ipAddress, setIpAddress] = useState('192.168.1.67');
  const [serverStatus, setServerStatus] = useState<'checking' | 'connected' | 'error'>('checking');
  const [inventoryCount, setInventoryCount] = useState(0);
  const [autoSync, setAutoSync] = useState(true);
  
  // ✅ DICHIARAZIONE CORRETTA - TUTTE LE PROPRIETÀ CON VIRGOLE
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    isSyncing: false,
    lastSync: null,
    pendingOperations: 0,
    lastError: null,
    syncMode: 'online'
  });
  
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [isManualSyncing, setIsManualSyncing] = useState(false);

  // Carica le impostazioni salvate all'avvio
  useEffect(() => {
    loadSavedSettings();
    loadSyncStatus();
    
    // Aggiorna stato ogni 10 secondi
    const interval = setInterval(loadSyncStatus, 10000);
    return () => clearInterval(interval);
  }, []);

  // Carica impostazioni salvate
  const loadSavedSettings = async () => {
    try {
      const savedIP = await AsyncStorage.getItem('server_ip');
      if (savedIP) {
        setIpAddress(savedIP);
        orderService.updateServerIP(savedIP);
      }
      
      const savedAutoSync = await AsyncStorage.getItem('auto_sync');
      if (savedAutoSync !== null) {
        const autoSyncValue = JSON.parse(savedAutoSync);
        setAutoSync(autoSyncValue);
        if (autoSyncValue) {
          syncManager.startAutoSync(5);
        } else {
          syncManager.stopAutoSync();
        }
      } else {
        // Default: auto sync attiva
        syncManager.startAutoSync(5);
      }
    } catch (error) {
      console.error('❌ Errore caricamento impostazioni:', error);
    }
  };

  // Salva impostazioni IP
  const saveIPSettings = async (ip: string) => {
    try {
      await AsyncStorage.setItem('server_ip', ip);
      orderService.updateServerIP(ip);
      console.log('💾 IP server salvato:', ip);
    } catch (error) {
      console.error('❌ Errore salvataggio IP:', error);
    }
  };

  // Carica stato sincronizzazione
  const loadSyncStatus = async () => {
    try {
      const status = await syncManager.getSyncStatus();
      setSyncStatus(status);
    } catch (error) {
      console.error('❌ Errore caricamento stato sync:', error);
      // Se c'è errore, imposta uno stato di default valido
      setSyncStatus({
        isSyncing: false,
        lastSync: null,
        pendingOperations: 0,
        lastError: null,
        syncMode: 'online' // AGGIUNGI QUESTO
      });
    }
  };

  // Test connessione server
  const testConnection = async () => {
    try {
      setIsTestingConnection(true);
      setServerStatus('checking');
      
      const response = await axios.get(`http://${ipAddress}:3001/api/health`, {
        timeout: 5000
      });
      
      if (response.data.status === 'ok') {
        setServerStatus('connected');
        
        // Prova a caricare anche l'inventario
        try {
          const inventoryResponse = await axios.get(`http://${ipAddress}:3001/api/sync/inventory`, {
            timeout: 5000
          });
          if (inventoryResponse.data.success) {
            setInventoryCount(inventoryResponse.data.count || inventoryResponse.data.data?.length || 0);
          }
        } catch (inventoryError) {
          console.log('ℹ️ Inventario non disponibile');
        }
        
        // Salva l'IP se la connessione è riuscita
        await saveIPSettings(ipAddress);
        
        Alert.alert('✅ Connessione Riuscita', 'Server desktop raggiunto con successo!');
      } else {
        setServerStatus('error');
        Alert.alert('❌ Errore', 'Server non risponde correttamente');
      }
    } catch (error: any) {
      setServerStatus('error');
      console.error('❌ Errore connessione:', error);
      
      let errorMessage = 'Impossibile raggiungere il server desktop.';
      if (error.code === 'ECONNREFUSED') {
        errorMessage = 'Connessione rifiutata. Verifica che il server desktop sia in esecuzione.';
      } else if (error.code === 'ENETUNREACH') {
        errorMessage = 'Rete non raggiungibile. Verifica la connessione WiFi.';
      } else if (error.code === 'ETIMEDOUT') {
        errorMessage = 'Timeout della connessione. Verifica l\'indirizzo IP.';
      }
      
      Alert.alert('❌ Errore Connessione', errorMessage);
    } finally {
      setIsTestingConnection(false);
    }
  };

  const testInventoryConnection = async () => {
  try {
    setIsTestingConnection(true);
    
    const response = await axios.get(`http://${ipAddress}:3001/api/debug/inventory-test`, {
      timeout: 10000
    });
    
    if (response.data.success) {
      Alert.alert(
        '✅ Test Inventario Riuscito', 
        `Inventario accessibile: ${response.data.count} prodotti\n\nPercorso: ${response.data.path}`
      );
    } else {
      Alert.alert(
        '❌ Test Inventario Fallito', 
        `Errore: ${response.data.error}\n\nPercorso: ${response.data.path}`
      );
    }
  } catch (error: any) {
    Alert.alert(
      '❌ Test Inventario Fallito', 
      `Impossibile accedere all'inventario: ${error.message}`
    );
  } finally {
    setIsTestingConnection(false);
  }
};

  // Gestione sync automatica
  const handleAutoSyncToggle = async (value: boolean) => {
    setAutoSync(value);
    try {
      await AsyncStorage.setItem('auto_sync', JSON.stringify(value));
      
      if (value) {
        syncManager.startAutoSync(5); // Sync ogni 5 minuti
        Alert.alert('🔄 Sync Automatica', 'Sincronizzazione automatica attivata');
      } else {
        syncManager.stopAutoSync();
        Alert.alert('⏹️ Sync Automatica', 'Sincronizzazione automatica disattivata');
      }
    } catch (error) {
      console.error('❌ Errore salvataggio impostazione auto sync:', error);
    }
  };

  // Sync manuale
  const handleManualSync = async () => {
    if (syncStatus.isSyncing) {
      Alert.alert('ℹ️ Sync in Corso', 'Sincronizzazione già in corso, attendi il completamento.');
      return;
    }

    Alert.alert(
      '🔄 Sincronizzazione Manuale',
      'Vuoi sincronizzare ora tutti i dati pendenti?',
      [
        {
          text: 'Annulla',
          style: 'cancel'
        },
        {
          text: 'Sincronizza',
          onPress: async () => {
            try {
              setIsManualSyncing(true);
              
              // Forza aggiornamento contatore prima della sync
              await syncManager.updatePendingOperationsCount();
              await loadSyncStatus();
              
              const result = await syncManager.triggerSync();
              
              if (result.success) {
                Alert.alert('✅ Successo', result.message);
              } else {
                Alert.alert('⚠️ Sincronizzazione Parziale', result.message);
              }
              
            } catch (error: any) {
              Alert.alert('❌ Errore', `Errore durante la sincronizzazione: ${error.message}`);
            } finally {
              setIsManualSyncing(false);
              await loadSyncStatus();
            }
          }
        }
      ]
    );
  };

  // Pulisci coda sync
  const handleClearSyncQueue = async () => {
    if (syncStatus.pendingOperations === 0) {
      Alert.alert('ℹ️ Coda Vuota', 'Non ci sono operazioni in sospeso da pulire.');
      return;
    }

    Alert.alert(
      '🗑️ Pulisci Coda Sync',
      `Sei sicuro di voler cancellare tutte le ${syncStatus.pendingOperations} operazioni in sospeso?\n\nQuesta operazione non può essere annullata.`,
      [
        {
          text: 'Annulla',
          style: 'cancel'
        },
        {
          text: 'Pulisci',
          style: 'destructive',
          onPress: async () => {
            try {
              await syncManager.clearAllQueues();
              Alert.alert('✅ Successo', 'Coda sincronizzazione pulita');
              await loadSyncStatus();
            } catch (error: any) {
              Alert.alert('❌ Errore', `Impossibile pulire la coda: ${error.message}`);
            }
          }
        }
      ]
    );
  };

  // Ripristina impostazioni
  const handleResetSettings = () => {
    Alert.alert(
      '🔄 Ripristina Impostazioni',
      'Vuoi ripristinare tutte le impostazioni ai valori predefiniti?',
      [
        {
          text: 'Annulla',
          style: 'cancel'
        },
        {
          text: 'Ripristina',
          style: 'destructive',
          onPress: async () => {
            try {
              setIpAddress('192.168.1.67');
              setAutoSync(true);
              
              await AsyncStorage.setItem('server_ip', '192.168.1.67');
              await AsyncStorage.setItem('auto_sync', JSON.stringify(true));
              
              orderService.updateServerIP('192.168.1.67');
              syncManager.startAutoSync(5);
              
              Alert.alert('✅ Successo', 'Impostazioni ripristinate');
              await loadSyncStatus();
            } catch (error) {
              Alert.alert('❌ Errore', 'Impossibile ripristinare le impostazioni');
            }
          }
        }
      ]
    );
  };

  const getStatusColor = () => {
    switch (serverStatus) {
      case 'connected': return '#27ae60';
      case 'error': return '#e74c3c';
      case 'checking': return '#f39c12';
      default: return '#7f8c8d';
    }
  };

  const getStatusText = () => {
    switch (serverStatus) {
      case 'connected': return '✅ Connesso';
      case 'error': return '❌ Errore';
      case 'checking': return '🔄 Controllo...';
      default: return '⚪ Sconosciuto';
    }
  };

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* HEADER */}
      <View style={styles.header}>
        <Text style={styles.title}>⚙️ Impostazioni</Text>
        <Text style={styles.subtitle}>Operatore: {operatore}</Text>
      </View>

      {/* SEZIONE STATO SINCRONIZZAZIONE */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🔄 Stato Sincronizzazione</Text>
        
        <SyncStatusComponent />
        
        {/* DETTAGLI STATO */}
        <View style={styles.statusDetails}>
          <View style={styles.detailItem}>
            <Text style={styles.detailLabel}>Operazioni pendenti:</Text>
            <Text style={[
              styles.detailValue,
              syncStatus.pendingOperations > 0 ? styles.pendingValue : styles.zeroValue
            ]}>
              {syncStatus.pendingOperations}
            </Text>
          </View>
          
          {syncStatus.lastSync && (
            <View style={styles.detailItem}>
              <Text style={styles.detailLabel}>Ultima sincronizzazione:</Text>
              <Text style={styles.detailValue}>
                {new Date(syncStatus.lastSync).toLocaleString('it-IT')}
              </Text>
            </View>
          )}
          
          {syncStatus.lastError && (
            <View style={styles.detailItem}>
              <Text style={styles.detailLabel}>Ultimo errore:</Text>
              <Text style={styles.errorValue}>
                {syncStatus.lastError}
              </Text>
            </View>
          )}
        </View>

        {/* IMPOSTAZIONI SYNC */}
        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Sincronizzazione Automatica</Text>
            <Text style={styles.settingDescription}>
              Sincronizza automaticamente ogni 5 minuti
            </Text>
          </View>
          <Switch
            value={autoSync}
            onValueChange={handleAutoSyncToggle}
            trackColor={{ false: '#bdc3c7', true: '#3498db' }}
            thumbColor={autoSync ? '#ffffff' : '#ffffff'}
          />
        </View>

        {/* AZIONI SYNC */}
        <View style={styles.actionButtons}>
          <TouchableOpacity 
            style={[
              styles.actionButton,
              styles.primaryButton,
              (syncStatus.isSyncing || syncStatus.pendingOperations === 0) && styles.disabledButton
            ]}
            onPress={handleManualSync}
            disabled={syncStatus.isSyncing || syncStatus.pendingOperations === 0}
          >
            {isManualSyncing ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <Text style={styles.buttonText}>
                🔄 Sincronizza Ora
              </Text>
            )}
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[
              styles.actionButton,
              styles.secondaryButton,
              syncStatus.pendingOperations === 0 && styles.disabledButton
            ]}
            onPress={handleClearSyncQueue}
            disabled={syncStatus.pendingOperations === 0}
          >
            <Text style={styles.secondaryButtonText}>🗑️ Pulisci Coda</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* CONNESSIONE SERVER */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🔗 Connessione Server</Text>
        
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Indirizzo IP Server Desktop:</Text>
          <TextInput
            style={styles.input}
            value={ipAddress}
            onChangeText={setIpAddress}
            placeholder="192.168.1.xxx"
            keyboardType="numbers-and-punctuation"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Text style={styles.inputHelp}>
            Inserisci l'indirizzo IP del computer dove è in esecuzione il server desktop
          </Text>
        </View>

        <View style={styles.statusContainer}>
          <Text style={styles.statusLabel}>Stato connessione:</Text>
          <View style={styles.statusIndicator}>
            {isTestingConnection ? (
              <ActivityIndicator size="small" color="#f39c12" />
            ) : (
              <View style={[styles.statusDot, { backgroundColor: getStatusColor() }]} />
            )}
            <Text style={[styles.statusText, { color: getStatusColor() }]}>
              {getStatusText()}
            </Text>
          </View>
        </View>

        {serverStatus === 'connected' && inventoryCount > 0 && (
          <View style={styles.infoBox}>
            <Text style={styles.infoText}>📦 Inventario caricato: {inventoryCount} prodotti</Text>
          </View>
        )}

        <TouchableOpacity 
          style={[
            styles.testButton,
            isTestingConnection && styles.disabledButton
          ]} 
          onPress={testConnection}
          disabled={isTestingConnection}
        >
          {isTestingConnection ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <Text style={styles.testButtonText}>🔍 Test Connessione</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* IMPOSTAZIONI APP */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>📱 Impostazioni App</Text>
        
        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Notifiche Sync</Text>
            <Text style={styles.settingDescription}>
              Mostra notifiche per sincronizzazioni riuscite o fallite
            </Text>
          </View>
          <Switch
            value={true}
            onValueChange={() => {}}
            trackColor={{ false: '#bdc3c7', true: '#3498db' }}
          />
        </View>

        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Salvataggio Automatico</Text>
            <Text style={styles.settingDescription}>
              Salva automaticamente i progressi degli ordini
            </Text>
          </View>
          <Switch
            value={true}
            onValueChange={() => {}}
            trackColor={{ false: '#bdc3c7', true: '#3498db' }}
          />
        </View>
      </View>

      {/* INFORMAZIONI SISTEMA */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>ℹ️ Informazioni Sistema</Text>
        
        <View style={styles.infoGrid}>
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>Versione App:</Text>
            <Text style={styles.infoValue}>1.0.0</Text>
          </View>
          
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>Porta Server:</Text>
            <Text style={styles.infoValue}>3001</Text>
          </View>
          
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>Tipo:</Text>
            <Text style={styles.infoValue}>Picking App Mobile</Text>
          </View>

          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>Sviluppatore:</Text>
            <Text style={styles.infoValue}>Team Picking App</Text>
          </View>

          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>Ultimo Aggiornamento:</Text>
            <Text style={styles.infoValue}>18/10/2025</Text>
          </View>
        </View>
      </View>

      {/* AZIONI RAPIDE */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🎯 Azioni Rapide</Text>
        
        <TouchableOpacity 
          style={styles.quickActionButton}
          onPress={() => navigation.navigate('Home', { operatore })}
        >
          <Text style={styles.quickActionText}>🏠 Torna alla Home</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={styles.quickActionButton}
          onPress={() => navigation.navigate('Orders', { operatore })}
        >
          <Text style={styles.quickActionText}>📋 Vai agli Ordini</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={styles.quickActionButton}
          onPress={() => navigation.navigate('Inventory', { operatore })}
        >
          <Text style={styles.quickActionText}>📦 Vai all'Inventario</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.quickActionButton, styles.warningButton]}
          onPress={handleResetSettings}
        >
          <Text style={styles.warningButtonText}>🔄 Ripristina Impostazioni</Text>
        </TouchableOpacity>
      </View>

      {/* FOOTER */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>
          Picking App Mobile v1.0.0{'\n'}
          Connesso come: {operatore}
        </Text>
      </View>
    </ScrollView>
  );
}


const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  header: {
    backgroundColor: '#2c3e50',
    padding: 25,
    paddingTop: 60,
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#bdc3c7',
    textAlign: 'center',
    marginTop: 8,
  },
  section: {
    backgroundColor: 'white',
    margin: 16,
    marginVertical: 8,
    padding: 20,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
    color: '#2c3e50',
  },
  // Stili per stato sincronizzazione
  statusDetails: {
    backgroundColor: '#f8f9fa',
    padding: 15,
    borderRadius: 8,
    marginVertical: 10,
    borderLeftWidth: 3,
    borderLeftColor: '#3498db',
  },
  detailItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  detailLabel: {
    fontSize: 14,
    color: '#7f8c8d',
    fontWeight: '500',
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2c3e50',
  },
  pendingValue: {
    color: '#e67e22',
    fontWeight: 'bold',
  },
  zeroValue: {
    color: '#27ae60',
    fontWeight: 'bold',
  },
  errorValue: {
    fontSize: 12,
    color: '#e74c3c',
    fontStyle: 'italic',
    textAlign: 'right',
    flex: 1,
    marginLeft: 10,
  },
  // Stili impostazioni
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    paddingVertical: 10,
  },
  settingInfo: {
    flex: 1,
    marginRight: 15,
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2c3e50',
    marginBottom: 4,
  },
  settingDescription: {
    fontSize: 12,
    color: '#7f8c8d',
    lineHeight: 16,
  },
  // Pulsanti azione
  actionButtons: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  actionButton: {
    flex: 1,
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
  },
  primaryButton: {
    backgroundColor: '#3498db',
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#e74c3c',
  },
  disabledButton: {
    opacity: 0.6,
  },
  buttonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
  secondaryButtonText: {
    color: '#e74c3c',
    fontSize: 14,
    fontWeight: 'bold',
  },
  // Stili connessione server
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
    color: '#2c3e50',
  },
  input: {
    borderWidth: 1,
    borderColor: '#bdc3c7',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#f8f9fa',
    marginBottom: 5,
  },
  inputHelp: {
    fontSize: 12,
    color: '#7f8c8d',
    fontStyle: 'italic',
  },
  statusContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
    padding: 15,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
  },
  statusIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2c3e50',
  },
  statusText: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  infoBox: {
    backgroundColor: '#e8f4fd',
    padding: 12,
    borderRadius: 8,
    marginBottom: 15,
    borderLeftWidth: 4,
    borderLeftColor: '#3498db',
  },
  infoText: {
    fontSize: 14,
    color: '#2c3e50',
    fontWeight: '500',
  },
  testButton: {
    backgroundColor: '#27ae60',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
  },
  testButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  // Informazioni sistema
  infoGrid: {
    gap: 12,
  },
  infoItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#ecf0f1',
  },
  infoLabel: {
    fontSize: 14,
    color: '#7f8c8d',
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2c3e50',
  },
  // Azioni rapide
  quickActionButton: {
    backgroundColor: '#3498db',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 10,
  },
  quickActionText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  warningButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#e74c3c',
    marginTop: 10,
  },
  warningButtonText: {
    color: '#e74c3c',
    fontSize: 16,
    fontWeight: 'bold',
  },
  // Footer
  footer: {
    backgroundColor: '#34495e',
    padding: 20,
    alignItems: 'center',
    marginTop: 10,
  },
  footerText: {
    color: '#bdc3c7',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 16,
  },
});