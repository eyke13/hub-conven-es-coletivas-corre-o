function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Valida o código de administrador (mesmo usado em admin.functions.ts). */
export function assertAdmin(code: string) {
  const expected = process.env.ADMIN_CODE;
  if (!expected) throw new Error("ADMIN_CODE não configurado no servidor.");
  if (!code || !timingSafeEqual(String(code), expected)) {
    throw new Error("Código de administrador inválido.");
  }
}
