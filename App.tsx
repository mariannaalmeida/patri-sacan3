import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { RootStackParamList } from './src/types/types';

// Importação das telas

import { HomeScreen } from './src/screens/HomeScreen';
import { ImportInventoryScreen } from './src/screens/ImportInventoryScreen';
import { InventoryDetailScreen } from './src/screens/InventoryDetailScreen';
import { InventoryListScreen } from './src/screens/InventoryListScreen';
import { ManualInventoryScreen } from './src/screens/ManualInventoryScreen';
import { ReportDetailScreen } from './src/screens/ReportDetailScreen';
import { ReportsScreen } from './src/screens/ReportsScreen';
import { ScannerScreen } from './src/screens/ScannerScreen ';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  return (
    <NavigationContainer>
      <StatusBar style="light" backgroundColor="#0A0A0F" />
      <Stack.Navigator
        initialRouteName="Home"
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#0A0A0F' },
          animation: 'slide_from_right',
        }}
      >
        {/* Telas principais */}
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen name="InventoryDetail" component={InventoryDetailScreen} />
        <Stack.Screen name="Scanner" component={ScannerScreen} />

        {/* Telas de relatório */}
        <Stack.Screen name="Reports" component={ReportsScreen} />
        <Stack.Screen name="ReportDetail" component={ReportDetailScreen} />

        {/* Telas de criação/importação */}
        <Stack.Screen name="ImportInventory" component={ImportInventoryScreen} />
        <Stack.Screen name="ManualInventory" component={ManualInventoryScreen} />
        <Stack.Screen name="InventoryList" component={InventoryListScreen} />

        {/* Telas de configuração */}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
