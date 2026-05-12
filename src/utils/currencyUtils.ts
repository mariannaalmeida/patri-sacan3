/**
 * Converte uma string formatada no padrão brasileiro (ex: "1.500,00" ou "1500,00")
 * para um número.
 *
 * @param value - String representando o valor monetário (pode conter separadores de milhar e vírgula decimal)
 * @returns O número correspondente, ou NaN se a string for inválida.
 */
export function parseBrazilianCurrency(value: string): number {
  if (!value) return NaN;

  // Remove pontos de milhar, substitui vírgula decimal por ponto
  const sanitized = value.replace(/\./g, '').replace(',', '.');
  return parseFloat(sanitized);
}

/**
 * Versão segura que retorna `undefined` caso o valor seja inválido ou vazio.
 *
 * @param value - String a ser convertida
 * @returns número ou undefined
 */
export function parseBrazilianCurrencySafe(value: string): number | undefined {
  const parsed = parseBrazilianCurrency(value);
  return isNaN(parsed) ? undefined : parsed;
}
