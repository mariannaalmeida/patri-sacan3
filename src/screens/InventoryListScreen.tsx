import React, { useState, useCallback } from 'react';
import {
  View,
  FlatList,
  TouchableOpacity,
  Alert,
  RefreshControl,
  Platform,
  StatusBar,
  Text,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { StorageService } from '../services/StorageService';
import { InventoryStats } from '../types/types';
import { commonStyles, inventoryListStyles } from '../styles/theme';

// ─── Navegação ────────────────────────────────────────────────────────────────

type RootStackParamList = {
  InventoryList: undefined;
  InventoryDetail: { inventoryName: string };
  CreateInventory: undefined;
};

type NavProp = NativeStackNavigationProp<RootStackParamList>;

// ─── Tipos internos ───────────────────────────────────────────────────────────

interface InventoryRow {
  name: string;
  stats: InventoryStats | null;
}

// ─── Componente principal ─────────────────────────────────────────────────────

export const InventoryListScreen = () => {
  const navigation = useNavigation<NavProp>();
  const [inventories, setInventories] = useState<InventoryRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // ─── Carregamento ──────────────────────────────────────────────────────────

  const loadAllData = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      const namesResult = await StorageService.getInventories();
      if (!namesResult.ok) throw new Error(namesResult.error.message);
      const names = namesResult.value;

      const dataWithStats = await Promise.all(
        names.map(async (name) => {
          const statsResult = await StorageService.getInventoryStats(name);
          if (statsResult.ok) {
            return { name, stats: statsResult.value };
          } else {
            console.warn(`Erro ao carregar estatísticas de ${name}:`, statsResult.error.message);
            return { name, stats: null };
          }
        }),
      );
      setInventories(dataWithStats);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro desconhecido';
      Alert.alert('Erro', `Não foi possível carregar a lista: ${message}`);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadAllData();
    }, [loadAllData]),
  );

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    loadAllData(true);
  }, [loadAllData]);

  // ─── Delete ────────────────────────────────────────────────────────────────

  const handleDelete = useCallback((name: string) => {
    Alert.alert(
      'Excluir inventário',
      `Deseja realmente apagar "${name}"? Esta ação não pode ser desfeita.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            const result = await StorageService.deleteInventory(name);
            if (result.ok) {
              loadAllData(true);
            } else {
              Alert.alert('Erro', result.error.message);
            }
          },
        },
      ],
    );
  }, [loadAllData]);

  // ─── Renderização do item ──────────────────────────────────────────────────

  const renderItem = useCallback(
    ({ item }: { item: InventoryRow }) => (
      <InventoryCard
        item={item}
        onPress={() => navigation.navigate('InventoryDetail', { inventoryName: item.name })}
        onDelete={() => handleDelete(item.name)}
      />
    ),
    [navigation, handleDelete],
  );

  // ─── Loading state ─────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <View style={commonStyles.loadingContainer}>
        <StatusBar barStyle="light-content" backgroundColor="#0A0A0F" />
        <Text style={commonStyles.loadingText}>Carregando inventários…</Text>
      </View>
    );
  }

  // ─── Render principal ──────────────────────────────────────────────────────

  return (
    <View style={commonStyles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0A0A0F" />

      <View style={inventoryListStyles.header}>
        <View>
          <Text style={inventoryListStyles.headerTitle}>PatriScan</Text>
          <Text style={inventoryListStyles.headerSub}>
            {inventories.length === 0
              ? 'Nenhum inventário'
              : `${inventories.length} inventário${inventories.length > 1 ? 's' : ''}`}
          </Text>
        </View>
      </View>

      <FlatList
        data={inventories}
        keyExtractor={(item, index) => `${item.name}-${index}`}
        renderItem={renderItem}
        contentContainerStyle={[
          inventoryListStyles.listContent,
          inventories.length === 0 && inventoryListStyles.listContentEmpty,
        ]}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor="#00E5A0"
            colors={['#00E5A0']}
          />
        }
        ListEmptyComponent={<EmptyState />}
        showsVerticalScrollIndicator={false}
      />

      <TouchableOpacity
        style={inventoryListStyles.fab}
        onPress={() => navigation.navigate('CreateInventory')}
        activeOpacity={0.85}
      >
        <Text style={inventoryListStyles.fabIcon}>+</Text>
        <Text style={inventoryListStyles.fabLabel}>Novo inventário</Text>
      </TouchableOpacity>
    </View>
  );
};

// ─── Sub-componente: card de inventário ───────────────────────────────────────

interface InventoryCardProps {
  item: InventoryRow;
  onPress: () => void;
  onDelete: () => void;
}

const InventoryCard = ({ item, onPress, onDelete }: InventoryCardProps) => {
  const pct = item.stats ? Math.round(item.stats.progress) : 0;
  const isComplete = pct === 100;

  const formattedDate = item.stats?.lastModified
    ? new Date(item.stats.lastModified).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    : null;

  return (
    <TouchableOpacity style={inventoryListStyles.card} onPress={onPress} activeOpacity={0.75}>
      <View style={inventoryListStyles.cardHeader}>
        <View style={inventoryListStyles.cardHeaderLeft}>
          <Text style={inventoryListStyles.cardName} numberOfLines={1}>
            {item.name}
          </Text>
          {formattedDate && (
            <Text style={inventoryListStyles.cardDate}>Importado em {formattedDate}</Text>
          )}
        </View>

        <View style={inventoryListStyles.cardHeaderRight}>
          {isComplete && (
            <View style={inventoryListStyles.completeBadge}>
              <Text style={inventoryListStyles.completeBadgeText}>✓ Completo</Text>
            </View>
          )}
          <TouchableOpacity
            onPress={onDelete}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={inventoryListStyles.deleteBtn}
          >
            <Text style={inventoryListStyles.deleteBtnText}>🗑</Text>
          </TouchableOpacity>
        </View>
      </View>

      {item.stats ? (
        <View>
          <View style={inventoryListStyles.statsRow}>
            <Text style={inventoryListStyles.statsLabel}>Progresso</Text>
            <Text style={[inventoryListStyles.statsCount, isComplete && inventoryListStyles.statsCountComplete]}>
              {item.stats.scannedItems}
              <Text style={inventoryListStyles.statsTotal}>/{item.stats.totalItems}</Text>
            </Text>
          </View>
          <View style={inventoryListStyles.progressTrack}>
            <View
              style={[
                inventoryListStyles.progressFill,
                { width: `${pct}%` },
                isComplete && inventoryListStyles.progressFillComplete,
              ]}
            />
          </View>
          <Text style={[inventoryListStyles.pctLabel, isComplete && inventoryListStyles.pctLabelComplete]}>
            {pct}%
          </Text>
        </View>
      ) : (
        <Text style={inventoryListStyles.statsError}>Erro ao carregar dados</Text>
      )}
    </TouchableOpacity>
  );
};

// ─── Sub-componente: estado vazio ─────────────────────────────────────────────

const EmptyState = () => (
  <View style={inventoryListStyles.emptyContainer}>
    <Text style={inventoryListStyles.emptyIcon}>📋</Text>
    <Text style={inventoryListStyles.emptyTitle}>Nenhum inventário encontrado</Text>
    <Text style={inventoryListStyles.emptyDesc}>Toque em "+ Novo inventário" para começar.</Text>
  </View>
);