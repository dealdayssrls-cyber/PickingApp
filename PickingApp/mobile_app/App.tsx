// App.tsx
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import LoginScreen from './src/screens/LoginScreen';
import HomeScreen from './src/screens/HomeScreen';
import OrdersScreen from './src/screens/OrdersScreen';
import PickingScreen from './src/screens/PickingScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import InventoryScreen from './src/screens/InventoryScreen';

// Aggiungi in App.tsx (dopo gli import)
import { syncManager } from './src/services/SyncManager';

// Inizializza sync automatica quando l'app si avvia
syncManager.startAutoSync(5); // Sync ogni 5 minuti

const Stack = createStackNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator 
        initialRouteName="Login"
        screenOptions={{
          headerStyle: {
            backgroundColor: '#2c3e50',
          },
          headerTintColor: '#fff',
          headerTitleStyle: {
            fontWeight: 'bold',
          },
        }}
      >
        <Stack.Screen 
          name="Login" 
          component={LoginScreen}
          options={{ title: 'Accesso Operatore' }}
        />
        <Stack.Screen 
          name="Home" 
          component={HomeScreen}
          options={{ title: 'Dashboard Principale' }}
        />
        <Stack.Screen 
          name="Orders" 
          component={OrdersScreen}
          options={{ title: 'Gestione Ordini' }}
        />
        <Stack.Screen 
          name="Picking" 
          component={PickingScreen}
          options={{ title: 'Picking Ordine' }}
        />
        <Stack.Screen 
          name="Settings" 
          component={SettingsScreen}
          options={{ title: 'Impostazioni' }}
        />
        <Stack.Screen 
          name="Inventory" 
          component={InventoryScreen}
          options={{ title: 'Gestione Inventario' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}