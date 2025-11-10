/**
 * Utilidades para sanitizar nombres de archivo, nombres de usuario y paths
 * Previene ataques de path traversal y nombres de archivo peligrosos
 */

/**
 * Sanitiza un nombre de archivo removiendo caracteres peligrosos
 *
 * Protecciones:
 * - Remueve path traversal: ../, ..\, etc.
 * - Remueve caracteres especiales peligrosos: /, \, :, *, ?, ", <, >, |
 * - Limita la longitud a 255 caracteres (límite de sistemas de archivos)
 * - Previene nombres reservados de Windows (CON, PRN, AUX, etc.)
 * - Preserva la extensión del archivo
 *
 * @param filename - Nombre de archivo original
 * @returns Nombre de archivo sanitizado seguro
 *
 * @example
 * sanitizeFilename('../../etc/passwd') // → 'etc_passwd'
 * sanitizeFilename('my file*.txt') // → 'my_file.txt'
 * sanitizeFilename('CON.txt') // → 'CON_file.txt'
 */
export function sanitizeFilename(filename: string): string {
  if (!filename || typeof filename !== 'string') {
    return 'unnamed_file';
  }

  // Remover espacios al inicio y final
  let sanitized = filename.trim();

  // Si está vacío después del trim, usar nombre por defecto
  if (!sanitized) {
    return 'unnamed_file';
  }

  // Separar nombre base y extensión
  const lastDotIndex = sanitized.lastIndexOf('.');
  let baseName = lastDotIndex > 0 ? sanitized.substring(0, lastDotIndex) : sanitized;
  let extension = lastDotIndex > 0 ? sanitized.substring(lastDotIndex) : '';

  // Sanitizar nombre base
  baseName = baseName
    // Remover path separators y caracteres peligrosos
    .replace(/[/\\:*?"<>|]/g, '_')
    // Remover secuencias de puntos (path traversal)
    .replace(/\.{2,}/g, '_')
    // Remover caracteres de control (ASCII 0-31)
    .replace(/[\x00-\x1F]/g, '')
    // Remover espacios múltiples
    .replace(/\s+/g, ' ')
    // Remover puntos al inicio (archivos ocultos en Unix pueden ser problemáticos)
    .replace(/^\.+/, '')
    // Limitar caracteres especiales excesivos
    .replace(/[^\w\s.-]/g, '_');

  // Sanitizar extensión (debe ser alfanumérica con punto)
  if (extension) {
    extension = extension
      .replace(/[^\w.]/g, '')
      .substring(0, 10); // Limitar extensión a 10 caracteres

    // Asegurar que la extensión tenga solo un punto al inicio
    if (!extension.startsWith('.')) {
      extension = '.' + extension;
    }
    extension = extension.replace(/\.{2,}/g, '.');
  }

  // Reconstruir nombre
  sanitized = baseName + extension;

  // Verificar nombres reservados de Windows
  const windowsReservedNames = [
    'CON', 'PRN', 'AUX', 'NUL',
    'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
    'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'
  ];

  const nameWithoutExt = sanitized.substring(0, sanitized.lastIndexOf('.') > 0 ? sanitized.lastIndexOf('.') : sanitized.length);
  if (windowsReservedNames.includes(nameWithoutExt.toUpperCase())) {
    sanitized = nameWithoutExt + '_file' + extension;
  }

  // Limitar longitud total (255 es el límite en la mayoría de sistemas de archivos)
  if (sanitized.length > 255) {
    const maxBaseLength = 255 - extension.length;
    sanitized = baseName.substring(0, maxBaseLength) + extension;
  }

  // Si después de todo aún está vacío, usar nombre por defecto
  if (!sanitized || sanitized === extension) {
    return 'unnamed_file' + extension;
  }

  return sanitized;
}

/**
 * Sanitiza un nombre de usuario para usar en carpetas y paths
 *
 * Protecciones:
 * - Remueve path traversal
 * - Solo permite caracteres alfanuméricos, guiones y guiones bajos
 * - Limita la longitud
 * - Previene nombres vacíos o solo espacios
 *
 * @param username - Nombre de usuario original
 * @returns Nombre de usuario sanitizado seguro
 *
 * @example
 * sanitizeUsername('Juan Pérez') // → 'Juan_Perez'
 * sanitizeUsername('../admin') // → 'admin'
 * sanitizeUsername('user@123') // → 'user_123'
 */
export function sanitizeUsername(username: string): string {
  if (!username || typeof username !== 'string') {
    return 'unknown_user';
  }

  let sanitized = username.trim();

  // Si está vacío, usar nombre por defecto
  if (!sanitized) {
    return 'unknown_user';
  }

  // Sanitizar: solo alfanuméricos, espacios, guiones y guiones bajos
  sanitized = sanitized
    // Remover path separators
    .replace(/[/\\]/g, '')
    // Remover puntos múltiples (path traversal)
    .replace(/\.{2,}/g, '')
    // Normalizar caracteres especiales a ASCII
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    // Reemplazar caracteres no válidos por guión bajo
    .replace(/[^\w\s-]/g, '_')
    // Reemplazar espacios por guión bajo
    .replace(/\s+/g, '_')
    // Remover guiones/underscores múltiples
    .replace(/[-_]+/g, '_')
    // Remover guiones/underscores al inicio y final
    .replace(/^[-_]+|[-_]+$/g, '');

  // Limitar longitud (50 caracteres es razonable)
  if (sanitized.length > 50) {
    sanitized = sanitized.substring(0, 50);
  }

  // Si después de sanitizar está vacío, usar nombre por defecto
  if (!sanitized) {
    return 'unknown_user';
  }

  return sanitized;
}

/**
 * Valida que un path no escape del directorio base permitido
 * Útil para validar paths antes de operaciones de sistema de archivos
 *
 * @param basePath - Path base permitido
 * @param targetPath - Path objetivo a validar
 * @returns true si el path es seguro, false si intenta escapar
 *
 * @example
 * isPathSafe('/home/user/files', '/home/user/files/doc.txt') // → true
 * isPathSafe('/home/user/files', '/home/user/files/../etc/passwd') // → false
 */
export function isPathSafe(basePath: string, targetPath: string): boolean {
  const path = require('path');
  const normalizedBase = path.resolve(basePath);
  const normalizedTarget = path.resolve(targetPath);

  return normalizedTarget.startsWith(normalizedBase);
}

/**
 * Valida que un nombre de archivo sea seguro antes de usarlo
 *
 * @param filename - Nombre de archivo a validar
 * @returns true si es seguro, false si es potencialmente peligroso
 */
export function isFilenameSafe(filename: string): boolean {
  if (!filename || typeof filename !== 'string') {
    return false;
  }

  // Detectar intentos de path traversal
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return false;
  }

  // Detectar caracteres peligrosos
  if (/[<>:"|?*\x00-\x1F]/.test(filename)) {
    return false;
  }

  // Verificar longitud razonable
  if (filename.length === 0 || filename.length > 255) {
    return false;
  }

  return true;
}

/**
 * Genera un nombre de archivo único agregando un sufijo numérico si es necesario
 *
 * @param baseFilename - Nombre de archivo base
 * @param existingFiles - Array de nombres de archivos existentes
 * @returns Nombre de archivo único
 *
 * @example
 * generateUniqueFilename('doc.txt', ['doc.txt', 'doc_1.txt']) // → 'doc_2.txt'
 */
export function generateUniqueFilename(baseFilename: string, existingFiles: string[]): string {
  let filename = baseFilename;
  let counter = 1;

  const lastDotIndex = baseFilename.lastIndexOf('.');
  const baseName = lastDotIndex > 0 ? baseFilename.substring(0, lastDotIndex) : baseFilename;
  const extension = lastDotIndex > 0 ? baseFilename.substring(lastDotIndex) : '';

  while (existingFiles.includes(filename)) {
    filename = `${baseName}_${counter}${extension}`;
    counter++;
  }

  return filename;
}
