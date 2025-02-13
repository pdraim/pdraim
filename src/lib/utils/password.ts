/* Removed Node's crypto import. Using Web Crypto API instead */

/**
 * Helper function that converts an ArrayBuffer to a hex string.
 */
function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Helper function that converts a hex string to a Uint8Array.
 */
function hexToBuffer(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) {
    throw new Error('Invalid hex string');
  }
  const arr = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    arr[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return arr;
}

/**
 * Derives a password hash using PBKDF2 with the provided salt.
 * @param password The plain text password.
 * @param salt Uint8Array salt.
 * @returns The derived key in hex format.
 */
async function derivePasswordHash(password: string, salt: Uint8Array): Promise<string> {
  const enc = new TextEncoder();
  const keyMaterial = enc.encode(password);
  console.debug("$state: Key material for password derivation", keyMaterial);
  const key = await crypto.subtle.importKey(
    "raw",
    keyMaterial,
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: salt,
      iterations: 100000,
      hash: "SHA-512"
    },
    key,
    512
  );
  console.debug("$state: Derived bits", derivedBits);
  return bufferToHex(derivedBits);
}

/**
 * Securely hashes a password using PBKDF2 with a random salt.
 * @param password The plain text password to hash.
 * @returns A promise that resolves to the hashed password in the format 'salt:hash'.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  console.debug("$state: Generated salt", salt);
  const saltHex = bufferToHex(salt.buffer);
  const hash = await derivePasswordHash(password, salt);
  return `${saltHex}:${hash}`;
}

/**
 * Verify a password hash created by hashPassword().
 * @param password The plain text password to verify.
 * @param hash The hashed password to verify against in format 'salt:hash'.
 * @returns A promise that resolves to true if the password matches, false otherwise.
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const [saltHex, hashValue] = hash.split(':');
  const salt = hexToBuffer(saltHex);
  console.debug("$state: Salt extracted from stored hash", salt);
  const derivedHash = await derivePasswordHash(password, salt);
  console.debug("$state: Derived hash for verification", derivedHash);
  return derivedHash === hashValue;
} 