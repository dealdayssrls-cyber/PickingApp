// App.tsx - CORREGGI così:
import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import LoginScreen from './src/screens/LoginScreen';
import HomeScreen from './src/screens/HomeScreen';
import OrdersScreen from './src/screens/OrdersScreen';
import PickingScreen from './src/screens/PickingScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import InventoryScreen from './src/screens/InventoryScreen';

import { syncManager } from './src/services/SyncManager';
import { serverConfig } from './src/services/ServerConfig';

const Stack = createStackNavigator();

export default function App() {
  // INIZIALIZZA UNA VOLTA SOLA
  useEffect(() => {
    const initializeApp = async () => {
      await serverConfig.initialize();
      console.log('✅ App inizializzata - ServerConfig pronto');
      syncManager.startAutoSync(5);
    };
    
    initializeApp();
  }, []);

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