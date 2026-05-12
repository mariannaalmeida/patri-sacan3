/**
 * ReportsScreen.tsx
 *
 * Lista todos os inventários com acesso rápido aos relatórios.
 * Permite exportar CSV ou PDF diretamente desta tela.
 */

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
import { Ionicons } from '@expo/vector-icons';
import { AnalyticsService, InventoryReport } from '../services/AnalyticsService';
import { CSVExportService } from '../services/CsvExportService';
import { ReportService } from '../services/ReportService';
import { StorageService } from '../services/StorageService';
import { colors, reportsStyles } from '../styles/theme';
import { Inventory, Result, RootStackParamList } from '../types/types';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

interface ReportRow {
  inventory: Inventory;
  report: InventoryReport;
}

export const ReportsScreen = () => {
  const navigation = useNavigation<NavProp>();
  const styles = reportsStyles;

  const [rows, setRows] = useState<ReportRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [exportingId, setExportingId] = useState<string | null>(null);

  // Carregamento

  const loadReports = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      const idsResult = await StorageService.getInventories();
      if (!idsResult.ok) {
        throw new Error(idsResult.error.message);
      }

      const ids = idsResult.value;

      const loaded = await Promise.all(
        ids.map(async (id) => {
          const invResult = await StorageService.loadInventory(id);
          if (!invResult.ok) return null;

          const inventory = invResult.value;
          const report = AnalyticsService.compute(inventory);

          return { inventory, report };
        })
      );

      setRows(loaded.filter((r): r is ReportRow => r !== null));
    } catch (error) {
      console.error('Erro ao carregar relatórios:', error);
      Alert.alert('Erro', 'Não foi possível carregar os relatórios.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadReports();
    }, [loadReports])
  );

  //  Navegações

  const handleGoBack = () => {
    navigation.goBack();
  };

  const handleGoToHome = () => {
    navigation.navigate('Home');
  };

  const handleGoToSettings = () => {
    navigation.navigate('Settings');
  };

  //  Exportações

  const withExportResultGuard = useCallback(async (id: string, fn: () => Promise<Result<void>>) => {
    setExportingId(id);
    try {
      const result = await fn();
      if (!result.ok) {
        Alert.alert('Erro na exportação', result.error.message);
      } else {
        Alert.alert('Sucesso', 'Arquivo exportado com sucesso!');
      }
    } catch (e) {
      Alert.alert('Erro na exportação', e instanceof Error ? e.message : 'Tente novamente.');
    } finally {
      setExportingId(null);
    }
  }, []);

  const withExportVoidGuard = useCallback(async (id: string, fn: () => Promise<void>) => {
    setExportingId(id);
    try {
      await fn();
      Alert.alert('Sucesso', 'PDF exportado com sucesso!');
    } catch (e) {
      Alert.alert('Erro na exportação', e instanceof Error ? e.message : 'Tente novamente.');
    } finally {
      setExportingId(null);
    }
  }, []);

  const handleExportCSV = useCallback(
    (row: ReportRow) => {
      Alert.alert('Exportar CSV', 'Qual versão do CSV deseja exportar?', [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Encontrados',
          onPress: () =>
            withExportResultGuard(`csv-found-${row.inventory.metadata.id}`, () =>
              CSVExportService.exportFound(row.report, row.inventory.schema)
            ),
        },
        {
          text: 'Não encontrados',
          onPress: () =>
            withExportResultGuard(`csv-pending-${row.inventory.metadata.id}`, () =>
              CSVExportService.exportPending(row.report, row.inventory.schema)
            ),
        },
        {
          text: 'Completo',
          onPress: () =>
            withExportResultGuard(`csv-full-${row.inventory.metadata.id}`, () =>
              CSVExportService.exportFull(row.report, row.inventory.schema)
            ),
        },
      ]);
    },
    [withExportResultGuard]
  );

  const handleExportPDF = useCallback(
    (row: ReportRow) => {
      withExportVoidGuard(`pdf-${row.inventory.metadata.id}`, () =>
        ReportService.exportPDF(row.report)
      );
    },
    [withExportVoidGuard]
  );

  //  Loading

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <StatusBar barStyle="light-content" backgroundColor={colors.bg} />
        <ActivityIndicator color={colors.accent} size="large" />
        <Text style={styles.loadingText}>Calculando relatórios…</Text>
      </View>
    );
  }

  //  Render

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.bg} />

      {/* Header com navegação completa */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleGoBack} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Relatórios</Text>
          <Text style={styles.headerSub}>
            {rows.length} inventário{rows.length !== 1 ? 's' : ''}
          </Text>
        </View>

        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity onPress={handleGoToHome} style={styles.iconBtn}>
            <Ionicons name="home-outline" size={20} color={colors.accent} />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleGoToSettings} style={styles.iconBtn}>
            <Ionicons name="settings-outline" size={20} color={colors.accent} />
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        data={rows}
        keyExtractor={(r) => r.inventory.metadata.id}
        renderItem={({ item }) => (
          <ReportCard
            row={item}
            isExporting={exportingId?.includes(item.inventory.metadata.id) ?? false}
            onView={() =>
              navigation.navigate('ReportDetail', {
                inventoryId: item.inventory.metadata.id,
                inventoryName: item.inventory.metadata.name,
              })
            }
            onCSV={() => handleExportCSV(item)}
            onPDF={() => handleExportPDF(item)}
          />
        )}
        contentContainerStyle={[styles.listContent, rows.length === 0 && styles.listEmpty]}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => {
              setIsRefreshing(true);
              loadReports(true);
            }}
            tintColor={colors.accent}
            colors={[colors.accent]}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="bar-chart-outline" size={48} color={colors.textDim} />
            <Text style={styles.emptyTitle}>Nenhum relatório disponível</Text>
            <Text style={styles.emptyDesc}>
              Importe um inventário ou cadastre manualmente para ver os relatórios.
            </Text>
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 24 }}>
              <TouchableOpacity
                style={styles.emptyBtn}
                onPress={() => navigation.navigate('ImportInventory')}
              >
                <Ionicons name="document-attach-outline" size={18} color={colors.accent} />
                <Text style={styles.emptyBtnText}> Importar CSV</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.emptyBtn}
                onPress={() => navigation.navigate('ManualInventory')}
              >
                <Ionicons name="create-outline" size={18} color={colors.accent} />
                <Text style={styles.emptyBtnText}> Cadastrar</Text>
              </TouchableOpacity>
            </View>
          </View>
        }
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
};

// ─── Sub-componente: card de relatório ────────────────────────────────────────

interface ReportCardProps {
  row: ReportRow;
  isExporting: boolean;
  onView: () => void;
  onCSV: () => void;
  onPDF: () => void;
}

const ReportCard = React.memo(({ row, isExporting, onView, onCSV, onPDF }: ReportCardProps) => {
  const styles = reportsStyles;
  const { report } = row;
  const { overall } = report;
  const isComplete = overall.progressPct === 100;
  const safePct = Number.isFinite(overall.progressPct) ? overall.progressPct : 0;

  return (
    <TouchableOpacity style={styles.card} onPress={onView} activeOpacity={0.75}>
      {/* Indicador lateral */}
      <View style={[styles.cardAccent, isComplete && styles.cardAccentComplete]} />

      <View style={styles.cardBody}>
        {/* Título + badge */}
        <View style={styles.cardHeader}>
          <Text style={styles.cardName} numberOfLines={1}>
            {report.inventoryName}
          </Text>
          {isComplete ? (
            <View style={styles.badgeComplete}>
              <Text style={styles.badgeCompleteText}>✓ Completo</Text>
            </View>
          ) : (
            <View style={styles.badgeInProgress}>
              <Text style={styles.badgeInProgressText}>{safePct}%</Text>
            </View>
          )}
        </View>

        {/* Mini stats */}
        <View style={styles.miniStats}>
          <MiniStat label="Total" value={overall.total} />
          <MiniStat label="Encontrados" value={overall.found} accent />
          <MiniStat label="Pendentes" value={overall.pending} warn={overall.pending > 0} />
        </View>

        {/* Barra de progresso */}
        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressFill,
              { width: `${safePct}%` },
              isComplete && styles.progressFillComplete,
            ]}
          />
        </View>

        {/* Duração */}
        {overall.durationMinutes !== null && (
          <View style={styles.duration}>
            <Ionicons name="time-outline" size={14} color={colors.textDim} />
            <Text style={styles.durationText}>
              {' '}
              Duração: {overall.durationMinutes} min · {report.scanTimeline.length} scans
            </Text>
          </View>
        )}

        {/* Ações de exportação */}
        <View style={styles.actions}>
          <TouchableOpacity style={styles.actionBtn} onPress={onView}>
            <Ionicons name="bar-chart-outline" size={16} color={colors.accent} />
            <Text style={styles.actionBtnText}> Ver detalhes</Text>
          </TouchableOpacity>

          {isExporting ? (
            <View style={[styles.actionBtn, styles.actionBtnExport]}>
              <ActivityIndicator size="small" color={colors.accent} />
            </View>
          ) : (
            <>
              <TouchableOpacity style={[styles.actionBtn, styles.actionBtnExport]} onPress={onCSV}>
                <Ionicons name="download-outline" size={16} color={colors.accent} />
                <Text style={[styles.actionBtnText, { color: colors.accent }]}> CSV</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.actionBtn, styles.actionBtnExport]} onPress={onPDF}>
                <Text style={[styles.actionBtnText, { color: colors.accentWarn }]}>↓ PDF</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
});

// ─── Sub-componente: mini stat ────────────────────────────────────────────────

const MiniStat = ({
  label,
  value,
  accent,
  warn,
}: {
  label: string;
  value: number;
  accent?: boolean;
  warn?: boolean;
}) => {
  const styles = reportsStyles;

  return (
    <View style={styles.miniStat}>
      <Text style={styles.miniStatLabel}>{label}</Text>
      <Text
        style={[
          styles.miniStatValue,
          accent && styles.miniStatAccent,
          warn && value > 0 && styles.miniStatWarn,
        ]}
      >
        {value}
      </Text>
    </View>
  );
};
