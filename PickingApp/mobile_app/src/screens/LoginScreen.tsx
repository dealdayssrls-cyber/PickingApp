import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, Alert } from 'react-native';

interface LoginScreenProps {
  navigation: any;
}

export default function LoginScreen({ navigation }: LoginScreenProps) {
  const [nomeOperatore, setNomeOperatore] = useState('');

  const operatoriPredefiniti = [
    'Angelo',
    'Domenico', 
    'Fabio',
    'Luciano',
    'Riccardo'
  ];

  const handleLogin = (operatore?: string) => {
    const operatoreSelezionato = operatore || nomeOperatore.trim();
    
    if (!operatoreSelezionato) {
      Alert.alert('Attenzione', 'Seleziona o inserisci il nome operatore');
      return;
    }

    Alert.alert(
      'Accesso Confermato',
      `Benvenuto ${operatoreSelezionato}!`,
      [
        {
          text: 'OK',
          onPress: () => navigation.navigate('Home', { operatore: operatoreSelezionato })
        }
      ]
    );
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>🏭 Picking App</Text>
      <Text style={styles.subtitle}>Accesso Operatore</Text>

      <View style={styles.formContainer}>
        <Text style={styles.label}>Seleziona operatore:</Text>
        
        <View style={styles.operatoriList}>
          {operatoriPredefiniti.map((operatore, index) => (
            <TouchableOpacity
              key={index}
              style={styles.operatoreBtn}
              onPress={() => handleLogin(operatore)}
            >
              <Text style={styles.operatoreText}>👤 {operatore}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.separator}>━━━━━ oppure ━━━━━</Text>

        <Text style={styles.label}>Inserisci nuovo operatore:</Text>
        <TextInput
          style={styles.input}
          value={nomeOperatore}
          onChangeText={setNomeOperatore}
          placeholder="Nome e cognome operatore"
          onSubmitEditing={() => handleLogin()}
        />
        
        <TouchableOpacity
          style={styles.loginBtn}
          onPress={() => handleLogin()}
        >
          <Text style={styles.loginBtnText}>🚀 Accedi</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.infoBox}>
        <Text style={styles.infoTitle}>ℹ️ Informazioni</Text>
        <Text style={styles.infoText}>
          • Seleziona il tuo nome dalla lista{'\n'}
          • Oppure inserisci un nuovo nome{'\n'}
          • Il nome verrà registrato nei log attività
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
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
    color: '#2c3e50',
    marginTop: 40,
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 18,
    textAlign: 'center',
    color: '#7f8c8d',
    marginBottom: 40,
  },
  formContainer: {
    backgroundColor: 'white',
    padding: 20,
    borderRadius: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 15,
    color: '#2c3e50',
  },
  operatoriList: {
    marginBottom: 20,
  },
  operatoreBtn: {
    backgroundColor: '#3498db',
    padding: 15,
    borderRadius: 10,
    marginBottom: 10,
    alignItems: 'center',
  },
  operatoreText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  separator: {
    textAlign: 'center',
    color: '#bdc3c7',
    marginVertical: 20,
    fontSize: 14,
  },
  input: {
    borderWidth: 2,
    borderColor: '#bdc3c7',
    borderRadius: 10,
    padding: 15,
    fontSize: 16,
    backgroundColor: '#f8f9fa',
    marginBottom: 20,
  },
  loginBtn: {
    backgroundColor: '#27ae60',
    padding: 18,
    borderRadius: 10,
    alignItems: 'center',
  },
  loginBtnText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  infoBox: {
    backgroundColor: '#e3f2fd',
    padding: 15,
    borderRadius: 10,
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