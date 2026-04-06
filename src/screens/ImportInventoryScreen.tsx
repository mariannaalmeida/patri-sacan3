import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { ImportService } from '../services/ImportService';
import { colors, createInventoryStyles } from '../styles/theme';
import { ColumnMapping, MappableField, RootStackParamList } from '../types/types';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

type Step = 'initial' | 'mapping' | 'validation' | 'processing';

// ✅ Constante com os campos disponíveis para mapeamento
const MAPPABLE_FIELDS: MappableField[] = [
  'code',
  'description',
  'department',
  'location',
  'status',
  'value',
];

// ✅ Nomes amigáveis para exibição
const FIELD_LABELS: Record<MappableField, string> = {
  code: 'Código',
  description: 'Descrição',
  department: 'Departamento',
  location: 'Localização',
  status: 'Status',
  value: 'Valor',
};

export const ImportInventoryScreen = () => {
  const navigation = useNavigation<NavigationProp>();
  const [currentStep, setCurrentStep] = useState<Step>('initial');
  const [inventoryName, setInventoryName] = useState('');
  const [csvData, setCsvData] = useState<any[]>([]);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [columnMapping, setColumnMapping] = useState<ColumnMapping[]>([]);
  const [finalMapping, setFinalMapping] = useState<Record<string, MappableField>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);

  const styles = createInventoryStyles;

  // ✅ Resetar o estado do formulário
  const resetForm = () => {
    setCurrentStep('initial');
    setInventoryName('');
    setCsvData([]);
    setCsvHeaders([]);
    setColumnMapping([]);
    setFinalMapping({});
    setProgress(0);
  };

  // ✅ Voltar para a Home
  const handleGoBack = () => {
    if (currentStep !== 'initial') {
      // Se não estiver na etapa inicial, pergunta se quer cancelar
      Alert.alert('Cancelar importação', 'Deseja cancelar a importação e voltar?', [
        { text: 'Continuar importação', style: 'cancel' },
        {
          text: 'Cancelar',
          style: 'destructive',
          onPress: () => {
            resetForm();
            navigation.goBack();
          },
        },
      ]);
    } else {
      navigation.goBack();
    }
  };

  // Etapa 1: Selecionar arquivo e nome
  const handleSelectFile = async () => {
    if (!inventoryName.trim()) {
      Alert.alert('Atenção', 'Digite um nome para o inventário');
      return;
    }

    setIsLoading(true);

    try {
      const fileResult = await ImportService.pickCSVFile();

      if (!fileResult.ok) {
        Alert.alert('Erro', fileResult.error.message);
        return;
      }

      // ✅ Verificação mais clara de cancelamento
      if (!fileResult.value || !fileResult.value.assets || fileResult.value.assets.length === 0) {
        return; // Usuário cancelou a seleção
      }

      const parseResult = await ImportService.parseCSVFile(fileResult.value.assets[0].uri);

      if (!parseResult.ok) {
        throw new Error(parseResult.error.message);
      }

      const { headers, data } = parseResult.value;

      setCsvHeaders(headers);
      setCsvData(data);

      const suggestions = ImportService.suggestColumnMapping(headers);
      setColumnMapping(suggestions);

      setCurrentStep('mapping');
    } catch (error) {
      Alert.alert('Erro', error instanceof Error ? error.message : 'Erro ao processar arquivo');
    } finally {
      setIsLoading(false);
    }
  };

  // Etapa 2: Configurar mapeamento
  const handleMappingComplete = () => {
    const mapping: Record<string, MappableField> = {};

    columnMapping.forEach((item) => {
      if (item.mappedField) {
        mapping[item.csvHeader] = item.mappedField;
      }
    });

    // ✅ Verificação mais específica para o campo code
    const hasCodeMapping = Object.values(mapping).some((field) => field === 'code');

    if (!hasCodeMapping) {
      Alert.alert('Campo obrigatório', 'É necessário mapear uma coluna para o Código do item');
      return;
    }

    setFinalMapping(mapping);
    setCurrentStep('validation');
  };

  // Etapa 3: Validar e processar
  const handleProcessInventory = async () => {
    setIsLoading(true);
    setProgress(10);

    try {
      const validation = ImportService.validateCSVData(csvData, finalMapping);
      setProgress(40);

      if (validation.errorRows > 0) {
        Alert.alert(
          'Erros encontrados',
          `${validation.errorRows} linhas contêm erros. Deseja continuar mesmo assim?`,
          [
            { text: 'Cancelar', style: 'cancel', onPress: () => setIsLoading(false) },
            { text: 'Continuar', onPress: () => processInventory(validation) },
          ]
        );
      } else {
        await processInventory(validation);
      }
    } catch (error) {
      Alert.alert('Erro', 'Falha ao processar inventário');
      setIsLoading(false);
      setProgress(0);
    }
  };

  const processInventory = async (validation: any) => {
    try {
      setProgress(60);
      const items = ImportService.convertToAssetItems(csvData, finalMapping);
      setProgress(80);

      const inventoryResult = await ImportService.createInventoryFromCSV(inventoryName, items);
      setProgress(100);

      if (inventoryResult.ok) {
        const inventory = inventoryResult.value;

        Alert.alert('Sucesso!', `Inventário "${inventoryName}" criado com ${items.length} itens.`, [
          {
            text: 'Ver Inventário',
            onPress: () => {
              resetForm();
              navigation.replace('InventoryDetail', {
                inventoryId: inventory.metadata.id,
                inventoryName: inventory.metadata.name,
              });
            },
          },
          {
            text: 'Fechar',
            style: 'cancel',
            onPress: () => {
              resetForm();
              navigation.goBack();
            },
          },
        ]);
      } else {
        throw new Error(inventoryResult.error.message);
      }
    } catch (error) {
      Alert.alert('Erro', error instanceof Error ? error.message : 'Falha ao criar inventário');
      setIsLoading(false);
      setProgress(0);
    }
  };

  // Renderizar tela de mapeamento
  const renderMappingStep = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>Mapear Colunas</Text>
      <Text style={styles.stepDescription}>
        Associe as colunas do CSV aos campos do sistema. O campo{' '}
        <Text style={{ fontWeight: 'bold', color: colors.accent }}>Código</Text> é obrigatório.
      </Text>

      <ScrollView style={styles.mappingList} showsVerticalScrollIndicator={false}>
        {columnMapping.map((item, index) => (
          <View key={index} style={styles.mappingItem}>
            <Text style={styles.csvHeader}>{item.csvHeader}</Text>
            <View style={styles.mappingControls}>
              <TouchableOpacity
                style={[styles.fieldButton, !item.mappedField && styles.fieldButtonActive]}
                onPress={() => {
                  const newMapping = [...columnMapping];
                  newMapping[index] = { ...newMapping[index], mappedField: undefined };
                  setColumnMapping(newMapping);
                }}
              >
                <Text
                  style={[
                    styles.fieldButtonText,
                    !item.mappedField && styles.fieldButtonTextActive,
                  ]}
                >
                  Ignorar
                </Text>
              </TouchableOpacity>

              {MAPPABLE_FIELDS.map((field) => (
                <TouchableOpacity
                  key={field}
                  style={[
                    styles.fieldButton,
                    item.mappedField === field && styles.fieldButtonActive,
                  ]}
                  onPress={() => {
                    const newMapping = [...columnMapping];
                    newMapping[index] = { ...newMapping[index], mappedField: field };
                    setColumnMapping(newMapping);
                  }}
                >
                  <Text
                    style={[
                      styles.fieldButtonText,
                      item.mappedField === field && styles.fieldButtonTextActive,
                    ]}
                  >
                    {FIELD_LABELS[field]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {item.confidence > 0 && item.confidence < 100 && (
              <Text style={styles.confidenceText}>Confiança: {item.confidence}%</Text>
            )}
          </View>
        ))}
      </ScrollView>

      <TouchableOpacity style={styles.actionButton} onPress={handleMappingComplete}>
        <Text style={styles.actionButtonText}>Continuar</Text>
      </TouchableOpacity>
    </View>
  );

  // Renderizar tela de validação
  const renderValidationStep = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>Validar Dados</Text>

      <View style={styles.statsCard}>
        <Text style={styles.statsTitle}>Resumo</Text>
        <Text style={styles.statsText}>Total de linhas: {csvData.length}</Text>
        <Text style={styles.statsText}>Colunas mapeadas: {Object.keys(finalMapping).length}</Text>
        <Text style={styles.statsText}>
          Itens válidos: {csvData.length}
          {csvData.length > 0 && ` (amostra abaixo)`}
        </Text>
      </View>

      <Text style={styles.previewTitle}>Preview dos dados:</Text>
      <ScrollView style={styles.previewList} showsVerticalScrollIndicator={false}>
        {csvData.slice(0, 5).map((row, index) => (
          <View key={index} style={styles.previewItem}>
            {Object.entries(finalMapping).map(([csvHeader, field]) => (
              <Text key={field} style={styles.previewText}>
                <Text style={{ fontWeight: 'bold', color: colors.accent }}>
                  {FIELD_LABELS[field]}:
                </Text>{' '}
                {row[csvHeader] || '—'}
              </Text>
            ))}
          </View>
        ))}
      </ScrollView>

      <TouchableOpacity
        style={[styles.actionButton, isLoading && styles.buttonDisabled]}
        onPress={handleProcessInventory}
        disabled={isLoading}
      >
        {isLoading ? (
          <ActivityIndicator color="#000" />
        ) : (
          <Text style={styles.actionButtonText}>Criar Inventário</Text>
        )}
      </TouchableOpacity>

      {progress > 0 && (
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${progress}%` }]} />
        </View>
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.bg} />

      {/* Header com botão de voltar */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleGoBack} style={styles.backBtn}>
          <Text style={styles.backBtnText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Importar CSV</Text>
        <View style={{ width: 36 }} />
      </View>

      {currentStep === 'initial' && (
        <View style={styles.stepContainer}>
          <Text style={styles.label}>Nome do Inventário</Text>
          <TextInput
            style={styles.input}
            value={inventoryName}
            onChangeText={setInventoryName}
            placeholder="Ex: Inventário 2024"
            placeholderTextColor={colors.textDim}
          />

          <TouchableOpacity
            style={[styles.actionButton, isLoading && styles.buttonDisabled]}
            onPress={handleSelectFile}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="#000" />
            ) : (
              <Text style={styles.actionButtonText}>Selecionar Arquivo CSV</Text>
            )}
          </TouchableOpacity>

          <Text style={styles.hint}>
            O arquivo CSV deve conter os dados dos itens patrimoniais. Na próxima etapa você poderá
            mapear as colunas.
          </Text>
        </View>
      )}

      {currentStep === 'mapping' && renderMappingStep()}
      {currentStep === 'validation' && renderValidationStep()}
    </View>
  );
};