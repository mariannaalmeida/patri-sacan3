import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Alert,
  RefreshControl,
  Platform,
  StatusBar,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { useNavigation, useRoute, RouteProp, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { StorageService } from '../services/StorageService';
import { ScannerService } from '../services/ScannerService';
import { AssetItem, Inventory, RootStackParamList } from '../types/types';
import { commonStyles, inventoryDetailStyles } from '../styles/theme';

type DetailRouteProp = RouteProp<RootStackParamList, 'InventoryDetail'>;
type NavProp = NativeStackNavigationProp<RootStackParamList>;

type FilterTab = 'all' | 'pending' | 'scanned';

export const InventoryDetailScreen = () => {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<DetailRouteProp>();
  const { inventoryName } = route.params;

  const [inventory, setInventory] = useState<Inventory | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [filter, setFilter] = useState<FilterTab>('all');
  const [search, setSearch] = useState('');

  // ─── Carregamento ────────────────────────────────────────────────────────

  const loadInventory = useCallback(
    async (silent = false) => {
      if (!silent) setIsLoading(true);
      try {
        const result = await StorageService.loadInventory(inventoryName);
        if (!result.ok) {
          throw new Error(result.error.message);
        }
        setInventory(result.value);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Erro desconhecido';
        Alert.alert('Erro', `Não foi possível carregar o inventário: ${message}`, [
          { text: 'Voltar', onPress: () => navigation.goBack() },
        ]);
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [inventoryName, navigation]
  );

  useFocusEffect(
    useCallback(() => {
      loadInventory();
    }, [loadInventory])
  );

  // ─── Dados derivados ─────────────────────────────────────────────────────

  const progress = useMemo(
    () => (inventory ? ScannerService.getProgress(inventory) : null),
    [inventory]
  );

  // ─── Filtro e busca ─────────────────────────────────────────────────────

  const filteredItems = useMemo(() => {
    if (!inventory) return [];

    const allItems = inventory.items.map((item) => ({
      ...item,
      isScanned: item.found,
    }));

    let result = allItems;
    if (filter === 'pending') result = allItems.filter((i) => !i.isScanned);
    if (filter === 'scanned') result = allItems.filter((i) => i.isScanned);

    if (search.trim()) {
      const q = search.toLowerCase().trim();
      result = result.filter(
        (i) =>
          i.code.toLowerCase().includes(q) ||
          (i.description && i.description.toLowerCase().includes(q)) ||
          (i.location && i.location.toLowerCase().includes(q))
      );
    }

    return result;
  }, [inventory, filter, search]);

  // ─── Ações ───────────────────────────────────────────────────────────────

  const handleStartScan = useCallback(() => {
    if (!inventory) return;
    if (progress?.remaining === 0) {
      Alert.alert(
        'Inventário completo',
        'Todos os itens já foram escaneados. Deseja escanear novamente?',
        [
          { text: 'Não', style: 'cancel' },
          {
            text: 'Sim',
            onPress: () => navigation.navigate('Scanner', { inventoryId: inventory.metadata.id }),
          },
        ]
      );
      return;
    }
    navigation.navigate('Scanner', { inventoryId: inventory.metadata.id });
  }, [inventory, progress, navigation]);

  const handleResetInventory = useCallback(() => {
    if (!inventory) return;
    Alert.alert(
      'Resetar inventário',
      'Isso marcará todos os itens como não escaneados. Deseja continuar?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Resetar',
          style: 'destructive',
          onPress: async () => {
            let hasError = false;
            for (const item of inventory.items) {
              if (item.found) {
                const result = await StorageService.updateItemFoundStatus(
                  inventory.metadata.name,
                  item.code,
                  false
                );
                if (!result.ok) {
                  hasError = true;
                  break;
                }
              }
            }
            if (hasError) {
              Alert.alert('Erro', 'Não foi possível resetar completamente o inventário.');
            } else {
              await loadInventory(true);
              Alert.alert('Sucesso', 'Inventário resetado com sucesso.');
            }
          },
        },
      ]
    );
  }, [inventory, loadInventory]);

  // ─── Loading ──────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <View style={inventoryDetailStyles.loadingContainer}>
        <StatusBar barStyle="light-content" backgroundColor="#0A0A0F" />
        <ActivityIndicator color="#00E5A0" size="large" />
        <Text style={inventoryDetailStyles.loadingText}>Carregando inventário…</Text>
      </View>
    );
  }

  if (!inventory) return null;

  const isComplete = progress?.percentage === 100;

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <View style={commonStyles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0A0A0F" />

      {/* Header */}
      <View style={inventoryDetailStyles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={inventoryDetailStyles.backBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={inventoryDetailStyles.backBtnText}>←</Text>
        </TouchableOpacity>

        <View style={inventoryDetailStyles.headerCenter}>
          <Text style={inventoryDetailStyles.headerTitle} numberOfLines={1}>
            {inventory.metadata.name}
          </Text>
          <Text style={inventoryDetailStyles.headerSub}>
            Importado em{' '}
            {new Date(inventory.metadata.importDate).toLocaleDateString('pt-BR', {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
            })}
          </Text>
        </View>

        <TouchableOpacity onPress={handleResetInventory} style={inventoryDetailStyles.resetBtn}>
          <Text style={inventoryDetailStyles.resetBtnText}>↺</Text>
        </TouchableOpacity>
      </View>

      {/* Cards de progresso */}
      {progress && (
        <View style={inventoryDetailStyles.statsSection}>
          <View style={inventoryDetailStyles.statsCards}>
            <StatCard label="Total" value={progress.total} />
            <StatCard label="Escaneados" value={progress.scanned} accent />
            <StatCard label="Pendentes" value={progress.remaining} warn={progress.remaining > 0} />
          </View>

          <View style={inventoryDetailStyles.progressRow}>
            <View style={inventoryDetailStyles.progressTrack}>
              <View
                style={[
                  inventoryDetailStyles.progressFill,
                  { width: `${progress.percentage}%` },
                  isComplete && inventoryDetailStyles.progressFillComplete,
                ]}
              />
            </View>
            <Text
              style={[
                inventoryDetailStyles.progressPct,
                isComplete && inventoryDetailStyles.progressPctComplete,
              ]}
            >
              {progress.percentage}%
            </Text>
          </View>

          {isComplete && (
            <View style={inventoryDetailStyles.completeBanner}>
              <Text style={inventoryDetailStyles.completeBannerText}>
                🎉 Inventário completo! Todos os itens foram encontrados.
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Busca */}
      <View style={inventoryDetailStyles.searchSection}>
        <View style={inventoryDetailStyles.searchBar}>
          <Text style={inventoryDetailStyles.searchIcon}>🔍</Text>
          <TextInput
            style={inventoryDetailStyles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Buscar por código, nome ou local…"
            placeholderTextColor="#6B6B88"
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode="while-editing"
          />
        </View>
      </View>

      {/* Filtros */}
      <View style={inventoryDetailStyles.filterTabs}>
        {[
          { key: 'all', label: `Todos (${inventory.items.length})` },
          { key: 'pending', label: `Pendentes (${progress?.remaining ?? 0})` },
          { key: 'scanned', label: `Escaneados (${progress?.scanned ?? 0})` },
        ].map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[
              inventoryDetailStyles.filterTab,
              filter === tab.key && inventoryDetailStyles.filterTabActive,
            ]}
            onPress={() => setFilter(tab.key as FilterTab)}
          >
            <Text
              style={[
                inventoryDetailStyles.filterTabText,
                filter === tab.key && inventoryDetailStyles.filterTabTextActive,
              ]}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Lista de itens */}
      <FlatList
        data={filteredItems}
        keyExtractor={(item, index) => `${item.code}-${index}`}
        renderItem={({ item }) => <ItemRow item={item} isScanned={item.isScanned} />}
        contentContainerStyle={[
          inventoryDetailStyles.listContent,
          filteredItems.length === 0 && inventoryDetailStyles.listContentEmpty,
        ]}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => {
              setIsRefreshing(true);
              loadInventory(true);
            }}
            tintColor="#00E5A0"
            colors={['#00E5A0']}
          />
        }
        ListEmptyComponent={
          <View style={inventoryDetailStyles.emptyContainer}>
            <Text style={inventoryDetailStyles.emptyIcon}>
              {search ? '🔍' : filter === 'pending' ? '✅' : '📦'}
            </Text>
            <Text style={inventoryDetailStyles.emptyText}>
              {search
                ? 'Nenhum item encontrado para esta busca.'
                : filter === 'pending'
                  ? 'Nenhum item pendente. Tudo escaneado!'
                  : 'Nenhum item escaneado ainda.'}
            </Text>
          </View>
        }
        showsVerticalScrollIndicator={false}
      />

      {/* Botão de scanner */}
      <TouchableOpacity
        style={[inventoryDetailStyles.scanFab, isComplete && inventoryDetailStyles.scanFabComplete]}
        onPress={handleStartScan}
        activeOpacity={0.85}
      >
        <Text style={inventoryDetailStyles.scanFabIcon}>{isComplete ? '✓' : '▶'}</Text>
        <Text style={inventoryDetailStyles.scanFabLabel}>
          {isComplete ? 'Inventário completo' : 'Iniciar scanner'}
        </Text>
      </TouchableOpacity>
    </View>
  );
};

// ─── Sub-componentes ─────────────────────────────────────────────────────────

const StatCard = ({
  label,
  value,
  accent,
  warn,
}: {
  label: string;
  value: number;
  accent?: boolean;
  warn?: boolean;
}) => (
  <View style={inventoryDetailStyles.statCard}>
    <Text style={inventoryDetailStyles.statCardLabel}>{label}</Text>
    <Text
      style={[
        inventoryDetailStyles.statCardValue,
        accent && inventoryDetailStyles.statCardValueAccent,
        warn && value > 0 && inventoryDetailStyles.statCardValueWarn,
      ]}
    >
      {value}
    </Text>
  </View>
);

const ItemRow = ({
  item,
  isScanned,
}: {
  item: AssetItem & { isScanned: boolean };
  isScanned: boolean;
}) => {
  const formattedTime =
    isScanned && 'scanDate' in item && item.scanDate
      ? new Date(item.scanDate).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      : null;

  return (
    <View
      style={[inventoryDetailStyles.itemRow, isScanned && inventoryDetailStyles.itemRowScanned]}
    >
      <View
        style={[
          inventoryDetailStyles.itemIndicator,
          isScanned && inventoryDetailStyles.itemIndicatorScanned,
        ]}
      />

      <View style={inventoryDetailStyles.itemContent}>
        <View style={inventoryDetailStyles.itemHeader}>
          <Text style={inventoryDetailStyles.itemCode}>{item.code}</Text>
          {isScanned ? (
            <View style={inventoryDetailStyles.scannedBadge}>
              <Text style={inventoryDetailStyles.scannedBadgeText}>✓ Escaneado</Text>
            </View>
          ) : (
            <View style={inventoryDetailStyles.pendingBadge}>
              <Text style={inventoryDetailStyles.pendingBadgeText}>Pendente</Text>
            </View>
          )}
        </View>

        {item.description ? (
          <Text style={inventoryDetailStyles.itemDesc} numberOfLines={1}>
            {item.description}
          </Text>
        ) : null}

        <View style={inventoryDetailStyles.itemMeta}>
          {item.location ? (
            <Text style={inventoryDetailStyles.itemMetaText}>📍 {item.location}</Text>
          ) : null}
          {item.department ? (
            <Text style={inventoryDetailStyles.itemMetaText}>🏢 {item.department}</Text>
          ) : null}
          {formattedTime ? (
            <Text style={inventoryDetailStyles.itemMetaText}>🕐 {formattedTime}</Text>
          ) : null}
        </View>
      </View>
    </View>
  );
};
