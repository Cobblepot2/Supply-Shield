const encoder = new TextEncoder();
const decodeBase64 = (text) => Uint8Array.from(atob(text), (char) => char.charCodeAt(0));
const hex = (bytes) => [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');

export async function sha256(text) {
  return hex(await crypto.subtle.digest('SHA-256', encoder.encode(text)));
}

export async function verifyRelease(release, currentFiles, candidate) {
  const payload = JSON.stringify(candidate);
  const publicKey = await crypto.subtle.importKey('spki', decodeBase64(release.publicKey),
    { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  const signatureValid = await crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' }, publicKey, decodeBase64(release.signature), encoder.encode(payload),
  );

  // If the signature fails, the rows only explain what a hash-only check would have reported.
  const rows = await Promise.all(candidate.files.map(async ({ id, sha256: expected }) => {
    const actual = await sha256(currentFiles[id]);
    return { id, expected, actual, match: expected === actual };
  }));
  return { signatureValid, allowed: signatureValid && rows.every((row) => row.match), rows };
}

export function auditConnections(entries, allowlist) {
  const allowed = new Set(allowlist);
  return entries.map((entry) => ({ ...entry, accepted: allowed.has(entry.host) }));
}

export async function compareNodes(approvedHash, sources) {
  return Promise.all(sources.map(async ({ name, contents }) => {
    const hash = await sha256(contents);
    return { name, hash, match: hash === approvedHash };
  }));
}
