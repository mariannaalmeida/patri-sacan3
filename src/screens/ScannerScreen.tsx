import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { CameraView, useCameraPermissions } from 'expo-camera';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  TouchableOpacity,
  Vibration,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons'; 
import { ScannerService } from '../services/ScannerService';
import { StorageService } from '../services/StorageService';
import { colors, commonStyles, scannerStyles } from '../styles/theme';
import { AssetItem, Inventory, RootStackParamList } from '../types/types';

type ScannerRouteProp = RouteProp<RootStackParamList, 'Scanner'>;
type ScannerNavProp = NativeStackNavigationProp<RootStackParamList>;

type ScanMode = 'camera' | 'manual';

interface AlertBanner {
  id: number;
  type: 'success' | 'warning' | 'error';
  message: string;
}

export const ScannerScreen = () => {
  const navigation = useNavigation<ScannerNavProp>();
  const route = useRoute<ScannerRouteProp>();
  const { inventoryId } = route.params ?? {};

  const [inventory, setInventory] = useState<Inventory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [mode, setMode] = useState<ScanMode>('camera');
  const [permission, requestPermission] = useCameraPermissions();
  const [isCameraActive, setIsCameraActive] = useState(true);
  const [manualCode, setManualCode] = useState('');
  const manualInputRef = useRef<TextInput>(null);

  const [pendingItem, setPendingItem] = useState<AssetItem | null>(null);
  const [isConfirmVisible, setIsConfirmVisible] = useState(false);

  const [alerts, setAlerts] = useState<AlertBanner[]>([]);
  const alertCounter = useRef(0);

  // Ref para armazenar os timeouts e evitar Memory Leaks
  const alertTimeouts = useRef<NodeJS.Timeout[]>([]);

  const lastScannedCode = useRef<string>('');
  const scanCooldown = useRef(false);

  const lastItemAnim = useRef(new Animated.Value(0)).current;
  const [lastScanned, setLastScanned] = useState<AssetItem | null>(null);

  // Limpeza dos timeouts de alerta quando o componente desmontar
  useEffect(() => {
    return () => {
      alertTimeouts.current.forEach(clearTimeout);
    };
  }, []);

  // Carregar inventário com guarda e garantia de a loading state
  useEffect(() => {
    const loadInventory = async () => {
      if (!inventoryId) {
        const errMsg = 'ID do inventário não fornecido na navegação.';
        setError(errMsg);
        setLoading(false);
        Alert.alert('Erro de Parâmetro', errMsg);
        navigation.goBack();
        return;
      }

      try {
        const result = await StorageService.loadInventory(inventoryId);
        if (result.ok) {
          setInventory(result.value);
          setError(null);
        } else {
          setError(result.error.message);
          Alert.alert('Erro', result.error.message);
          navigation.goBack();
        }
      } catch (err) {
        const unexpectedError = 'Falha inesperada ao tentar carregar o inventário.';
        setError(unexpectedError);
        Alert.alert('Erro Crítico', unexpectedError);
        navigation.goBack();
      } finally {
        setLoading(false);
      }
    };

    loadInventory();
  }, [inventoryId, navigation]);

  const progress = inventory
    ? ScannerService.getProgress(inventory)
    : { scanned: 0, total: 0, percentage: 0, remaining: 0 };

  // Permissão de câmera
  useEffect(() => {
    if (mode === 'camera' && permission && !permission.granted) {
      requestPermission();
    }
  }, [mode, permission, requestPermission]);

  // Alertas com controle de memória
  const showAlert = useCallback((type: AlertBanner['type'], message: string) => {
    const id = ++alertCounter.current;
    setAlerts((prev) => [...prev.slice(-2), { id, type, message }]);

    const timeoutId = setTimeout(() => {
      setAlerts((prev) => prev.filter((a) => a.id !== id));
    }, 3500);

    alertTimeouts.current.push(timeoutId);
  }, []);

  // Animação do último item
  const animateLastItem = useCallback(() => {
    lastItemAnim.setValue(0);
    Animated.spring(lastItemAnim, {
      toValue: 1,
      useNativeDriver: true,
      tension: 80,
      friction: 8,
    }).start();
  }, [lastItemAnim]);

  // Lógica de scan
  const handleCodeScanned = useCallback(
    (code: string) => {
      if (!inventory) return;
      const trimmed = code.trim();
      if (!ScannerService.validateCode(trimmed)) return;

      if (scanCooldown.current || lastScannedCode.current === trimmed) return;
      scanCooldown.current = true;
      lastScannedCode.current = trimmed;
      setTimeout(() => {
        scanCooldown.current = false;
        lastScannedCode.current = '';
      }, 1500);

      const match = ScannerService.findItemByCode(trimmed, inventory);
      const feedback = ScannerService.getFeedback(match);

      if (match.status === 'found' && match.item) {
        setIsCameraActive(false);
        setPendingItem(match.item);
        setIsConfirmVisible(true);
        Vibration.vibrate(80);
      } else if (match.status === 'already_scanned') {
        Vibration.vibrate([0, 60, 60, 60]);
        showAlert('warning', feedback.message);
      } else if (match.status === 'not_found') {
        Vibration.vibrate([0, 100, 50, 100]);
        showAlert('error', feedback.message);
      }
    },
    [inventory, showAlert]
  );

  // Confirmação do scan
  const handleConfirm = useCallback(async () => {
    if (!pendingItem || !inventory) return;

    const result = await ScannerService.confirmScan(inventory.metadata.id, pendingItem);

    setIsConfirmVisible(false);
    setPendingItem(null);

    if (result.ok) {
      const updatedInventory = result.value.updatedInventory;
      setInventory(updatedInventory);
      setLastScanned(pendingItem);
      animateLastItem();
      
      showAlert('success', `${pendingItem.description || pendingItem.code} escaneado com sucesso.`);

      const newProgress = ScannerService.getProgress(updatedInventory);
      if (newProgress.remaining === 0) {
        setTimeout(() => {
          Alert.alert(
            'Inventário completo', 
            'Todos os itens foram escaneados.',
            [
              {
                text: 'Ver relatório',
                onPress: () =>
                  navigation.navigate('ReportDetail', {
                    inventoryId: updatedInventory.metadata.id,
                    inventoryName: updatedInventory.metadata.name,
                  }),
              },
              {
                text: 'Ver inventário',
                onPress: () =>
                  navigation.navigate('InventoryDetail', {
                    inventoryId: updatedInventory.metadata.id,
                    inventoryName: updatedInventory.metadata.name,
                  }),
              },
              { text: 'Fechar', style: 'cancel' },
            ]
          );
        }, 600);
      }
    } else {
      showAlert('error', result.error.message);
    }

    setIsCameraActive(true);
  }, [pendingItem, inventory, animateLastItem, showAlert, navigation]);

  const handleCancelConfirm = useCallback(() => {
    setIsConfirmVisible(false);
    setPendingItem(null);
    setIsCameraActive(true);
  }, []);

  // Input manual
  const handleManualSubmit = useCallback(() => {
    if (!manualCode.trim()) return;
    handleCodeScanned(manualCode);
    setManualCode('');
    manualInputRef.current?.focus();
  }, [manualCode, handleCodeScanned]);

  //  Navegações adicionais
  const handleGoBack = () => {
    navigation.goBack();
  };

  const handleGoToHome = () => {
    navigation.navigate('Home');
  };

  // Render loading / erro

  if (loading) {
    return (
      <View style={commonStyles.loadingContainer}>
        <StatusBar barStyle="light-content" backgroundColor={colors.bg} />
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={commonStyles.loadingText}>Carregando inventário...</Text>
      </View>
    );
  }

  if (!inventory) {
    return (
      <View style={commonStyles.loadingContainer}>
        <StatusBar barStyle="light-content" backgroundColor={colors.bg} />
        <Ionicons name="alert-circle-outline" size={48} color={colors.accentErr} />
        <Text style={commonStyles.errorText}>Inventário não encontrado.</Text>
        <TouchableOpacity onPress={handleGoBack} style={commonStyles.errorButton}>
          <Text style={commonStyles.errorButtonText}>Voltar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Render principal
  return (
    <View style={commonStyles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.bg} />

      {/* Header */}
      <View style={scannerStyles.header}>
        <TouchableOpacity
          style={scannerStyles.backBtn}
          onPress={handleGoBack}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="arrow-back" size={24} color={colors.text} accessibilityLabel="Voltar" />
        </TouchableOpacity>

        <View style={scannerStyles.headerCenter}>
          <Text style={scannerStyles.headerTitle} numberOfLines={1}>
            {inventory?.metadata.name}
          </Text>
          <Text style={scannerStyles.headerSub}>Escaneamento em andamento</Text>
        </View>

        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity style={scannerStyles.homeBtn} onPress={handleGoToHome}>
            <Ionicons
              name="home-outline"
              size={22}
              color={colors.accent}
              accessibilityLabel="Início"
            />
          </TouchableOpacity>
          <TouchableOpacity
            style={scannerStyles.finishBtn}
            onPress={() => {
              if (!inventory) return; // Guarda de segurança
              navigation.navigate('InventoryDetail', {
                inventoryId: inventory.metadata.id,
                inventoryName: inventory.metadata.name,
              });
            }}
          >
            <Text style={scannerStyles.finishBtnText}>Concluir</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Progresso, Alertas, Tabs */}
      {/* ... permanecem iguais, exceto os ícones das tabs */}

      <View style={scannerStyles.tabs}>
        <TouchableOpacity
          style={[scannerStyles.tab, mode === 'camera' && scannerStyles.tabActive]}
          onPress={() => setMode('camera')}
        >
          <Ionicons
            name="camera-outline"
            size={18}
            color={mode === 'camera' ? colors.accent : colors.textDim}
          />
          <Text style={[scannerStyles.tabText, mode === 'camera' && scannerStyles.tabTextActive]}>
            {'  '}Câmera
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[scannerStyles.tab, mode === 'manual' && scannerStyles.tabActive]}
          onPress={() => {
            setMode('manual');
            setTimeout(() => manualInputRef.current?.focus(), 200);
          }}
        >
          <Ionicons
            name="keypad-outline"
            size={18}
            color={mode === 'manual' ? colors.accent : colors.textDim}
          />
          <Text style={[scannerStyles.tabText, mode === 'manual' && scannerStyles.tabTextActive]}>
            {'  '}Manual
          </Text>
        </TouchableOpacity>
      </View>

      {/* ─── Área Principal (Câmera ou Manual) ─── */}
      <View style={scannerStyles.mainArea}>
        {mode === 'camera' ? (
          <CameraArea
            permission={permission}
            isCameraActive={isCameraActive}
            onRequestPermission={requestPermission}
            onCodeScanned={handleCodeScanned}
          />
        ) : (
          <ManualArea
            value={manualCode}
            onChange={setManualCode}
            onSubmit={handleManualSubmit}
            inputRef={manualInputRef}
          />
        )}
      </View>

      {/* ─── Alertas (Banners Flutuantes) ─── */}
      <View style={scannerStyles.alertsContainer}>
        {alerts.map((alert) => (
          <Animated.View
            key={alert.id}
            style={[scannerStyles.alertBanner, scannerStyles[`alert_${alert.type}`]]}
          >
            <Ionicons
              name={
                alert.type === 'success'
                  ? 'checkmark-circle'
                  : alert.type === 'error'
                    ? 'alert-circle'
                    : 'warning-outline'
              }
              size={20}
              color="#fff"
            />
            <Text style={scannerStyles.alertText}>{alert.message}</Text>
          </Animated.View>
        ))}
      </View>

      {/* ─── Modal de Confirmação ─── */}
      <ConfirmModal
        visible={isConfirmVisible}
        item={pendingItem}
        onConfirm={handleConfirm}
        onCancel={handleCancelConfirm}
      />
    </View>
  );
};

// ─── Subcomponentes ─────────────────────────────────────────────────────────

interface CameraAreaProps {
  permission: { granted: boolean } | null;
  isCameraActive: boolean;
  onRequestPermission: () => void;
  onCodeScanned: (code: string) => void;
}

const CameraArea = React.memo(
  ({ permission, isCameraActive, onRequestPermission, onCodeScanned }: CameraAreaProps) => {
    if (!permission) {
      return (
        <View style={scannerStyles.cameraPlaceholder}>
          <ActivityIndicator color={colors.accent} />
          <Text style={scannerStyles.cameraPlaceholderText}>Carregando câmera…</Text>
        </View>
      );
    }
    if (!permission.granted) {
      return (
        <View style={scannerStyles.cameraPlaceholder}>
          <Ionicons name="lock-closed-outline" size={48} color={colors.textDim} />
          <Text style={scannerStyles.cameraPlaceholderText}>Permissão de câmera necessária</Text>
          <TouchableOpacity style={scannerStyles.permissionBtn} onPress={onRequestPermission}>
            <Text style={scannerStyles.permissionBtnText}>Conceder permissão</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return (
      <View style={scannerStyles.cameraWrapper}>
        {isCameraActive && (
          <CameraView
            style={{ flex: 1 }}
            facing="back"
            barcodeScannerSettings={{
              barcodeTypes: ['code128', 'code39', 'ean13', 'ean8', 'qr', 'pdf417', 'itf14'],
            }}
            onBarcodeScanned={({ data }) => onCodeScanned(data)}
          />
        )}
        <View style={scannerStyles.viewfinder}>
          <View style={[scannerStyles.corner, scannerStyles.cornerTL]} />
          <View style={[scannerStyles.corner, scannerStyles.cornerTR]} />
          <View style={[scannerStyles.corner, scannerStyles.cornerBL]} />
          <View style={[scannerStyles.corner, scannerStyles.cornerBR]} />
          <View style={scannerStyles.scanLine} />
        </View>
        <Text style={scannerStyles.cameraHint}>Aponte para o código de barras do item</Text>
      </View>
    );
  }
);

interface ManualAreaProps {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  inputRef: React.RefObject<TextInput | null>;
}

const ManualArea = React.memo(({ value, onChange, onSubmit, inputRef }: ManualAreaProps) => (
  <KeyboardAvoidingView
    style={scannerStyles.manualArea}
    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
  >
    <Ionicons name="finger-print-outline" size={48} color={colors.textDim} />
    <Text style={scannerStyles.manualTitle}>Código do patrimônio</Text>
    <Text style={scannerStyles.manualDesc}>
      Digite o código exatamente como consta no inventário
    </Text>
    <TextInput
      ref={inputRef}
      style={scannerStyles.manualInput}
      value={value}
      onChangeText={onChange}
      placeholder="Ex: PAT-00123"
      placeholderTextColor="#555"
      autoCapitalize="characters"
      autoCorrect={false}
      returnKeyType="search"
      onSubmitEditing={onSubmit}
    />
    <TouchableOpacity
      style={[scannerStyles.manualSubmitBtn, !value.trim() && scannerStyles.manualSubmitDisabled]}
      onPress={onSubmit}
      disabled={!value.trim()}
    >
      <Text style={scannerStyles.manualSubmitText}>Buscar item</Text>
      <Ionicons name="arrow-forward" size={20} color="#000" style={{ marginLeft: 4 }} />
    </TouchableOpacity>
  </KeyboardAvoidingView>
));

interface ConfirmModalProps {
  visible: boolean;
  item: AssetItem | null;
  onConfirm: () => void;
  onCancel: () => void;
}

const ConfirmModal = React.memo(({ visible, item, onConfirm, onCancel }: ConfirmModalProps) => {
  const customFieldsEntries = item?.customFields ? Object.entries(item.customFields) : [];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <View style={scannerStyles.modalOverlay}>
        <View style={scannerStyles.modalSheet}>
          <View style={scannerStyles.modalHandle} />
          <Text style={scannerStyles.modalTitle}>Confirmar item</Text>
          <Text style={scannerStyles.modalSubtitle}>
            Verifique os dados antes de confirmar o scan
          </Text>
          {item && (
            <ScrollView
              style={scannerStyles.modalDetails}
              contentContainerStyle={scannerStyles.modalDetailsContent}
              showsVerticalScrollIndicator={false}
            >
              <DetailRow icon="pricetag-outline" label="Código" value={item.code} highlight />
              {item.description ? (
                <DetailRow icon="cube-outline" label="Descrição" value={item.description} />
              ) : null}
              {item.location ? (
                <DetailRow icon="location-outline" label="Localização" value={item.location} />
              ) : null}
              {item.department ? (
                <DetailRow icon="business-outline" label="Departamento" value={item.department} />
              ) : null}
              {item.status ? (
                <DetailRow icon="information-circle-outline" label="Status" value={item.status} />
              ) : null}
              {item.value ? (
                <DetailRow icon="cash-outline" label="Valor" value={`R$ ${item.value}`} />
              ) : null}
              {customFieldsEntries.map(([key, value]) => (
                <DetailRow key={key} icon="star-outline" label={key} value={value} />
              ))}
            </ScrollView>
          )}
          <View style={scannerStyles.modalActions}>
            <TouchableOpacity style={scannerStyles.cancelBtn} onPress={onCancel}>
              <Text style={scannerStyles.cancelBtnText}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={scannerStyles.confirmBtn} onPress={onConfirm}>
              <Ionicons name="checkmark-circle" size={20} color="#000" />
              <Text style={scannerStyles.confirmBtnText}>Confirmar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
});

// ✅ DetailRow agora recebe o nome do ícone e renderiza Ionicons
const DetailRow = React.memo(
  ({
    icon,
    label,
    value,
    highlight,
  }: {
    icon: keyof typeof Ionicons.glyphMap; // ou string, mas restrito ao Ionicons
    label: string;
    value: string;
    highlight?: boolean;
  }) => (
    <View style={scannerStyles.detailRow}>
      <Ionicons name={icon} size={20} color={highlight ? colors.accent : colors.textDim} />
      <View style={scannerStyles.detailContent}>
        <Text style={scannerStyles.detailLabel}>{label}</Text>
        <Text style={[scannerStyles.detailValue, highlight && scannerStyles.detailValueHighlight]}>
          {value}
        </Text>
      </View>
    </View>
  )
);
