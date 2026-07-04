// Validação de conteúdo de upload de imagem (defesa contra arquivo malicioso
// disfarçado de imagem só pelo MIME/extensão do data-URL).

/**
 * Confere que os BYTES iniciais do buffer batem com o MIME declarado.
 * Suporta JPEG, PNG, WEBP e GIF. Retorna false para qualquer divergência.
 * @param {Buffer} buffer
 * @param {string} mime ex.: 'image/png'
 */
export function conferirMagicBytes(buffer, mime) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return false;
  switch (mime) {
    case 'image/jpeg':
      return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    case 'image/png':
      return buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
    case 'image/webp':
      return buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
    case 'image/gif':
      return buffer.toString('ascii', 0, 4) === 'GIF8';
    default:
      return false;
  }
}
