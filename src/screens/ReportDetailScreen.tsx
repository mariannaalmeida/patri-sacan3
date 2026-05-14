/**
 * ReportDetailScreen.tsx
 *
 * Relatório completo de um inventário:
 *   - Gráfico de pizza (encontrados vs. pendentes)
 *   - Barra de progresso geral
 *   - Linha do tempo de scans
 *   - Tabela por departamento
 *   - Tabela por localização
 *   - Lista de itens não encontrados
 *   - Histórico de scans com timestamp
 */

import { RouteProp, useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StatusBar,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SvgXml } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import {
  AnalyticsService,
  GroupStat,
  InventoryReport,
  ScanEvent,
} from '../services/AnalyticsService';
import { ChartService } from '../services/ChartService';
import { CSVExportService } from '../services/CsvExportService';
import { ReportService } from '../services/ReportService';
import { StorageService } from '../services/StorageService';
import { colors, reportDetailStyles } from '../styles/theme';
import { RootStackParamList, InventorySchema } from '../types/types';

//  Navegação
type DetailRoute = RouteProp<RootStackParamList, 'ReportDetail'>;
type NavProp = NativeStackNavigationProp<RootStackParamList>;

//  Estilos
const styles = reportDetailStyles;

//  Componente principal
export const ReportDetailScreen = () => {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<DetailRoute>();
  const { inventoryId } = route.params;

  const [report, setReport] = useState<InventoryReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const schemaRef = useRef<InventorySchema | undefined>(undefined);

  //  Carregamento
  const loadReport = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await StorageService.loadInventory(inventoryId);

      if (!result.ok) {
        Alert.alert('Erro', result.error.message || 'Inventário não encontrado.', [
          { text: 'Voltar', onPress: () => navigation.goBack() },
        ]);
        return;
      }

      const inv = result.value;
      schemaRef.current = inv.schema;
      const computedReport = AnalyticsService.compute(inv);
      setReport(computedReport);
    } catch (error) {
      console.error('Erro ao carregar relatório:', error);
      Alert.alert('Erro', 'Não foi possível gerar o relatório.');
    } finally {
      setIsLoading(false);
    }
  }, [inventoryId, navigation]);

  useFocusEffect(
    useCallback(() => {
      loadReport();
    }, [loadReport])
  );

  // ─── SVGs dos gráficos (memoizados) ──────────────────────────────────────
  const pieSvg = useMemo(
    () =>
      report
        ? ChartService.buildPieChart({
            found: report.overall.found,
            pending: report.overall.pending,
            size: 180,
          })
        : '',
    [report]
  );

  const timelineSvg = useMemo(
    () =>
      report && report.scanTimeline.length > 0
        ? ChartService.buildTimelineChart(report.scanTimeline, 300, 110)
        : '',
    [report]
  );

  const deptSvg = useMemo(
    () =>
      report && report.byDepartment.length > 0
        ? ChartService.buildBarChart(report.byDepartment, 300, 140)
        : '',
    [report]
  );

  const localSvg = useMemo(
    () =>
      report && report.byLocation.length > 0
        ? ChartService.buildBarChart(report.byLocation, 300, 140)
        : '',
    [report]
  );

  // ─── Navegações ─────────────────────────────────────────────────────────────
  const handleGoBack = () => {
    navigation.goBack();
  };

  const handleGoToInventoryDetail = () => {
    if (report) {
      navigation.navigate('InventoryDetail', {
        inventoryId,
        inventoryName: report.inventoryName,
      });
    }
  };

  const handleGoToReports = () => {
    navigation.navigate('Reports');
  };

  const handleGoToHome = () => {
    navigation.navigate('Home');
  };

  // ─── Exportações ──────────────────────────────────────────────────────────
  const handleExportCSV = useCallback(() => {
    if (!report) return;
    Alert.alert('Exportar CSV', 'Selecione o tipo de relatório que deseja exportar:', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: ' Encontrados',
        onPress: async () => {
          setIsExporting(true);
          try {
            const result = await CSVExportService.exportFound(report, schemaRef.current);
            if (!result.ok) {
              Alert.alert('Erro', result.error.message);
            } else {
              Alert.alert('Sucesso', 'Arquivo exportado com sucesso!');
            }
          } catch (error) {
            Alert.alert('Erro', error instanceof Error ? error.message : 'Erro inesperado');
          } finally {
            setIsExporting(false);
          }
        },
      },
      {
        text: ' Não encontrados',
        onPress: async () => {
          setIsExporting(true);
          try {
            const result = await CSVExportService.exportPending(report, schemaRef.current);
            if (!result.ok) {
              Alert.alert('Erro', result.error.message);
            } else {
              Alert.alert('Sucesso', 'Arquivo exportado com sucesso!');
            }
          } catch (error) {
            Alert.alert('Erro', error instanceof Error ? error.message : 'Erro inesperado');
          } finally {
            setIsExporting(false);
          }
        },
      },
      {
        text: ' Completo',
        onPress: async () => {
          setIsExporting(true);
          try {
            const result = await CSVExportService.exportFull(report, schemaRef.current);
            if (!result.ok) {
              Alert.alert('Erro', result.error.message);
            } else {
              Alert.alert('Sucesso', 'Arquivo exportado com sucesso!');
            }
          } catch (error) {
            Alert.alert('Erro', error instanceof Error ? error.message : 'Erro inesperado');
          } finally {
            setIsExporting(false);
          }
        },
      },
    ]);
  }, [report]);

  const handleExportPDF = useCallback(() => {
    if (!report) return;
    Alert.alert('Exportar PDF', 'Deseja exportar o relatório completo em PDF?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Exportar',
        onPress: async () => {
          setIsExporting(true);
          try {
            await ReportService.exportPDF(report);
            Alert.alert('Sucesso', 'PDF exportado com sucesso!');
          } catch (error) {
            Alert.alert('Erro', error instanceof Error ? error.message : 'Falha ao exportar PDF');
          } finally {
            setIsExporting(false);
          }
        },
      },
    ]);
  }, [report]);

  // ─── Loading ───────────────────────────────────────────────────────────────
  if (isLoading || !report) {
    return (
      <View style={styles.loadingContainer}>
        <StatusBar barStyle="light-content" backgroundColor={colors.bg} />
        <ActivityIndicator color={colors.accent} size="large" />
        <Text style={styles.loadingText}>Gerando relatório…</Text>
      </View>
    );
  }

  const { overall } = report;
  const isComplete = overall.progressPct === 100;
  const hasTimeline = report.scanTimeline.length > 0;

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.bg} />

      {/* Header com navegação completa */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={handleGoBack}
          style={styles.backBtn}
          accessibilityLabel="Voltar"
          accessibilityRole="button"
        >
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {report.inventoryName}
          </Text>
          <Text style={styles.headerSub}>
            Relatório · {AnalyticsService.formatDate(report.generatedAt)}
          </Text>
        </View>

        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity
            onPress={handleGoToInventoryDetail}
            style={styles.iconBtn}
            accessibilityLabel="Ir para detalhes do inventário"
            accessibilityRole="button"
          >
            <Ionicons name="list-outline" size={22} color={colors.accent} />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleGoToReports}
            style={styles.iconBtn}
            accessibilityLabel="Ir para relatórios"
            accessibilityRole="button"
          >
            <Ionicons name="bar-chart-outline" size={22} color={colors.accent} />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleGoToHome}
            style={styles.iconBtn}
            accessibilityLabel="Ir para início"
            accessibilityRole="button"
          >
            <Ionicons name="home-outline" size={22} color={colors.accent} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Botões de exportação abaixo do header */}
      <View style={styles.exportHeader}>
        {isExporting ? (
          <ActivityIndicator color={colors.accent} size="small" />
        ) : (
          <View style={styles.exportBtns}>
            <TouchableOpacity style={styles.exportBtn} onPress={handleExportCSV}>
              <Text style={styles.exportBtnText}>CSV</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.exportBtn, styles.exportBtnPDF]}
              onPress={handleExportPDF}
            >
              <Text style={[styles.exportBtnText, { color: colors.accentWarn }]}>PDF</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Visão geral ── */}
        <Section title="Visão geral">
          <View style={styles.overviewRow}>
            {/* Pizza */}
            <View style={styles.pieWrapper}>
              <SvgXml xml={pieSvg} width={180} height={180} />
            </View>

            {/* Stats à direita */}
            <View style={styles.statsColumn}>
              <StatCard label="Total" value={overall.total} />
              <StatCard label="Encontrados" value={overall.found} accent />
              <StatCard label="Pendentes" value={overall.pending} warn={overall.pending > 0} />
            </View>
          </View>

          {/* Barra de progresso */}
          <View style={styles.progressSection}>
            <View style={styles.progressRow}>
              <Text style={styles.progressLabel}>Progresso geral</Text>
              <Text style={[styles.progressPct, isComplete && styles.progressPctComplete]}>
                {overall.progressPct}%
              </Text>
            </View>
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${overall.progressPct}%` },
                  isComplete && styles.progressFillComplete,
                ]}
              />
            </View>
          </View>

          {/* Metadados */}
          {overall.startedAt && (
            <View style={styles.metaRow}>
              <MetaItem label="Início" value={AnalyticsService.formatDateTime(overall.startedAt)} />
              {overall.completedAt && (
                <MetaItem
                  label="Conclusão"
                  value={AnalyticsService.formatDateTime(overall.completedAt)}
                />
              )}
              {overall.durationMinutes != null && overall.durationMinutes > 0 && (
                <MetaItem label="Duração" value={`${overall.durationMinutes} min`} />
              )}
            </View>
          )}
        </Section>

        {/* ── Linha do tempo ── */}
        {hasTimeline && timelineSvg && (
          <Section title={`Linha do tempo (${report.scanTimeline.length} scans)`}>
            <View style={styles.chartDark}>
              <SvgXml xml={timelineSvg} width="100%" height={110} />
            </View>
            {overall.durationMinutes != null &&
              overall.durationMinutes > 0 &&
              report.scanTimeline.length > 1 && (
                <Text style={styles.chartCaption}>
                  Média: {((overall.durationMinutes * 60) / report.scanTimeline.length).toFixed(0)}s
                  por item
                </Text>
              )}
          </Section>
        )}

        {/* ── Por departamento ── */}
        {report.byDepartment.length > 0 && deptSvg && (
          <Section title="Por departamento">
            <View style={styles.chartDark}>
              <SvgXml xml={deptSvg} width="100%" height={140} />
            </View>
            <GroupTable groups={report.byDepartment} />
          </Section>
        )}

        {/* ── Por localização ── */}
        {report.byLocation.length > 0 && localSvg && (
          <Section title="Por localização">
            <View style={styles.chartDark}>
              <SvgXml xml={localSvg} width="100%" height={140} />
            </View>
            <GroupTable groups={report.byLocation} />
          </Section>
        )}

        {/* ── Não encontrados ── */}
        <Section title={`Itens não encontrados (${report.notFoundItems.length})`}>
          {report.notFoundItems.length === 0 ? (
            <View style={styles.allFoundBanner}>
              <Ionicons
                name="checkmark-circle"
                size={20}
                color={colors.success}
                style={{ marginRight: 6 }}
              />
              <Text style={styles.allFoundText}>Todos os itens foram localizados!</Text>
            </View>
          ) : (
            report.notFoundItems.map((item, i) => (
              <View
                key={`nf-${item.code}-${item.location ?? ''}-${i}`}
                style={[styles.itemRow, styles.itemRowPending]}
              >
                <View style={[styles.itemInd, styles.itemIndPending]} />
                <View style={styles.itemBody}>
                  <Text style={styles.itemCode}>{item.code}</Text>
                  {item.description ? (
                    <Text style={styles.itemDesc}>{item.description}</Text>
                  ) : null}
                  <View style={styles.itemMeta}>
                    {item.location ? (
                      <Text style={styles.itemMetaTxt}>
                        <Ionicons name="location-outline" size={12} /> {item.location}
                      </Text>
                    ) : null}
                    {item.department ? (
                      <Text style={styles.itemMetaTxt}>
                        <Ionicons name="business-outline" size={12} /> {item.department}
                      </Text>
                    ) : null}
                  </View>
                </View>
              </View>
            ))
          )}
        </Section>

        {/* ── Histórico de scans ── */}
        {hasTimeline && (
          <Section title="Histórico de scans">
            {report.scanTimeline.map((event, i) => (
              <ScanEventRow key={`ev-${event.code}-${i}`} event={event} index={i} />
            ))}
          </Section>
        )}
      </ScrollView>
    </View>
  );
};

// ─── Sub-componentes ──────────────────────────────────────────────────────────

const Section = React.memo(({ title, children }: { title: string; children: React.ReactNode }) => (
  <View style={styles.section}>
    <View style={styles.sectionHeader}>
      <View style={styles.sectionAccent} />
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
    {children}
  </View>
));

const StatCard = React.memo(
  ({
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
    <View style={styles.statCard}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text
        style={[
          styles.statValue,
          accent && styles.statValueAccent,
          warn && value > 0 && styles.statValueWarn,
        ]}
      >
        {value}
      </Text>
    </View>
  )
);

const MetaItem = React.memo(({ label, value }: { label: string; value: string }) => (
  <View style={styles.metaItem}>
    <Text style={styles.metaLabel}>{label}</Text>
    <Text style={styles.metaValue}>{value}</Text>
  </View>
));

const GroupTable = React.memo(({ groups }: { groups: GroupStat[] }) => (
  <View style={styles.groupTable}>
    <View style={styles.groupTableHeader}>
      {['Grupo', 'Total', 'Enc.', '%'].map((h) => (
        <Text key={h} style={styles.groupTableHeaderCell}>
          {h}
        </Text>
      ))}
    </View>
    {groups.map((g, i) => (
      <View key={`${g.label}-${i}`} style={[styles.groupRow, i % 2 === 0 && styles.groupRowEven]}>
        <Text style={[styles.groupCell, { flex: 2 }]} numberOfLines={1}>
          {g.label}
        </Text>
        <Text style={styles.groupCell}>{g.total}</Text>
        <Text style={[styles.groupCell, { color: colors.accent }]}>{g.found}</Text>
        <Text
          style={[
            styles.groupCell,
            { color: g.progressPct === 100 ? colors.accent : colors.accentWarn },
          ]}
        >
          {g.progressPct}%
        </Text>
      </View>
    ))}
  </View>
));

const ScanEventRow = React.memo(({ event, index }: { event: ScanEvent; index: number }) => (
  <View style={styles.scanRow}>
    <Text style={styles.scanIndex}>{index + 1}</Text>
    <View style={styles.scanBody}>
      <View style={styles.scanHeader}>
        <Text style={styles.scanCode}>{event.code}</Text>
        <Text style={styles.scanTime}>
          {AnalyticsService.formatTime(event.scanDate)}
          <Text style={styles.scanDelta}> +{event.minutesFromStart}min</Text>
        </Text>
      </View>
      {event.description ? (
        <Text style={styles.scanDesc} numberOfLines={1}>
          {event.description}
        </Text>
      ) : null}
      {event.location ? (
        <Text style={styles.scanMeta}>
          <Ionicons name="location-outline" size={11} /> {event.location}
        </Text>
      ) : null}
    </View>
  </View>
));
