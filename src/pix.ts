// "Pix copia e cola" (BR Code estático do Banco Central): campos EMV no formato ID + tamanho + valor,
// terminando com um CRC16. Qualquer app de banco lê esse texto (colado ou como QR Code).

const field = (id: string, value: string) => `${id}${String(value.length).padStart(2, '0')}${value}`;

/** Texto sem acentos e só com caracteres aceitos no BR Code. */
const clean = (s: string, max: number) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9 .\-@]/g, '').trim().slice(0, max);

function crc16(payload: string) {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/** Gera o "Pix copia e cola" para uma chave, sem valor fixo (quem doa escolhe quanto). */
export function pixPayload(key: string, name: string, city: string): string {
  const account = field('00', 'br.gov.bcb.pix') + field('01', key.trim());
  const body =
    field('00', '01') +
    field('26', account) +
    field('52', '0000') +
    field('53', '986') +
    field('58', 'BR') +
    field('59', clean(name, 25) || 'DOACAO') +
    field('60', clean(city, 15) || 'BRASIL') +
    field('62', field('05', '***'));
  const toSign = `${body}6304`;
  return toSign + crc16(toSign);
}
