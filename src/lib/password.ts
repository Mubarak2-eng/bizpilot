import bcrypt from "bcryptjs";

const SALT_ROUNDS = 10;

/**
 * Hashes a plaintext password using bcrypt.
 * Never store plaintext passwords in the database.
 */
export async function hashPassword(password: string): Promise<string> {
  if (!password || password.length < 6) {
    throw new Error("Password must be at least 6 characters long");
  }
  return bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Verifies a plaintext password against a bcrypt hash.
 */
export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  if (!password || !hash) {
    return false;
  }
  return bcrypt.compare(password, hash);
}
