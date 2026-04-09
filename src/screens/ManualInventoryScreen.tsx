/**
 * ManualInventoryScreen.tsx
 *
 * Tela para cadastro manual de inventário, item por item.
 * Útil para pequenos inventários ou quando não há arquivo CSV.
 */

import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { StorageService } from '../services/StorageService';
import { colors, manualInventoryStyles } from '../styles/theme';
import { AssetItem, AssetStatus, RootStackParamList } from '../types/types';
import { toISODate } from '../utils/dateUtils';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

interface ManualItem {
  id: string;
  code: string;
  description: string;
  department: string;
  location: string;
  status: AssetStatus;
  value: string;
}

const STATUS_OPTIONS: { label: string; value: AssetStatus }[] = [
  { label: '✅ Bom', value: 'good' },
  { label: '⚠️ Danificado', value: 'damaged' },
  { label: '❌ Extraviado', value: 'missing' },
  { label: '🔧 Em Manutenção', value: 'in_repair' },
];

export const ManualInventoryScreen = () => {
  const navigation = useNavigation<NavigationProp>();
  const styles = manualInventoryStyles;

  const [inventoryName, setInventoryName] = useState('');
  const [items, setItems] = useState<ManualItem[]>([
    {
      id: '1',
      code: '',
      description: '',
      department: '',
      location: '',
      status: 'good',
      value: '',
    },
  ]);
  const [isLoading, setIsLoading] = useState(false);

  // ✅ Resetar formulário
  const resetForm = () => {
    setInventoryName('');
    setItems([
      {
        id: '1',
        code: '',
        description: '',
        department: '',
        location: '',
        status: 'good',
        value: '',
      },
    ]);
  };

  // ✅ Navegações
  const handleGoBack = () => {
    if (inventoryName.trim() || items.some((item) => item.code.trim())) {
      Alert.alert('Cancelar cadastro', 'Deseja cancelar o cadastro? Os dados não serão salvos.', [
        { text: 'Continuar cadastro', style: 'cancel' },
        {
          text: 'Cancelar',
          style: 'destructive',
          onPress: () => navigation.goBack(),
        },
      ]);
    } else {
      navigation.goBack();
    }
  };

  const handleGoToHome = () => {
    navigation.navigate('Home');
  };

  // Adicionar novo item
  const addItem = () => {
    const newId = (items.length + 1).toString();
    setItems([
      ...items,
      {
        id: newId,
        code: '',
        description: '',
        department: '',
        location: '',
        status: 'good',
        value: '',
      },
    ]);
  };

  // Remover item
  const removeItem = (id: string) => {
    if (items.length === 1) {
      Alert.alert('Atenção', 'Você precisa ter pelo menos um item no inventário.');
      return;
    }
    setItems(items.filter((item) => item.id !== id));
  };

  // Atualizar item
  const updateItem = (id: string, field: keyof ManualItem, value: string | AssetStatus) => {
    setItems(items.map((item) => (item.id === id ? { ...item, [field]: value } : item)));
  };

  // Validar formulário
  const validateForm = (): boolean => {
    if (!inventoryName.trim()) {
      Alert.alert('Erro', 'Digite um nome para o inventário');
      return false;
    }

    const emptyItems = items.filter((item) => !item.code.trim());
    if (emptyItems.length > 0) {
      Alert.alert('Erro', `Existem ${emptyItems.length} item(s) sem código preenchido`);
      return false;
    }

    const duplicateCodes = items.filter(
      (item, index) => items.findIndex((i) => i.code === item.code) !== index
    );
    if (duplicateCodes.length > 0) {
      Alert.alert('Erro', 'Existem códigos duplicados. Cada item deve ter um código único.');
      return false;
    }

    return true;
  };

  // Converter valor monetário
  const parseValue = (valueStr: string): number | undefined => {
    if (!valueStr.trim()) return undefined;
    const cleaned = valueStr.replace(/\./g, '').replace(',', '.');
    const num = parseFloat(cleaned);
    return isNaN(num) ? undefined : num;
  };

  // Salvar inventário
  const handleSave = async () => {
    if (!validateForm()) return;

    setIsLoading(true);
    try {
      const now = toISODate(new Date());

      const assetItems: AssetItem[] = items.map((item) => ({
        code: item.code.trim(),
        description: item.description.trim(),
        department: item.department.trim(),
        location: item.location.trim(),
        status: item.status,
        value: parseValue(item.value),
        found: false,
      }));

      const id = StorageService.generateInventoryId();
      const inventory = {
        items: assetItems,
        metadata: {
          id,
          name: inventoryName.trim(),
          importDate: now,
          totalItems: assetItems.length,
          status: 'active' as const,
          lastModified: now,
        },
      };

      const result = await StorageService.saveInventory(inventory);

      if (result.ok) {
        Alert.alert(
          '✅ Sucesso!',
          `Inventário "${inventoryName}" criado com ${assetItems.length} itens.`,
          [
            {
              text: 'Ver Inventário',
              onPress: () => {
                resetForm();
                navigation.replace('InventoryDetail', {
                  inventoryId: id,
                  inventoryName: inventoryName.trim(),
                });
              },
            },
            {
              text: 'Criar outro',
              onPress: () => {
                resetForm();
              },
            },
            {
              text: 'Ir para Home',
              style: 'cancel',
              onPress: () => {
                resetForm();
                navigation.navigate('Home');
              },
            },
          ]
        );
      } else {
        throw new Error(result.error.message);
      }
    } catch (error) {
      Alert.alert('Erro', error instanceof Error ? error.message : 'Falha ao criar inventário');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar barStyle="light-content" backgroundColor={colors.bg} />

      {/* Header com botão de voltar */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleGoBack} style={styles.backBtn}>
          <Text style={styles.backBtnText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Cadastro Manual</Text>
        <TouchableOpacity onPress={handleGoToHome} style={styles.homeBtn}>
          <Text style={styles.homeBtnText}>🏠</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Nome do inventário */}
        <View style={styles.section}>
          <Text style={styles.label}>Nome do Inventário *</Text>
          <TextInput
            style={styles.input}
            value={inventoryName}
            onChangeText={setInventoryName}
            placeholder="Ex: Patrimônio 2024"
            placeholderTextColor={colors.textDim}
          />
        </View>

        {/* Lista de itens */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.label}>Itens Patrimoniais *</Text>
            <TouchableOpacity style={styles.addButton} onPress={addItem}>
              <Text style={styles.addButtonText}>+ Adicionar Item</Text>
            </TouchableOpacity>
          </View>

          {items.map((item, index) => (
            <View key={item.id} style={styles.itemCard}>
              <View style={styles.itemHeader}>
                <Text style={styles.itemTitle}>Item {index + 1}</Text>
                <TouchableOpacity onPress={() => removeItem(item.id)} style={styles.removeButton}>
                  <Text style={styles.removeButtonText}>🗑 Remover</Text>
                </TouchableOpacity>
              </View>

              {/* Código */}
              <Text style={styles.fieldLabel}>Código *</Text>
              <TextInput
                style={styles.input}
                value={item.code}
                onChangeText={(value) => updateItem(item.id, 'code', value)}
                placeholder="Ex: PAT-001"
                placeholderTextColor={colors.textDim}
                autoCapitalize="characters"
              />

              {/* Descrição */}
              <Text style={styles.fieldLabel}>Descrição</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={item.description}
                onChangeText={(value) => updateItem(item.id, 'description', value)}
                placeholder="Descrição do item"
                placeholderTextColor={colors.textDim}
                multiline
                numberOfLines={2}
              />

              {/* Linha: Departamento + Localização */}
              <View style={styles.row}>
                <View style={styles.halfField}>
                  <Text style={styles.fieldLabel}>Departamento</Text>
                  <TextInput
                    style={styles.input}
                    value={item.department}
                    onChangeText={(value) => updateItem(item.id, 'department', value)}
                    placeholder="Ex: Administrativo"
                    placeholderTextColor={colors.textDim}
                  />
                </View>

                <View style={styles.halfField}>
                  <Text style={styles.fieldLabel}>Localização</Text>
                  <TextInput
                    style={styles.input}
                    value={item.location}
                    onChangeText={(value) => updateItem(item.id, 'location', value)}
                    placeholder="Ex: Sala 101"
                    placeholderTextColor={colors.textDim}
                  />
                </View>
              </View>

              {/* Linha: Status + Valor */}
              <View style={styles.row}>
                <View style={styles.halfField}>
                  <Text style={styles.fieldLabel}>Status</Text>
                  <View style={styles.statusPicker}>
                    {STATUS_OPTIONS.map((option) => (
                      <TouchableOpacity
                        key={option.value}
                        style={[
                          styles.statusOption,
                          item.status === option.value && styles.statusOptionActive,
                        ]}
                        onPress={() => updateItem(item.id, 'status', option.value)}
                      >
                        <Text
                          style={[
                            styles.statusOptionText,
                            item.status === option.value && styles.statusOptionTextActive,
                          ]}
                        >
                          {option.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                <View style={styles.halfField}>
                  <Text style={styles.fieldLabel}>Valor (R$)</Text>
                  <TextInput
                    style={styles.input}
                    value={item.value}
                    onChangeText={(value) => updateItem(item.id, 'value', value)}
                    placeholder="Ex: 1.500,00"
                    placeholderTextColor={colors.textDim}
                    keyboardType="decimal-pad"
                  />
                </View>
              </View>
            </View>
          ))}
        </View>

        {/* Botão salvar */}
        <TouchableOpacity
          style={[styles.saveButton, isLoading && styles.buttonDisabled]}
          onPress={handleSave}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color="#000" />
          ) : (
            <Text style={styles.saveButtonText}>Salvar Inventário</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};
