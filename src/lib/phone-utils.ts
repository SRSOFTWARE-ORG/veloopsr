/**
 * Normaliza telefone BR para envio via Evolution API.
 * Retorna apenas dígitos com DDI 55. Retorna null se inválido.
 * Aceita 10 ou 11 dígitos locais (com ou sem 55 na frente).
 */
export function normalizeBrazilianPhone(input?: string | null): string | null {
  if (!input) return null;
  let digits = String(input).replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("0")) digits = digits.replace(/^0+/, "");
  // Remove DDI 55 se já existir, validamos só o local
  if (digits.startsWith("55") && digits.length > 11) {
    digits = digits.slice(2);
  }
  // Local deve ter 10 (fixo) ou 11 (celular) dígitos
  if (digits.length < 10 || digits.length > 11) return null;
  return "55" + digits;
}

export function isValidBrazilianPhone(input?: string | null): boolean {
  return normalizeBrazilianPhone(input) !== null;
}
