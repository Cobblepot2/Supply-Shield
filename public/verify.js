const enc = new TextEncoder();
const alphabet = (bytes) => [...new Uint8Array(bytes)].map((value) => value.toString(16).padStart(2, '0')).join('');

export const textBytes = (value) => enc.encode(value);

export async function sha256(bytes) {
  const data = typeof bytes === 'string' ? textBytes(bytes) : bytes;
  return alphabet(await crypto.subtle.digest('SHA-256', data));
}

export async function newPublisher() {
  return crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
}

export async function publishRelease(publisher, version, files) {
  if (!files.size) throw new Error('Empty release');
  const entries = await Promise.all([...files].map(async ([id, bytes]) => ({ id, sha256: await sha256(bytes) })));
  const manifest = { version, files: entries };
  const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' },
    publisher.privateKey, textBytes(JSON.stringify(manifest)));
  return { manifest, signature };
}

export async function verifyRelease(key, signature, manifest, received) {
  const signatureValid = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' },
    key, signature, textBytes(JSON.stringify(manifest)));
  const actualHashes = new Map(await Promise.all(
    [...received].map(async ([id, bytes]) => [id, await sha256(bytes)]),
  ));
  const rows = manifest.files.map(({ id, sha256: expected }) => {
    const actual = actualHashes.get(id) ?? null;
    return { id, expected, actual, state: actual === null ? 'missing' : expected === actual ? 'match' : 'changed' };
  });
  const listed = new Set(manifest.files.map(({ id }) => id));
  for (const [id, actual] of actualHashes) {
    if (!listed.has(id)) rows.push({ id, expected: null, actual, state: 'extra' });
  }
  return {
    version: manifest.version, signatureValid, rows,
    allowed: signatureValid && rows.length > 0 && rows.every(({ state }) => state === 'match'),
  };
}

export const exampleFiles = {
  'update.js': '// Classroom sample for a software update.\n',
  'release.json': '{ "channel": "stable", "build": 42 }\n',
  'readme.txt': 'Version 42 includes interface improvements.\n',
};
