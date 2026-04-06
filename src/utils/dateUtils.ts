// src/utils/dateUtils.ts
import { ISODateString } from '../types/types'; // ajuste o caminho conforme sua estrutura

/**
 * Valida e converte uma data (string ou objeto Date) para o Branded Type ISODateString.
 */
export function toISODate(date: string | Date): ISODateString {
  const d = typeof date === 'string' ? new Date(date) : date;

  if (isNaN(d.getTime())) {
    throw new Error('Data inválida fornecida para toISODate');
  }

  return d.toISOString() as ISODateString;
}
