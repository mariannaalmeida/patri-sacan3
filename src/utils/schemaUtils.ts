import { AssetItem, InventorySchema, FieldDefinition } from '../types/types';

export function generateBasicSchema(items: AssetItem[]): InventorySchema {
  const fixedFields: FieldDefinition[] = [
    { name: 'code', label: 'Código', type: 'text', required: true, fixed: true },
    { name: 'description', label: 'Descrição', type: 'text', required: false, fixed: true },
    { name: 'department', label: 'Departamento', type: 'text', required: false, fixed: true },
    { name: 'location', label: 'Localização', type: 'text', required: false, fixed: true },
    {
      name: 'status',
      label: 'Status',
      type: 'text',
      required: true,
      fixed: true,
      options: ['good', 'damaged', 'missing', 'in_repair'],
    },
    { name: 'value', label: 'Valor (R$)', type: 'currency', required: false, fixed: true },
  ];

  const customKeys = new Set<string>();
  items.forEach((item) => {
    if (item.customFields) {
      Object.keys(item.customFields).forEach((key) => customKeys.add(key));
    }
  });

  const customFields: FieldDefinition[] = Array.from(customKeys).map((key) => ({
    name: key,
    label: key,
    type: 'text',
    required: false,
  }));

  return {
    version: '1.0',
    fields: [...fixedFields, ...customFields],
  };
}