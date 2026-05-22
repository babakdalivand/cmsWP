import md5 from 'md5';

const ITOA64 = './0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

function encode64(input: Buffer, count: number): string {
  let output = '';
  let i = 0;
  do {
    let value = input[i++];
    output += ITOA64[value & 0x3f];
    if (i < count) value |= input[i] << 8;
    output += ITOA64[(value >> 6) & 0x3f];
    if (i++ >= count) break;
    if (i < count) value |= input[i] << 16;
    output += ITOA64[(value >> 12) & 0x3f];
    if (i++ >= count) break;
    output += ITOA64[(value >> 18) & 0x3f];
  } while (i < count);
  return output;
}

function hashPassword(password: string, setting: string): string {
  const countLog2 = ITOA64.indexOf(setting[3]);
  let count = 1 << countLog2;
  const salt = setting.substring(4, 12);

  let hash = Buffer.from(md5(salt + password), 'hex');
  const passwordBuf = Buffer.from(password);
  do {
    const combined = Buffer.concat([hash, passwordBuf]);
    hash = Buffer.from(md5(combined as unknown as string), 'hex');
  } while (--count);

  const output = setting.substring(0, 12) + encode64(hash, 16);
  return output;
}

export function checkPassword(password: string, hash: string): boolean {
  if (hash.startsWith('$P$') || hash.startsWith('$H$')) {
    return hashPassword(password, hash) === hash;
  }
  // fallback: MD5 (old WP)
  return md5(password) === hash;
}
