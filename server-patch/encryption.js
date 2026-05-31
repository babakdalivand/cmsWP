'use strict';
const crypto = require('crypto');

const KEY_SOURCE = process.env.ENCRYPTION_KEY || process.env.SESSION_SECRET || 'persianatheists_enc_key_2026!!!';
const KEY = crypto.createHash('sha256').update(KEY_SOURCE).digest();
const ALGO = 'aes-256-cbc';

function encrypt(text) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGO, KEY, iv);
  const enc = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return iv.toString('hex') + ':' + enc.toString('hex');
}

function decrypt(str) {
  const [ivHex, dataHex] = str.split(':');
  const iv  = Buffer.from(ivHex,   'hex');
  const dec = crypto.createDecipheriv(ALGO, KEY, iv);
  return Buffer.concat([dec.update(Buffer.from(dataHex, 'hex')), dec.final()]).toString('utf8');
}

module.exports = { encrypt, decrypt };
