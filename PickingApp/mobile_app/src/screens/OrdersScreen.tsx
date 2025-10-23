import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  ScrollView, 
  Alert, 
  TextInput, 
  ActivityIndicator,
  RefreshControl 
} from 'react-native';
import { orderService, OrderFile } from '../services/orderService';
import { Ordine } from '../types';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface OrdersScreenProps {
  navigation: any;
  route: any;
}

function OrdersScreen({ navigation, route }: OrdersScreenProps) {
  const { operatore } = route.params || { operatore: 'Operatore' };
  const [nuovoOrdineNome, setNuovoOrdineNome] = useState('');
  const [ordini, setOrdini] = useState<Ordine[]>([]);
  const [orderFiles, setOrderFiles] = useState<OrderFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingOrder, setLoadingOrder] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Chiave per salvare gli ordini in AsyncStorage
  const ORDINI_STORAGE_KEY = 'ordini_in_lavorazione';

  // Carica ordini salvati all'avvio
  useEffect(() => {
    loadAndMergeOrdini();
  }, []);

  // Aggiorna ordini quando la schermata diventa attiva
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      console.log('🔄 Schermata Ordini attiva - ricarico ordini');
      loadAndMergeOrdini();
    });

    return unsubscribe;
  }, [navigation]);

  // NUOVO: Salva automaticamente quando si esce dalla schermata
  useEffect(() => {
    const unsubscribe = navigation.addListener('blur', () => {
      console.log('💾 Salvataggio automatico ordini all\'uscita...');
      salvaOrdini(ordini);
    });

    return unsubscribe;
  }, [navigation, ordini]);

  // FUNZIONE PER SALVARE GLI ORDINI
  const salvaOrdini = async (nuoviOrdini: Ordine[]) => {
    try {
      await AsyncStorage.setItem(ORDINI_STORAGE_KEY, JSON.stringify(nuoviOrdini));
      console.log('💾 Ordini salvati in storage:', nuoviOrdini.length);
    } catch (error) {
      console.error('❌ Errore salvataggio ordini:', error);
    }
  };

  // FUNZIONE PER CARICARE E MERGIARE ORDINI
  const loadAndMergeOrdini = async () => {
    try {
      setLoading(true);
      
      // Carica ordini salvati in locale
      const savedOrdini = await AsyncStorage.getItem(ORDINI_STORAGE_KEY);
      const ordiniSalvati = savedOrdini ? JSON.parse(savedOrdini) : [];
      
      console.log('📂 Ordini caricati dallo storage:', ordiniSalvati.length);
      
      // Carica file ordini disponibili
      const files = await orderService.getOrderFiles();
      
      // Filtra i file che NON sono già in ordini salvati
      const fileNamesInLavorazione = ordiniSalvati
        .map((ordine: Ordine) => ordine.fileName?.toLowerCase())
        .filter(Boolean);
      
      const filesFiltrati = files.filter(file => 
        !fileNamesInLavorazione.includes(file.name.toLowerCase())
      );
      
      // Imposta gli ordini con quelli salvati (che hanno le modifiche)
      setOrdini(ordiniSalvati);
      setOrderFiles(filesFiltrati);
      
      console.log('📊 Ordini in lavorazione:', ordiniSalvati.length);
      console.log('📁 File disponibili:', filesFiltrati.length);
      
      // DEBUG: Mostra i dettagli degli ordini caricati
      ordiniSalvati.forEach((ordine: Ordine, index: number) => {
        console.log(`📦 Ordine ${index + 1}:`, {
          nome: ordine.nome,
          operatore: ordine.operatore,
          prodottiCount: ordine.prodottiCount,
          quantitaTotaleOrdinata: ordine.quantitaTotaleOrdinata,
          quantitaTotalePrelevata: ordine.quantitaTotalePrelevata,
          stato: ordine.stato
        });
      });
      
    } catch (error) {
      console.error('Errore caricamento ordini:', error);
      setOrdini([]);
      setOrderFiles([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadAndMergeOrdini();
  };

  const creaNuovoOrdine = async () => {
    if (!nuovoOrdineNome.trim()) {
      Alert.alert('Attenzione', 'Inserisci un nome per il nuovo ordine');
      return;
    }

    try {
      const nuovoOrdine = await orderService.createNewOrder(nuovoOrdineNome, operatore);
      const nuoviOrdini = [nuovoOrdine, ...ordini];
      
      // SALVA IMMEDIATAMENTE
      await salvaOrdini(nuoviOrdini);
      setOrdini(nuoviOrdini);
      setNuovoOrdineNome('');
      
      Alert.alert(
        'Ordine Creato',
        `Ordine "${nuovoOrdineNome}" creato con successo!`,
        [
          {
            text: 'Inizia Picking',
            onPress: () => navigation.navigate('Picking', { 
              ordine: nuovoOrdine,
              operatore: operatore
            })
          },
          {
            text: 'Annulla',
            style: 'cancel'
          }
        ]
      );
    } catch (error) {
      Alert.alert('Errore', 'Impossibile creare il nuovo ordine');
    }
  };

  const caricaOrdineDaFile = async (file: OrderFile) => {
    try {
      setLoadingOrder(file.name);
      const ordine = await orderService.loadOrderFromFile(file.name);
      
      // Aggiorna l'operatore con quello corrente
      const ordineConOperatore = {
        ...ordine,
        operatore: operatore
      };
      
      Alert.alert(
        'Ordine Caricato',
        `Ordine "${ordine.nome}" caricato con successo!`,
        [
          {
            text: 'Inizia Picking',
            onPress: () => {
              // Aggiungi l'ordine alla lista SOLO se l'utente sceglie "Inizia Picking"
              const nuoviOrdini = [ordineConOperatore, ...ordini];
              
              // SALVA IMMEDIATAMENTE
              salvaOrdini(nuoviOrdini);
              setOrdini(nuoviOrdini);
              
              // Rimuovi il file dalla lista "Ordini da File"
              setOrderFiles(prevFiles => prevFiles.filter(f => f.name !== file.name));
              
              navigation.navigate('Picking', { 
                ordine: ordineConOperatore,
                operatore: operatore
              });
            }
          },
          {
            text: 'Annulla',
            style: 'cancel'
          }
        ]
      );
    } catch (error) {
      Alert.alert('Errore', `Impossibile caricare l'ordine ${file.name}`);
    } finally {
      setLoadingOrder(null);
    }
  };

  const apriOrdine = async (ordine: Ordine) => {
    console.log('🎯 Apertura ordine:', ordine.nome);
    
    // Prima di aprire, carica i dati più recenti dall'AsyncStorage
    try {
      const savedOrdini = await AsyncStorage.getItem(ORDINI_STORAGE_KEY);
      if (savedOrdini) {
        const ordiniAggiornati = JSON.parse(savedOrdini);
        const ordineRecente = ordiniAggiornati.find((o: Ordine) => o.id === ordine.id);
        
        if (ordineRecente) {
          console.log('✅ Trovato ordine aggiornato nello storage');
          // Usa l'ordine più recente dallo storage
          navigation.navigate('Picking', {
            ordine: ordineRecente,
            operatore: ordineRecente.operatore || operatore
          });
          return;
        }
      }
    } catch (error) {
      console.error('❌ Errore caricamento ordine recente:', error);
    }
    
    console.log('ℹ️ Usando ordine originale');
    // Fallback all'ordine originale
    navigation.navigate('Picking', {
      ordine: ordine,
      operatore: ordine.operatore || operatore
    });
  };

  const getStatoColor = (stato: string) => {
    switch (stato) {
      case 'in_lavorazione': return '#f39c12';
      case 'completato': return '#27ae60';
      case 'annullato': return '#e74c3c';
      default: return '#7f8c8d';
    }
  };

  const getStatoText = (stato: string) => {
    switch (stato) {
      case 'in_lavorazione': return '🟡 In Lavorazione';
      case 'completato': return '✅ Completato';
      case 'annullato': return '❌ Annullato';
      default: return stato;
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3498db" />
        <Text style={styles.loadingText}>Caricamento ordini...</Text>
      </View>
    );
  }

  return (
    <ScrollView 
      style={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          colors={['#3498db']}
          tintColor="#3498db"
        />
      }
      contentContainerStyle={styles.scrollContent}
    >
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <TouchableOpacity 
            style={styles.backButton}
            onPress={() => navigation.navigate('Home', { operatore })}
          >
            <Text style={styles.backButtonText}>🏠</Text>
          </TouchableOpacity>
          <Text style={styles.title}>📋 Gestione Ordini</Text>
          <View style={styles.placeholder} />
        </View>
        
        <View style={styles.operatoreContainer}>
          <Text style={styles.operatoreInfo}>Operatore: {operatore}</Text>
        </View>
      </View>

      {/* Creazione Nuovo Ordine */}
      <View style={styles.creaOrdineContainer}>
        <Text style={styles.sectionTitle}>Crea Nuovo Ordine</Text>
        <TextInput
          style={styles.input}
          value={nuovoOrdineNome}
          onChangeText={setNuovoOrdineNome}
          placeholder="Nome del nuovo ordine..."
          onSubmitEditing={creaNuovoOrdine}
        />
        <TouchableOpacity
          style={styles.creaOrdineBtn}
          onPress={creaNuovoOrdine}
        >
          <Text style={styles.creaOrdineBtnText}>➕ Crea Nuovo Ordine</Text>
        </TouchableOpacity>
      </View>

      {/* Ordini dalla Cartella */}
      <View style={styles.listaOrdiniContainer}>
        <Text style={styles.sectionTitle}>📁 Ordini da File ({orderFiles.length})</Text>
        
        {orderFiles.length === 0 ? (
          <Text style={styles.nessunOrdine}>Nessun file ordine trovato in shared_documents/ordini/</Text>
        ) : (
          orderFiles.map((file) => (
            <TouchableOpacity
              key={file.name}
              style={styles.fileCard}
              onPress={() => caricaOrdineDaFile(file)}
              disabled={loadingOrder === file.name}
            >
              <View style={styles.fileHeader}>
                <Text style={styles.fileNome}>📄 {file.name}</Text>
                {loadingOrder === file.name && (
                  <ActivityIndicator size="small" color="#3498db" />
                )}
              </View>
              
              <View style={styles.fileInfo}>
                <Text style={styles.fileInfoText}>
                  📅 {file.modified.toLocaleDateString()}
                </Text>
                <Text style={styles.fileInfoText}>
                  📦 {(file.size / 1024).toFixed(1)} KB
                </Text>
              </View>

              <View style={styles.fileActions}>
                <TouchableOpacity
                  style={styles.caricaFileBtn}
                  onPress={() => caricaOrdineDaFile(file)}
                  disabled={loadingOrder === file.name}
                >
                  <Text style={styles.caricaFileBtnText}>
                    {loadingOrder === file.name ? '📥 Caricamento...' : '📥 Carica Ordine'}
                  </Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          ))
        )}
      </View>

      {/* Ordini Esistenti */}
      <View style={styles.listaOrdiniContainer}>
        <Text style={styles.sectionTitle}>Ordini in Lavorazione ({ordini.length})</Text>
        
        {ordini.length === 0 ? (
          <Text style={styles.nessunOrdine}>Nessun ordine in lavorazione</Text>
        ) : (
          ordini.map((ordine) => (
            <TouchableOpacity
              key={ordine.id}
              style={styles.ordineCard}
              onPress={() => apriOrdine(ordine)}
            >
              <View style={styles.ordineHeader}>
                <Text style={styles.ordineNome}>{ordine.nome}</Text>
                <Text style={[styles.ordineStato, { color: getStatoColor(ordine.stato) }]}>
                  {getStatoText(ordine.stato)}
                </Text>
              </View>
              
              {/* Operatore */}
              <View style={styles.operatoreRow}>
                <Text style={styles.operatoreLabel}>👤 Operatore:</Text>
                <Text style={styles.operatoreValue}>{ordine.operatore}</Text>
              </View>
              
              <View style={styles.ordineInfo}>
                <Text style={styles.ordineInfoText}>📅 {ordine.dataCreazione}</Text>
                <Text style={styles.ordineInfoText}>📦 {ordine.prodottiCount} prodotti</Text>
                <Text style={styles.ordineInfoText}>
                  🎯 {ordine.quantitaTotalePrelevata || 0}/{ordine.quantitaTotaleOrdinata || 0}
                </Text>
              </View>

              <View style={styles.ordineActions}>
                <TouchableOpacity
                  style={styles.apriOrdineBtn}
                  onPress={() => apriOrdine(ordine)}
                >
                  <Text style={styles.apriOrdineBtnText}>
                    {ordine.stato === 'in_lavorazione' ? '🔄 Continua' : '👁️ Visualizza'}
                  </Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollContent: {
    flexGrow: 1,
  },
  header: {
    backgroundColor: '#2c3e50',
    padding: 20,
    paddingTop: 40,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 5,
  },
  backButton: {
    padding: 8,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 20,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backButtonText: {
    fontSize: 18,
    color: 'white',
  },
  placeholder: {
    width: 40,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
    textAlign: 'center',
  },
  operatoreContainer: {
    alignItems: 'center',
    marginTop: 5,
  },
  operatoreInfo: {
    fontSize: 16,
    color: '#bdc3c7',
    textAlign: 'center',
  },
  creaOrdineContainer: {
    backgroundColor: 'white',
    margin: 15,
    padding: 20,
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 15,
    color: '#2c3e50',
  },
  input: {
    borderWidth: 1,
    borderColor: '#bdc3c7',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 15,
    backgroundColor: '#f8f9fa',
  },
  creaOrdineBtn: {
    backgroundColor: '#3498db',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
  },
  creaOrdineBtnText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  listaOrdiniContainer: {
    backgroundColor: 'white',
    margin: 15,
    marginTop: 0,
    padding: 20,
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
    minHeight: 200,
  },
  nessunOrdine: {
    textAlign: 'center',
    color: '#7f8c8d',
    fontSize: 16,
    padding: 20,
  },
  fileCard: {
    backgroundColor: '#e8f4fd',
    padding: 15,
    borderRadius: 8,
    marginBottom: 10,
    borderLeftWidth: 4,
    borderLeftColor: '#3498db',
  },
  fileHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  fileNome: {
    fontSize: 14,
    fontWeight: 'bold',
    flex: 1,
  },
  fileInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  fileInfoText: {
    fontSize: 12,
    color: '#7f8c8d',
  },
  fileActions: {
    alignItems: 'flex-end',
  },
  caricaFileBtn: {
    backgroundColor: '#9b59b6',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 5,
  },
  caricaFileBtnText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
  ordineCard: {
    backgroundColor: '#f8f9fa',
    padding: 15,
    borderRadius: 8,
    marginBottom: 10,
    borderLeftWidth: 4,
    borderLeftColor: '#3498db',
  },
  ordineHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  ordineNome: {
    fontSize: 16,
    fontWeight: 'bold',
    flex: 1,
  },
  ordineStato: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  operatoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    backgroundColor: '#f8f9fa',
    padding: 8,
    borderRadius: 6,
  },
  operatoreLabel: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#2c3e50',
    marginRight: 5,
  },
  operatoreValue: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#3498db',
  },
  ordineInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
    flexWrap: 'wrap',
  },
  ordineInfoText: {
    fontSize: 12,
    color: '#7f8c8d',
    marginBottom: 2,
  },
  ordineActions: {
    alignItems: 'flex-end',
  },
  apriOrdineBtn: {
    backgroundColor: '#27ae60',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 5,
  },
  apriOrdineBtnText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#7f8c8d',
  },
});

export default OrdersScreen;