// mobile_app/src/screens/InventoryScreen.tsx
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, Alert, ActivityIndicator } from 'react-native';
import axios from 'axios';
// AGGIUNGI QUESTO IMPORT
import { serverConfig } from '../services/ServerConfig';

interface InventoryScreenProps {
  navigation: any;
  route: any;
}

export default function InventoryScreen({ navigation, route }: InventoryScreenProps) {
  const { operatore } = route.params || { operatore: 'Operatore' };
  const [searchQuery, setSearchQuery] = useState('');
  const [inventory, setInventory] = useState<any[]>([]);
  const [filteredInventory, setFilteredInventory] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  // RIMUOVI QUESTA RIGA: const [ipAddress, setIpAddress] = useState('192.168.1.67');

  const loadInventory = async () => {
    try {
      setLoading(true);
      
      // USA serverConfig invece di IP hardcoded
      const currentIP = serverConfig.getIPAddress();
      const baseURL = `http://${currentIP}:3001`;
      
      console.log(`📦 Caricamento inventario da: ${baseURL}`);
      
      const response = await axios.get(`${baseURL}/api/sync/inventory`, {
        timeout: 15000
      });

      if (response.data.success && response.data.data) {
        setInventory(response.data.data);
        setFilteredInventory(response.data.data);
        console.log(`✅ Inventario caricato: ${response.data.data.length} prodotti`);
      } else {
        throw new Error('Risposta del server non valida');
      }
    } catch (error: any) {
      const currentIP = serverConfig.getIPAddress();
      
      console.log('❌ Errore caricamento inventario:', error.message);
      console.log('🔍 Dettaglio errore:', {
        code: error.code,
        message: error.message,
        config: error.config?.url
      });
      
      let errorMessage = `Impossibile caricare l'inventario: ${error.message}`;
      
      if (error.code === 'ECONNREFUSED') {
        errorMessage = `Server non raggiungibile (${currentIP}:3001)\n\nVerifica che:\n• Il server desktop sia acceso\n• L'app desktop sia in esecuzione\n• Siano sulla stessa rete WiFi`;
      } else if (error.code === 'ENETUNREACH') {
        errorMessage = `Rete non raggiungibile\n\nVerifica la connessione WiFi`;
      } else if (error.code === 'ETIMEDOUT') {
        errorMessage = `Timeout della connessione\n\nIl server è lento o l'IP è errato`;
      }
      
      Alert.alert('❌ Errore Connessione', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const searchProducts = (query: string) => {
    setSearchQuery(query);
    if (!query.trim()) {
      setFilteredInventory(inventory);
      return;
    }

    const filtered = inventory.filter((prodotto: any) => {
      const codice = (prodotto['Cod.'] || prodotto.Cod || '').toString().toLowerCase();
      const descrizione = (prodotto.Descrizione || prodotto['Desc.'] || '').toString().toLowerCase();
      const queryLower = query.toLowerCase();

      return codice.includes(queryLower) || descrizione.includes(queryLower);
    });

    setFilteredInventory(filtered);
  };

  useEffect(() => {
    loadInventory();
  }, []);

  // ... RESTANTE DEL CODICE RIMANE UGUALE ...
  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>📦 Gestione Inventario</Text>
        <Text style={styles.subtitle}>Operatore: {operatore}</Text>
      </View>

      {/* RICERCA */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          value={searchQuery}
          onChangeText={searchProducts}
          placeholder="Cerca per codice o descrizione..."
          placeholderTextColor="#999"
        />
        <TouchableOpacity style={styles.refreshButton} onPress={loadInventory}>
          <Text style={styles.refreshButtonText}>🔄</Text>
        </TouchableOpacity>
      </View>

      {/* STATISTICHE */}
      <View style={styles.statsContainer}>
        <View style={styles.statItem}>
          <Text style={styles.statNumber}>{inventory.length}</Text>
          <Text style={styles.statLabel}>Prodotti Totali</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statNumber}>{filteredInventory.length}</Text>
          <Text style={styles.statLabel}>Prodotti Filtrati</Text>
        </View>
      </View>

      {/* LISTA INVENTARIO */}
      <View style={styles.inventoryContainer}>
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#3498db" />
            <Text style={styles.loadingText}>Caricamento inventario...</Text>
          </View>
        ) : filteredInventory.length === 0 ? (
          <Text style={styles.noProductsText}>
            {searchQuery ? 'Nessun prodotto trovato' : 'Nessun prodotto nell\'inventario'}
          </Text>
        ) : (
          filteredInventory.map((prodotto: any, index: number) => (
            <View key={index} style={styles.productCard}>
              <View style={styles.productHeader}>
                <Text style={styles.productCode}>
                  {prodotto['Cod.'] || prodotto.Cod || 'N/A'}
                </Text>
                <Text style={[
                  styles.productQuantity,
                  { color: (prodotto['Q.tà disponibile'] || 0) > 0 ? '#27ae60' : '#e74c3c' }
                ]}>
                  {prodotto['Q.tà disponibile'] || 0} pz
                </Text>
              </View>
              
              <Text style={styles.productDescription}>
                {prodotto.Descrizione || prodotto['Desc.'] || 'Descrizione non disponibile'}
              </Text>
              
              <View style={styles.productDetails}>
                <Text style={styles.productPrice}>
                  {prodotto['Listino 1 (ivato)'] ? `${prodotto['Listino 1 (ivato)']}€` : 'Prezzo N/A'}
                </Text>
                <Text style={styles.productLocation}>
                  {prodotto['Ubicazione'] || prodotto.Location || 'Locazione N/A'}
                </Text>
              </View>
            </View>
          ))
        )}
      </View>

      {/* PULSANTI AZIONE */}
      <View style={styles.actionsContainer}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => navigation.navigate('Home', { operatore })}
        >
          <Text style={styles.backButtonText}>🏠 Home</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={styles.ordersButton}
          onPress={() => navigation.navigate('Orders', { operatore })}
        >
          <Text style={styles.ordersButtonText}>📋 Vai agli Ordini</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

// ... GLI STILI RIMANGONO UGUALI ...
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: '#2c3e50',
    padding: 20,
    paddingTop: 50,
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
    marginTop: 5,
  },
  searchContainer: {
    flexDirection: 'row',
    padding: 15,
    backgroundColor: 'white',
    alignItems: 'center',
  },
  searchInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#bdc3c7',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#f8f9fa',
    marginRight: 10,
  },
  refreshButton: {
    backgroundColor: '#3498db',
    padding: 12,
    borderRadius: 8,
  },
  refreshButtonText: {
    color: 'white',
    fontSize: 18,
  },
  statsContainer: {
    flexDirection: 'row',
    padding: 15,
    backgroundColor: 'white',
    marginBottom: 1,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    padding: 10,
  },
  statNumber: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2c3e50',
  },
  statLabel: {
    fontSize: 12,
    color: '#7f8c8d',
    marginTop: 5,
  },
  inventoryContainer: {
    padding: 15,
  },
  loadingContainer: {
    alignItems: 'center',
    padding: 40,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#7f8c8d',
  },
  noProductsText: {
    textAlign: 'center',
    color: '#7f8c8d',
    fontSize: 16,
    padding: 40,
  },
  productCard: {
    backgroundColor: 'white',
    padding: 15,
    borderRadius: 8,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  productHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  productCode: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2c3e50',
  },
  productQuantity: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  productDescription: {
    fontSize: 14,
    color: '#34495e',
    marginBottom: 8,
  },
  productDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  productPrice: {
    fontSize: 14,
    color: '#27ae60',
    fontWeight: '500',
  },
  productLocation: {
    fontSize: 12,
    color: '#7f8c8d',
  },
  actionsContainer: {
    padding: 15,
    flexDirection: 'row',
    gap: 10,
  },
  backButton: {
    flex: 1,
    backgroundColor: '#95a5a6',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
  },
  backButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  ordersButton: {
    flex: 1,
    backgroundColor: '#3498db',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
  },
  ordersButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
});