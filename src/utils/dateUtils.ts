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

/**
 * Formata uma data ISO (string ou Date) no formato brasileiro amigável.
 * Exemplo: "12 abr. 2025"
 */
export function formatDisplayDate(date: string | Date, options?: { fallback?: string }): string {
  const fallback = options?.fallback ?? 'Data inválida';
  try {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    // Verifica se a data é válida
    if (isNaN(dateObj.getTime())) return fallback;

    return dateObj.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return fallback;
  }
}


export function formatDisplayTime(date: string | Date): string {
  try {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(dateObj.getTime())) return '';
    return dateObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}
