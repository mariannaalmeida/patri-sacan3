// src/hooks/useAppNavigation.ts

import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types/types';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export const useAppNavigation = () => {
  const navigation = useNavigation<NavigationProp>();

  // Navegação principal
  const goToHome = () => navigation.navigate('Home');
  const goToInventoryDetail = (inventoryId: string, inventoryName: string) =>
    navigation.navigate('InventoryDetail', { inventoryId, inventoryName });
  const goToScanner = (inventoryId: string) =>
    navigation.navigate('Scanner', { inventoryId });
  
  // Navegação de relatórios
  const goToReports = () => navigation.navigate('Reports');
  const goToReportDetail = (inventoryId: string, inventoryName?: string) =>
    navigation.navigate('ReportDetail', { inventoryId, inventoryName });
  
  // Navegação de criação
  const goToImportInventory = () => navigation.navigate('ImportInventory');
  const goToManualInventory = () => navigation.navigate('ManualInventory');
  
  // Navegação de configurações
  //const goToSettings = () => navigation.navigate('Settings');
 // const goToAbout = () => navigation.navigate('About');
  
  // Voltar
  const goBack = () => navigation.goBack();

  return {
    goToHome,
    goToInventoryDetail,
    goToScanner,
    goToReports,
    goToReportDetail,
    goToImportInventory,
    goToManualInventory,
    //goToSettings,
    //goToAbout,
    goBack,
    navigation,
  };
};