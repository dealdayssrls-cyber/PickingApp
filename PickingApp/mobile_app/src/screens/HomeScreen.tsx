// mobile_app/src/screens/HomeScreen.tsx
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';

interface HomeScreenProps {
  navigation: any;
  route: any;
}

export default function HomeScreen({ navigation, route }: HomeScreenProps) {
  const { operatore } = route.params || { operatore: 'Operatore' };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>🏭 Picking App</Text>
        <Text style={styles.subtitle}>Operatore: {operatore}</Text>
      </View>

      <View style={styles.menuContainer}>
        {/* GESTIONE ORDINI */}
        <TouchableOpacity
          style={styles.menuCard}
          onPress={() => navigation.navigate('Orders', { operatore })}
        >
          <Text style={styles.menuIcon}>📋</Text>
          <Text style={styles.menuTitle}>Gestione Ordini</Text>
          <Text style={styles.menuDescription}>
            Crea nuovi ordini, carica ordini da file e gestisci il picking
          </Text>
        </TouchableOpacity>

        {/* GESTIONE INVENTARIO */}
        <TouchableOpacity
          style={styles.menuCard}
          onPress={() => navigation.navigate('Inventory', { operatore })}
        >
          <Text style={styles.menuIcon}>📦</Text>
          <Text style={styles.menuTitle}>Gestione Inventario</Text>
          <Text style={styles.menuDescription}>
            Consulta l'inventario, cerca prodotti e verifica disponibilità
          </Text>
        </TouchableOpacity>

        {/* IMPOSTAZIONI */}
        <TouchableOpacity
          style={styles.menuCard}
          onPress={() => navigation.navigate('Settings', { operatore })}
        >
          <Text style={styles.menuIcon}>⚙️</Text>
          <Text style={styles.menuTitle}>Impostazioni</Text>
          <Text style={styles.menuDescription}>
            Configura connessione server e informazioni app
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.infoBox}>
        <Text style={styles.infoTitle}>ℹ️ Informazioni Rapide</Text>
        <Text style={styles.infoText}>
          • Seleziona una delle opzioni sopra per iniziare{'\n'}
          • Gestione Ordini: Per lavorare sugli ordini di picking{'\n'}
          • Gestione Inventario: Per consultare i prodotti{'\n'}
          • Impostazioni: Per configurare la connessione
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: '#f5f5f5',
    padding: 20,
  },
  header: {
    backgroundColor: '#2c3e50',
    padding: 25,
    borderRadius: 15,
    marginBottom: 20,
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
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
  menuContainer: {
    marginBottom: 20,
  },
  menuCard: {
    backgroundColor: 'white',
    padding: 25,
    borderRadius: 15,
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
    alignItems: 'center',
    borderLeftWidth: 5,
    borderLeftColor: '#3498db',
  },
  menuIcon: {
    fontSize: 40,
    marginBottom: 10,
  },
  menuTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#2c3e50',
    marginBottom: 8,
    textAlign: 'center',
  },
  menuDescription: {
    fontSize: 14,
    color: '#7f8c8d',
    textAlign: 'center',
    lineHeight: 20,
  },
  infoBox: {
    backgroundColor: '#e3f2fd',
    padding: 20,
    borderRadius: 15,
    borderLeftWidth: 4,
    borderLeftColor: '#3498db',
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#2c3e50',
  },
  infoText: {
    fontSize: 14,
    color: '#34495e',
    lineHeight: 20,
  },
});