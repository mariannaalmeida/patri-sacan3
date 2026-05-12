import { RouteProp, useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  StatusBar,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ScannerService } from '../services/ScannerService';
import { StorageService } from '../services/StorageService';
import { colors, commonStyles, inventoryDetailStyles } from '../styles/theme';
import { AssetItem, Inventory, RootStackParamList } from '../types/types';
import { formatDisplayDate, formatDisplayTime } from '../utils/dateUtils';

type DetailRouteProp = RouteProp<RootStackParamList, 'InventoryDetail'>;
type NavProp = NativeStackNavigationProp<RootStackParamList>;

type FilterTab = 'all' | 'pending' | 'scanned';

// Type guard (poderia ser importado, mas coloco aqui para completude)
const isScannedItem = (item: AssetItem): item is AssetItem & { found: true } => {
  return item.found === true;
};

export const InventoryDetailScreen = () => {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<DetailRouteProp>();
  const { inventoryId, inventoryName: passedName } = route.params;

  const [inventory, setInventory] = useState<Inventory | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [filter, setFilter] = useState<FilterTab>('all');
  const [search, setSearch] = useState('');

  // ─── Carregamento ────────────────────────────────────────────
  const loadInventory = useCallback(
    async (silent = false) => {
      if (!silent) setIsLoading(true);
      try {
        const result = await StorageService.loadInventory(inventoryId);
        if (!result.ok) throw new Error(result.error.message);
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
    [inventoryId, navigation]
  );

  useFocusEffect(
    useCallback(() => {
      loadInventory();
    }, [loadInventory])
  );

  // ─── Progresso ───────────────────────────────────────────────
  const progress = useMemo(
    () => (inventory ? ScannerService.getProgress(inventory) : null),
    [inventory]
  );

  // ─── Itens filtrados e pesquisados ───────────────────────────
  const filteredItems = useMemo(() => {
    if (!inventory) return [];
    // Não precisamos acrescentar isScanned artificialmente; usamos o type guard no render.
    let result = inventory.items;

    if (filter === 'pending') result = result.filter((i) => !i.found);
    if (filter === 'scanned') result = result.filter((i) => i.found);

    if (search.trim()) {
      const q = search.toLowerCase().trim();
      result = result.filter((i) => {
        const inCustom = i.customFields
          ? Object.values(i.customFields).some((val) => val.toLowerCase().includes(q))
          : false;
        return (
          i.code.toLowerCase().includes(q) ||
          (i.description && i.description.toLowerCase().includes(q)) ||
          (i.location && i.location.toLowerCase().includes(q)) ||
          inCustom
        );
      });
    }
    return result;
  }, [inventory, filter, search]);

  // ─── Ações de navegação e reset ──────────────────────────────
  const handleViewReport = useCallback(() => {
    if (!inventory) return;
    navigation.navigate('ReportDetail', {
      inventoryId: inventory.metadata.id,
      inventoryName: inventory.metadata.name,
    });
  }, [inventory, navigation]);

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
                  inventory.metadata.id,
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

  const handleDeleteInventory = useCallback(() => {
    if (!inventory) return;
    Alert.alert(
      'Excluir Inventário',
      `Tem certeza que deseja excluir "${inventory.metadata.name}"? Esta ação apagará todos os dados permanentemente.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            const result = await StorageService.deleteInventory(inventory.metadata.id);
            if (result.ok) {
              navigation.navigate('Home');
            } else {
              Alert.alert('Erro', result.error.message);
            }
          },
        },
      ]
    );
  }, [inventory, navigation]);

  const handleGoBack = () => navigation.goBack();

  // ─── Loading e fallback ──────────────────────────────────────
  if (isLoading) {
    return (
      <View style={inventoryDetailStyles.loadingContainer}>
        <StatusBar barStyle="light-content" backgroundColor={colors.bg} />
        <ActivityIndicator color={colors.accent} size="large" />
        <Text style={inventoryDetailStyles.loadingText}>Carregando inventário…</Text>
      </View>
    );
  }

  if (!inventory) return null;
  const isComplete = progress?.percentage === 100;

  // ─── Render principal ────────────────────────────────────────
  return (
    <View style={commonStyles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.bg} />

      {/* Header */}
      <View style={inventoryDetailStyles.header}>
        <TouchableOpacity onPress={handleGoBack} style={inventoryDetailStyles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>

        <View style={inventoryDetailStyles.headerCenter}>
          <Text
            style={inventoryDetailStyles.headerTitle}
            numberOfLines={1}
            accessibilityLabel={`Nome do inventário: ${inventory.metadata.name}`}
          >
            {inventory.metadata.name}
          </Text>
          <Text style={inventoryDetailStyles.headerSub}>
            Importado em {formatDisplayDate(inventory.metadata.importDate)}
          </Text>
        </View>

        <View style={{ flexDirection: 'row', gap: 8 }}>
          {/* Botão de Relatório */}
          <TouchableOpacity onPress={handleViewReport} style={inventoryDetailStyles.reportBtn}>
            <Ionicons name="bar-chart-outline" size={20} color={colors.accent} />
          </TouchableOpacity>

          {/* Botão de Reset */}
          <TouchableOpacity onPress={handleResetInventory} style={inventoryDetailStyles.resetBtn}>
            <Ionicons name="refresh-outline" size={20} color={colors.accentWarn} />
          </TouchableOpacity>

          {/* Botão de Lixeira */}
          <TouchableOpacity
            onPress={handleDeleteInventory}
            style={[
              inventoryDetailStyles.resetBtn,
              { borderColor: colors.accentWarn, backgroundColor: colors.accentWarn + '20' },
            ]}
          >
            <Ionicons name="trash-outline" size={20} color={colors.accentWarn} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Progresso */}
      {progress && (
        <View style={inventoryDetailStyles.statsSection}>
          <View style={inventoryDetailStyles.statsCards}>
            <StatCard label="Total" value={progress.total} />
            <StatCard label="Escaneados" value={progress.scanned} variant="accent" />
            <StatCard label="Pendentes" value={progress.remaining} variant="warn" />
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
              <Ionicons name="checkmark-done-outline" size={24} color={colors.success} />
              <Text style={inventoryDetailStyles.completeBannerText}>
                Inventário completo! Todos os itens foram encontrados.
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Busca */}
      <View style={inventoryDetailStyles.searchSection}>
        <View style={inventoryDetailStyles.searchBar}>
          <Ionicons name="search-outline" size={20} color={colors.textDim} />
          <TextInput
            style={inventoryDetailStyles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Buscar por código, nome ou local…"
            placeholderTextColor={colors.textDim}
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
        renderItem={({ item }) => <ItemRow item={item} />}
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
            tintColor={colors.accent}
            colors={[colors.accent]}
          />
        }
        ListEmptyComponent={
          <View style={inventoryDetailStyles.emptyContainer}>
            <Ionicons
              name={
                search
                  ? 'search-outline'
                  : filter === 'pending'
                    ? 'checkmark-circle-outline'
                    : 'cube-outline'
              }
              size={48}
              color={filter === 'pending' && !search ? colors.success : colors.textDim}
            />
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

      {/* FAB Scanner */}
      <TouchableOpacity
        style={[inventoryDetailStyles.scanFab, isComplete && inventoryDetailStyles.scanFabComplete]}
        onPress={handleStartScan}
        activeOpacity={0.85}
      >
        <Ionicons
          name={isComplete ? 'checkmark-circle' : 'play'}
          size={24}
          color={isComplete ? colors.accent : '#000'}
        />
        <Text
          style={[
            inventoryDetailStyles.scanFabLabel,
            isComplete && inventoryDetailStyles.scanFabLabelComplete,
          ]}
        >
          {isComplete ? 'Inventário completo' : 'Iniciar scanner'}
        </Text>
      </TouchableOpacity>
    </View>
  );
};

// ─── Sub-componentes ─────────────────────────────────────────────────────────

interface StatCardProps {
  label: string;
  value: number;
  variant?: 'default' | 'accent' | 'warn';
}

const StatCard = React.memo(({ label, value, variant = 'default' }: StatCardProps) => {
  const valueStyle = [
    inventoryDetailStyles.statCardValue,
    variant === 'accent' && inventoryDetailStyles.statCardValueAccent,
    variant === 'warn' && value > 0 && inventoryDetailStyles.statCardValueWarn,
  ];

  return (
    <View style={inventoryDetailStyles.statCard}>
      <Text style={inventoryDetailStyles.statCardLabel}>{label}</Text>
      <Text style={valueStyle}>{value}</Text>
    </View>
  );
});

interface ItemRowProps {
  item: AssetItem;
}

const ItemRow = React.memo(({ item }: ItemRowProps) => {
  const scanned = isScannedItem(item);
  const scanTime = scanned ? formatDisplayTime(item.scanDate) : null;
  const customFieldsEntries = item.customFields ? Object.entries(item.customFields) : [];

  return (
    <View style={[inventoryDetailStyles.itemRow, scanned && inventoryDetailStyles.itemRowScanned]}>
      <View
        style={[
          inventoryDetailStyles.itemIndicator,
          scanned && inventoryDetailStyles.itemIndicatorScanned,
        ]}
      />

      <View style={inventoryDetailStyles.itemContent}>
        <View style={inventoryDetailStyles.itemHeader}>
          <Text style={inventoryDetailStyles.itemCode}>{item.code}</Text>
          {scanned ? (
            <View style={inventoryDetailStyles.scannedBadge}>
              <Ionicons name="checkmark-circle" size={16} color={colors.success} />
              <Text style={inventoryDetailStyles.scannedBadgeText}> Escaneado</Text>
            </View>
          ) : (
            <View style={inventoryDetailStyles.pendingBadge}>
              <Ionicons name="ellipse-outline" size={16} color={colors.textDim} />
              <Text style={inventoryDetailStyles.pendingBadgeText}> Pendente</Text>
            </View>
          )}
        </View>

        {item.description ? (
          <Text style={inventoryDetailStyles.itemDesc} numberOfLines={1}>
            {item.description}
          </Text>
        ) : null}

        <ItemMeta location={item.location} department={item.department} scanTime={scanTime} />

        {customFieldsEntries.length > 0 && <CustomFields fields={item.customFields!} />}
      </View>
    </View>
  );
});

// ─── Sub-componentes menores ─────────────────────────────────────────────────

interface ItemMetaProps {
  location?: string;
  department?: string;
  scanTime: string | null;
}

const ItemMeta = React.memo(({ location, department, scanTime }: ItemMetaProps) => (
  <View style={inventoryDetailStyles.itemMeta}>
    {location && (
      <View style={inventoryDetailStyles.metaItem}>
        <Ionicons name="location-outline" size={14} color={colors.textDim} />
        <Text style={inventoryDetailStyles.itemMetaText}> {location}</Text>
      </View>
    )}
    {department && (
      <View style={inventoryDetailStyles.metaItem}>
        <Ionicons name="business-outline" size={14} color={colors.textDim} />
        <Text style={inventoryDetailStyles.itemMetaText}> {department}</Text>
      </View>
    )}
    {scanTime && (
      <View style={inventoryDetailStyles.metaItem}>
        <Ionicons name="time-outline" size={14} color={colors.textDim} />
        <Text style={inventoryDetailStyles.itemMetaText}> {scanTime}</Text>
      </View>
    )}
  </View>
));

interface CustomFieldsProps {
  fields: Record<string, string>;
}

const CustomFields = React.memo(({ fields }: CustomFieldsProps) => (
  <View style={inventoryDetailStyles.customFieldsContainer}>
    {Object.entries(fields).map(([key, value]) => (
      <View key={key} style={inventoryDetailStyles.customFieldRow}>
        <Text style={inventoryDetailStyles.customFieldKey}>{key}:</Text>
        <Text style={inventoryDetailStyles.customFieldValue}>{value}</Text>
      </View>
    ))}
  </View>
));
