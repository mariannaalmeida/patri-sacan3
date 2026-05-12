/**
 * ManualInventoryScreen.tsx
 *
 * Tela para cadastro manual de inventário, item por item.
 * Útil para pequenos inventários ou quando não há arquivo CSV.
 * Suporte completo a campos dinâmicos (EAV / Dynamic Schema)
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
import { Ionicons } from '@expo/vector-icons';
import { StorageService } from '../services/StorageService';
import { colors, manualInventoryStyles, localStyles } from '../styles/theme';
import { AssetItem, AssetStatus, RootStackParamList, Inventory } from '../types/types';
import { toISODate } from '../utils/dateUtils';
import { parseBrazilianCurrencySafe } from '../utils/currencyUtils';
import { generateBasicSchema } from '../utils/schemaUtils';




type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

// ─── Tipos internos da tela ───────────────────────────────────────────────────

interface CustomFieldDef {
  id: string;
  name: string;
}

interface ManualItem {
  id: string;
  code: string;
  description: string;
  department: string;
  location: string;
  status: AssetStatus;
  value: string;
  customFields: Record<string, string>;
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const STATUS_OPTIONS: { label: string; value: AssetStatus }[] = [
  { label: 'Bom', value: 'good' },
  { label: 'Danificado', value: 'damaged' },
  { label: 'Extraviado', value: 'missing' },
  { label: 'Em Manutenção', value: 'in_repair' },
];

const createEmptyItem = (): ManualItem => ({
  id: Date.now().toString() + Math.random().toString(36).slice(2),
  code: '',
  description: '',
  department: '',
  location: '',
  status: 'good',
  value: '',
  customFields: {},
});

// ─── Componente principal ─────────────────────────────────────────────────────

export const ManualInventoryScreen = () => {
  const navigation = useNavigation<NavigationProp>();
  const styles = manualInventoryStyles;

  const [inventoryName, setInventoryName] = useState('');
  const [schemaFields, setSchemaFields] = useState<CustomFieldDef[]>([]);
  const [newFieldName, setNewFieldName] = useState('');
  const [items, setItems] = useState<ManualItem[]>([createEmptyItem()]);
  const [isLoading, setIsLoading] = useState(false);

  // ─── Navegação ──────────────────────────────────────────────────────────────

  const handleGoBack = () => navigation.goBack();

  const handleGoToHome = () => {
    const hasData = inventoryName.trim() !== '' || items.some((item) => item.code.trim() !== '');
    if (hasData) {
      Alert.alert(
        'Sair sem salvar?',
        'Você tem dados não salvos. Se voltar para a Home, perderá o que digitou. Deseja sair?',
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Sair e Perder Dados',
            style: 'destructive',
            onPress: () => navigation.navigate('Home'),
          },
        ]
      );
    } else {
      navigation.navigate('Home');
    }
  };

  // ─── Gerenciamento do Schema ────────────────────────────────────────────────

  const addSchemaField = () => {
    const trimmed = newFieldName.trim();
    if (!trimmed) return;

    const isDuplicate = schemaFields.some((f) => f.name.toLowerCase() === trimmed.toLowerCase());
    if (isDuplicate) {
      Alert.alert('Erro', 'Já existe um campo com este nome.');
      return;
    }

    setSchemaFields((prev) => [
      ...prev,
      { id: Date.now().toString() + Math.random().toString(36).slice(2), name: trimmed },
    ]);
    setNewFieldName('');
  };

  const removeSchemaField = (id: string, name: string) => {
    Alert.alert(
      'Remover campo',
      `Tem certeza? Todos os dados preenchidos em "${name}" serão perdidos.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Remover',
          style: 'destructive',
          onPress: () => {
            setSchemaFields((prev) => prev.filter((f) => f.id !== id));
            setItems((prev) =>
              prev.map((item) => {
                const updatedCustomFields = { ...item.customFields };
                delete updatedCustomFields[name];
                return { ...item, customFields: updatedCustomFields };
              })
            );
          },
        },
      ]
    );
  };

  // ─── Gerenciamento de Itens ──────────────────────────────────────────────────

  const addItem = () => setItems((prev) => [...prev, createEmptyItem()]);

  const removeItem = (id: string) => {
    if (items.length === 1) {
      Alert.alert('Atenção', 'O inventário precisa ter ao menos um item.');
      return;
    }
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const updateItem = (
    id: string,
    field: keyof Omit<ManualItem, 'customFields' | 'id'>,
    value: string
  ) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, [field]: value } : item)));
  };

  const updateCustomField = (itemId: string, fieldName: string, value: string) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== itemId) return item;
        return {
          ...item,
          customFields: { ...item.customFields, [fieldName]: value },
        };
      })
    );
  };

  // ─── Salvar ──────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!inventoryName.trim()) {
      Alert.alert('Erro', 'Digite um nome para o inventário.');
      return;
    }

    const missingCode = items.find((item) => !item.code.trim());
    if (missingCode) {
      Alert.alert('Erro', 'Todos os itens precisam ter um código preenchido.');
      return;
    }

    const codes = items.map((item) => item.code.trim().toUpperCase());
    const uniqueCodes = new Set(codes);
    if (uniqueCodes.size !== codes.length) {
      Alert.alert(
        'Erro',
        'Existem itens com códigos de patrimônio duplicados. Cada código deve ser único.'
      );
      return;
    }

    setIsLoading(true);
    try {
      const now = toISODate(new Date());

      const assetItems: AssetItem[] = items.map((item) => ({
        code: item.code.trim(),
        description: item.description.trim(),
        department: item.department.trim(),
        location: item.location.trim(),
        status: item.status,
        value: parseBrazilianCurrencySafe(item.value),
        customFields: Object.keys(item.customFields).length > 0 ? item.customFields : undefined,
        found: false,
      }));

      const id = StorageService.generateInventoryId();
      const schema = generateBasicSchema(assetItems); // gera schema a partir dos itens

      const inventory: Inventory = {
        items: assetItems,
        metadata: {
          id,
          name: inventoryName.trim(),
          importDate: now,
          totalItems: assetItems.length,
          status: 'active',
          lastModified: now,
        },
        schema,
      };

      const result = await StorageService.saveInventory(inventory);
      if (result.ok) {
        Alert.alert(
          '✅ Sucesso!',
          `Inventário "${inventoryName}" criado com ${assetItems.length} itens.`,
          [
            {
              text: 'Ver Inventário',
              onPress: () =>
                navigation.replace('InventoryDetail', {
                  inventoryId: id,
                  inventoryName: inventoryName.trim(),
                }),
            },
            {
              text: 'Ir para Home',
              style: 'cancel',
              onPress: () => navigation.navigate('Home'),
            },
          ]
        );
      } else {
        throw new Error(result.error?.message ?? 'Erro desconhecido');
      }
    } catch (error) {
      Alert.alert('Erro', error instanceof Error ? error.message : 'Falha ao criar inventário');
    } finally {
      setIsLoading(false);
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar barStyle="light-content" backgroundColor={colors.bg} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleGoBack} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Cadastro Manual</Text>
        <TouchableOpacity onPress={handleGoToHome} style={styles.homeBtn}>
          <Ionicons name="home-outline" size={22} color={colors.accent} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Nome do Inventário */}
        <View style={styles.section}>
          <Text style={styles.label}>Nome do Inventário *</Text>
          <TextInput
            style={styles.input}
            value={inventoryName}
            onChangeText={setInventoryName}
            placeholder="Ex: Patrimônio 2026"
            placeholderTextColor={colors.textDim}
          />
        </View>

        {/* ── Campos Extras ─────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.label}>Adicionar Campos Extras (Opcional)</Text>
          <Text style={localStyles.hint}>
            Adicione campos específicos do seu contexto: Marca, Modelo, Cor…
          </Text>

          {schemaFields.map((field) => (
            <View key={field.id} style={localStyles.schemaFieldRow}>
              <Text style={localStyles.schemaFieldName}>{field.name}</Text>
              <TouchableOpacity
                onPress={() => removeSchemaField(field.id, field.name)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close" size={18} color={colors.accentWarn} />
              </TouchableOpacity>
            </View>
          ))}

          <View style={localStyles.addFieldRow}>
            <TextInput
              style={[styles.input, localStyles.addFieldInput]}
              value={newFieldName}
              onChangeText={setNewFieldName}
              placeholder="Nome do campo…"
              placeholderTextColor={colors.textDim}
              onSubmitEditing={addSchemaField}
              returnKeyType="done"
            />
            <TouchableOpacity style={localStyles.addFieldBtn} onPress={addSchemaField}>
              <Text style={localStyles.addFieldBtnText}>+ Adicionar</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Itens Patrimoniais ─────────────────────────────── */}
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
                  <Ionicons name="trash-outline" size={18} color={colors.accentErr} />
                  <Text style={styles.removeButtonText}> Remover</Text>
                </TouchableOpacity>
              </View>

              {/* Campos fixos */}
              <Text style={styles.fieldLabel}>Código *</Text>
              <TextInput
                style={styles.input}
                value={item.code}
                onChangeText={(v) => updateItem(item.id, 'code', v)}
                placeholder="Ex: PAT-001"
                placeholderTextColor={colors.textDim}
                autoCapitalize="characters"
              />

              <Text style={styles.fieldLabel}>Descrição</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={item.description}
                onChangeText={(v) => updateItem(item.id, 'description', v)}
                placeholder="Descrição do item"
                placeholderTextColor={colors.textDim}
                multiline
                numberOfLines={2}
              />

              <View style={styles.row}>
                <View style={styles.halfField}>
                  <Text style={styles.fieldLabel}>Departamento</Text>
                  <TextInput
                    style={styles.input}
                    value={item.department}
                    onChangeText={(v) => updateItem(item.id, 'department', v)}
                    placeholder="Ex: TI, RH…"
                    placeholderTextColor={colors.textDim}
                  />
                </View>
                <View style={styles.halfField}>
                  <Text style={styles.fieldLabel}>Localização</Text>
                  <TextInput
                    style={styles.input}
                    value={item.location}
                    onChangeText={(v) => updateItem(item.id, 'location', v)}
                    placeholder="Ex: Sala 101"
                    placeholderTextColor={colors.textDim}
                  />
                </View>
              </View>

              <View style={styles.row}>
                <View style={styles.halfField}>
                  <Text style={styles.fieldLabel}>Status</Text>
                  <View style={localStyles.statusRow}>
                    {STATUS_OPTIONS.map((opt) => (
                      <TouchableOpacity
                        key={opt.value}
                        style={[
                          localStyles.statusChip,
                          item.status === opt.value && localStyles.statusChipActive,
                        ]}
                        onPress={() => updateItem(item.id, 'status', opt.value)}
                      >
                        <Text
                          style={[
                            localStyles.statusChipText,
                            item.status === opt.value && localStyles.statusChipTextActive,
                          ]}
                        >
                          {opt.label}
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
                    onChangeText={(v) => updateItem(item.id, 'value', v)}
                    placeholder="Ex: 1.500,00"
                    placeholderTextColor={colors.textDim}
                    keyboardType="decimal-pad"
                  />
                </View>
              </View>

              {schemaFields.length > 0 && (
                <View style={localStyles.customFieldsSection}>
                  <Text style={localStyles.customFieldsSectionTitle}>Campos Extras</Text>
                  {schemaFields.map((sf) => (
                    <View key={sf.id}>
                      <Text style={styles.fieldLabel}>{sf.name}</Text>
                      <TextInput
                        style={styles.input}
                        value={item.customFields[sf.name] ?? ''}
                        onChangeText={(v) => updateCustomField(item.id, sf.name, v)}
                        placeholder={`Digite ${sf.name.toLowerCase()}…`}
                        placeholderTextColor={colors.textDim}
                      />
                    </View>
                  ))}
                </View>
              )}
            </View>
          ))}
        </View>

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

        <View style={{ height: 40 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

