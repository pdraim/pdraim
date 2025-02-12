import crypto from 'crypto';

/**
 * Securely hashes a password using PBKDF2 with a random salt.
 * @param password The plain text password to hash
 * @returns A promise that resolves to the hashed password in the format 'salt:hash'
 */
export async function hashPassword(password: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const salt = crypto.randomBytes(16).toString('hex');
        crypto.pbkdf2(password, salt, 100000, 64, 'sha512', (err, derivedKey) => {
            if (err) return reject(err);
            resolve(`${salt}:${derivedKey.toString('hex')}`);
        });
    });
}

/**
 * Verify a password hash created by hashPassword()
 * @param password The plain text password to verify
 * @param hash The hashed password to verify against
 * @returns A promise that resolves to true if the password matches, false otherwise
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
        const [salt, key] = hash.split(':');
        crypto.pbkdf2(password, salt, 100000, 64, 'sha512', (err, derivedKey) => {
            if (err) return reject(err);
            resolve(key === derivedKey.toString('hex'));
        });
    });
} 