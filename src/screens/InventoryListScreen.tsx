import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  StatusBar,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { StorageService } from '../services/StorageService';
import { colors, commonStyles, inventoryListStyles } from '../styles/theme';
import { InventoryStats, RootStackParamList } from '../types/types';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

// ─── Tipos internos ───────────────────────────────────────────────────────────

interface InventoryRow {
  id: string;
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
      const idsResult = await StorageService.getInventories();
      if (!idsResult.ok) throw new Error(idsResult.error.message);
      const ids = idsResult.value;

      const dataWithStats = await Promise.all(
        ids.map(async (id) => {
          const inventoryResult = await StorageService.loadInventory(id);
          if (!inventoryResult.ok) {
            console.warn(`Erro ao carregar inventário ${id}:`, inventoryResult.error.message);
            return { id, name: id, stats: null };
          }

          const inventory = inventoryResult.value;
          const statsResult = await StorageService.getInventoryStats(id);

          if (statsResult.ok) {
            return {
              id,
              name: inventory.metadata.name,
              stats: statsResult.value,
            };
          } else {
            console.warn(
              `Erro ao carregar estatísticas de ${inventory.metadata.name}:`,
              statsResult.error.message
            );
            return { id, name: inventory.metadata.name, stats: null };
          }
        })
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
    }, [loadAllData])
  );

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    loadAllData(true);
  }, [loadAllData]);

  // ✅ Delete usando ID
  const handleDelete = useCallback(
    (id: string, name: string) => {
      Alert.alert(
        'Excluir inventário',
        `Deseja realmente apagar "${name}"? Esta ação não pode ser desfeita.`,
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Excluir',
            style: 'destructive',
            onPress: async () => {
              const result = await StorageService.deleteInventory(id);
              if (result.ok) {
                loadAllData(true);
              } else {
                Alert.alert('Erro', result.error.message);
              }
            },
          },
        ]
      );
    },
    [loadAllData]
  );

  // ✅ Navegações
  const handleGoBack = () => {
    navigation.goBack();
  };

  const handleGoToHome = () => {
    navigation.navigate('Home');
  };

  const handleGoToImportCSV = () => {
    navigation.navigate('ImportInventory');
  };

  const handleGoToManualInventory = () => {
    navigation.navigate('ManualInventory');
  };

  const handleGoToReports = () => {
    navigation.navigate('Reports');
  };

  const handleGoToSettings = () => {
    navigation.navigate('Settings');
  };

  // ✅ Renderização do item usando ID
  const renderItem = useCallback(
    ({ item }: { item: InventoryRow }) => (
      <InventoryCard
        item={item}
        onPress={() =>
          navigation.navigate('InventoryDetail', {
            inventoryId: item.id,
            inventoryName: item.name,
          })
        }
        onDelete={() => handleDelete(item.id, item.name)}
      />
    ),
    [navigation, handleDelete]
  );

  // ─── Loading state ─────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <View style={commonStyles.loadingContainer}>
        <StatusBar barStyle="light-content" backgroundColor={colors.bg} />
        <ActivityIndicator color={colors.accent} size="large" />
        <Text style={commonStyles.loadingText}>Carregando inventários…</Text>
      </View>
    );
  }

  // ─── Render principal ──────────────────────────────────────────────────────

  return (
    <View style={commonStyles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.bg} />

      {/* Header com botão de voltar e ações */}
      <View style={inventoryListStyles.header}>
        <TouchableOpacity onPress={handleGoBack} style={inventoryListStyles.backBtn}>
          <Text style={inventoryListStyles.backBtnText}>←</Text>
        </TouchableOpacity>

        <View style={inventoryListStyles.headerCenter}>
          <Text style={inventoryListStyles.headerTitle}>Inventários</Text>
          <Text style={inventoryListStyles.headerSub}>
            {inventories.length === 0
              ? 'Nenhum inventário'
              : `${inventories.length} inventário${inventories.length > 1 ? 's' : ''}`}
          </Text>
        </View>

        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity onPress={handleGoToReports} style={inventoryListStyles.iconBtn}>
            <Text style={inventoryListStyles.iconBtnText}>📊</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleGoToSettings} style={inventoryListStyles.iconBtn}>
            <Text style={inventoryListStyles.iconBtnText}>⚙️</Text>
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        data={inventories}
        keyExtractor={(item, index) => `${item.id}-${index}`}
        renderItem={renderItem}
        contentContainerStyle={[
          inventoryListStyles.listContent,
          inventories.length === 0 && inventoryListStyles.listContentEmpty,
        ]}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={colors.accent}
            colors={[colors.accent]}
          />
        }
        ListEmptyComponent={
          <EmptyState onImport={handleGoToImportCSV} onManual={handleGoToManualInventory} />
        }
        showsVerticalScrollIndicator={false}
      />

      {/* FAB com opções */}
      <TouchableOpacity
        style={inventoryListStyles.fab}
        onPress={handleGoToImportCSV}
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
            <Text
              style={[
                inventoryListStyles.statsCount,
                isComplete && inventoryListStyles.statsCountComplete,
              ]}
            >
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
          <Text
            style={[
              inventoryListStyles.pctLabel,
              isComplete && inventoryListStyles.pctLabelComplete,
            ]}
          >
            {pct}%
          </Text>
        </View>
      ) : (
        <Text style={inventoryListStyles.statsError}>Erro ao carregar dados</Text>
      )}
    </TouchableOpacity>
  );
};

// ─── Sub-componente: estado vazio com ações ───────────────────────────────────

interface EmptyStateProps {
  onImport: () => void;
  onManual: () => void;
}

const EmptyState = ({ onImport, onManual }: EmptyStateProps) => (
  <View style={inventoryListStyles.emptyContainer}>
    <Text style={inventoryListStyles.emptyIcon}>📋</Text>
    <Text style={inventoryListStyles.emptyTitle}>Nenhum inventário encontrado</Text>
    <Text style={inventoryListStyles.emptyDesc}>
      Importe um arquivo CSV ou cadastre manualmente para começar.
    </Text>

    <View style={{ flexDirection: 'row', gap: 12, marginTop: 24 }}>
      <TouchableOpacity style={inventoryListStyles.emptyBtn} onPress={onImport}>
        <Text style={inventoryListStyles.emptyBtnText}>📄 Importar CSV</Text>
      </TouchableOpacity>
      <TouchableOpacity style={inventoryListStyles.emptyBtn} onPress={onManual}>
        <Text style={inventoryListStyles.emptyBtnText}>✏️ Cadastrar</Text>
      </TouchableOpacity>
    </View>
  </View>
);
