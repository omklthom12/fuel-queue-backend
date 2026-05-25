function required(body, fields) {
  const missing = fields.filter((f) => body[f] === undefined || body[f] === null || String(body[f]).trim() === '');
  return missing;
}

function normalizePhone(phone) {
  return String(phone || '').trim().replace(/\s+/g, '');
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

module.exports = { required, normalizePhone, toNumber };
