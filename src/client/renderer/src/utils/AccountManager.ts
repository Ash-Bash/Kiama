/**
 * AccountManager – Client-side local account storage for Kiama.
 *
 * Accounts are stored as AES-256-CBC encrypted JSON files inside
 *   {accountsDir}/{username}.json.enc
 * Media (profile pictures etc.) live alongside them in
 *   {accountsDir}/media/
 *
 * The encryption key is derived from the user's password via scrypt and
 * stored in the OS keychain via `keytar` so it survives app restarts
 * without the user having to re-enter their password every time.
 *
 * Phase 1: local accounts only.
 * Phase 2 (future): cloud accounts + transfer.
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import JSZip from 'jszip';
import type { LocalAccount, ServerList } from '../types/account';

// keytar is a native Electron module; import lazily so unit tests can stub it.
let keytar: typeof import('keytar') | null = null;
try {
  keytar = require('keytar');
} catch {
  console.warn('[AccountManager] keytar not available – keys will be held in memory only.');
}

// ── Constants ──────────────────────────────────────────────────────────────────

const KEYTAR_SERVICE = 'KiamaApp';
const KEYTAR_KEY_ACCOUNT = (username: string) => `key:${username}`;
const ALGORITHM = 'aes-256-cbc' as const;
const KEY_LENGTH = 32; // bytes
const IV_LENGTH = 16;  // bytes
const SALT_ROUNDS_SCRYPT: crypto.ScryptOptions = { N: 16384, r: 8, p: 1 };
const EMPTY_SERVER_LIST: ServerList = { servers: [], folders: [] };

// ── Types ──────────────────────────────────────────────────────────────────────

export interface CreateAccountOptions {
  username: string;
  password: string;
}

export interface LoginResult {
  success: boolean;
  account?: LocalAccount;
  error?: string;
}

// ── AccountManager ─────────────────────────────────────────────────────────────

export class AccountManager {
  private accountsDir: string;
  private mediaDir: string;

  // In-memory key cache (cleared on app close via OS GC).
  private keyCache = new Map<string, Buffer>();

  constructor(accountsDir: string) {
    this.accountsDir = accountsDir;
    this.mediaDir = path.join(accountsDir, 'media');
    this.ensureDirs();
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────────

  private ensureDirs(): void {
    [this.accountsDir, this.mediaDir].forEach(dir => {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    });
  }

  // ── Key management ───────────────────────────────────────────────────────────

  /**
   * Derive an AES key from `password`, optionally persist it in the OS keychain,
   * and cache it in memory for the session.
   * Returns both the key and the salt so the salt can be embedded in the file.
   */
  private async deriveAndStoreKey(username: string, password: string): Promise<{ key: Buffer; salt: Buffer }> {
    const salt = crypto.randomBytes(16);
    const key = await this.scrypt(password, salt);

    // Keytar is optional – the salt is embedded in the file as the primary source of truth.
    if (keytar) {
      try {
        await keytar.setPassword(KEYTAR_SERVICE, KEYTAR_KEY_ACCOUNT(username), [
          salt.toString('hex'),
          key.toString('hex'),
        ].join(':'));
      } catch { /* keytar unavailable – file-embedded salt is the fallback */ }
    }

    this.keyCache.set(username, key);
    return { key, salt };
  }

  /**
   * Retrieve the key for `username` from cache → keychain → throw.
   */
  private async getKey(username: string): Promise<Buffer> {
    const cached = this.keyCache.get(username);
    if (cached) return cached;

    if (keytar) {
      const stored = await keytar.getPassword(KEYTAR_SERVICE, KEYTAR_KEY_ACCOUNT(username));
      if (stored) {
        const [, keyHex] = stored.split(':');
        const key = Buffer.from(keyHex, 'hex');
        this.keyCache.set(username, key);
        return key;
      }
    }

    throw new Error(`No encryption key available for "${username}". Please log in first.`);
  }

  /**
   * Re-encrypt all accounts under a new password (key rotation).
   */
  async rotateKey(username: string, oldPassword: string, newPassword: string): Promise<void> {
    const loginResult = await this.login(username, oldPassword);
    if (!loginResult.success || !loginResult.account) {
      throw new Error('Rotation failed: invalid old password.');
    }
    const { key, salt } = await this.deriveAndStoreKey(username, newPassword);
    loginResult.account.updatedAt = new Date().toISOString();
    await this.saveAccountWithKey(loginResult.account, key, salt);
  }

  private scrypt(password: string, salt: Buffer): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      crypto.scrypt(password, salt, KEY_LENGTH, SALT_ROUNDS_SCRYPT, (err, key) => {
        if (err) reject(err);
        else resolve(key as Buffer);
      });
    });
  }

  // ── Encryption helpers ───────────────────────────────────────────────────────

  private encrypt(data: string, key: Buffer): string {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([cipher.update(data, 'utf8'), cipher.final()]);
    // Format: <iv-hex>:<ciphertext-hex>
    return `${iv.toString('hex')}:${encrypted.toString('hex')}`;
  }

  private decrypt(payload: string, key: Buffer): string {
    const [ivHex, cipherHex] = payload.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const ciphertext = Buffer.from(cipherHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  }

  // ── File paths ───────────────────────────────────────────────────────────────

  private encFilePath(username: string): string {
    return path.join(this.accountsDir, `${username}.json.enc`);
  }

  // ── CRUD ─────────────────────────────────────────────────────────────────────

  /**
   * Create a new local account and persist it encrypted to disk.
   */
  async createAccount({ username, password }: CreateAccountOptions): Promise<LocalAccount> {
    if (fs.existsSync(this.encFilePath(username))) {
      throw new Error(`Account "${username}" already exists.`);
    }

    const { key, salt } = await this.deriveAndStoreKey(username, password);

    const now = new Date().toISOString();
    const account: LocalAccount = {
      id: uuidv4(),
      username,
      passwordHash: await this.hashPassword(password),
      serverNicknames: {},
      serverProfilePics: {},
      credentials: {},
      serverList: { ...EMPTY_SERVER_LIST, servers: [], folders: [] },
      isBot: false,
      isServerCreated: false,
      createdAt: now,
      updatedAt: now,
    };

    await this.saveAccountWithKey(account, key, salt);

    // Set restrictive permissions (owner read/write only).
    try {
      fs.chmodSync(this.encFilePath(username), 0o600);
    } catch { /* Windows does not support Unix permissions */ }

    return account;
  }

  /**
   * Return the per-server nickname for `username` on `serverId`, or undefined.
   */
  async getServerNickname(username: string, serverId: string): Promise<string | undefined> {
    const account = await this.loadAccount(username);
    return account.serverNicknames ? account.serverNicknames[serverId] : undefined;
  }

  /**
   * Set or clear the per-server nickname for `username` on `serverId`.
   */
  async setServerNickname(username: string, serverId: string, nickname?: string): Promise<void> {
    const account = await this.loadAccount(username);
    account.serverNicknames = account.serverNicknames ?? {};
    if (!nickname) {
      delete account.serverNicknames[serverId];
    } else {
      account.serverNicknames[serverId] = nickname;
    }
    account.updatedAt = new Date().toISOString();
    await this.saveAccount(account);
  }

  /**
   * Return the per-server profile picture filename for `username` on `serverId`, or undefined.
   */
  async getServerProfilePic(username: string, serverId: string): Promise<string | undefined> {
    const account = await this.loadAccount(username);
    return account.serverProfilePics?.[serverId];
  }

  /**
   * Set or clear a per-server profile picture from a data URI.
   * Returns the absolute file path on set, or undefined on clear.
   */
  async setServerProfilePic(username: string, serverId: string, dataUri?: string): Promise<string | undefined> {
    const account = await this.loadAccount(username);
    account.serverProfilePics = account.serverProfilePics ?? {};

    if (!dataUri) {
      const oldFile = account.serverProfilePics[serverId];
      if (oldFile) {
        const oldPath = path.join(this.mediaDir, oldFile);
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }
      delete account.serverProfilePics[serverId];
      await this.saveAccount(account);
      return undefined;
    }

    const match = dataUri.match(/^data:image\/(\w[\w+.-]*);base64,(.+)$/s);
    if (!match) throw new Error('Invalid image data URI.');
    const [, rawExt, base64] = match;
    const ext = rawExt === 'jpeg' ? 'jpg' : rawExt.toLowerCase().replace(/[+.].*/, '');
    const filename = `avatar-${username}-${serverId}.${ext}`;
    const filePath = path.join(this.mediaDir, filename);
    fs.writeFileSync(filePath, Buffer.from(base64, 'base64'));

    account.serverProfilePics[serverId] = filename;
    await this.saveAccount(account);
    return filePath;
  }

  /**
   * Resolve the effective profile picture for a given server context.
   * Per-server override wins; falls back to the global avatar.
   * Returns the absolute file path, or undefined if no avatar is set.
   */
  async getEffectiveProfilePic(username: string, serverId?: string): Promise<string | undefined> {
    const account = await this.loadAccount(username);
    const filename = (serverId && account.serverProfilePics?.[serverId]) || account.profilePic;
    return filename ? path.join(this.mediaDir, filename) : undefined;
  }

  /**
   * Verify password and return the decrypted account on success.
   * The scrypt salt is read directly from the file header so this works
   * even when keytar is unavailable.
   */
  async login(username: string, password: string): Promise<LoginResult> {
    const filePath = this.encFilePath(username);
    if (!fs.existsSync(filePath)) {
      return { success: false, error: 'Account not found.' };
    }

    try {
      const raw = fs.readFileSync(filePath, 'utf8').trim();
      const parts = raw.split(':');

      let key: Buffer;

      if (parts.length >= 3) {
        // New format: {saltHex}:{ivHex}:{cipherHex} – salt is embedded in the file.
        key = await this.scrypt(password, Buffer.from(parts[0], 'hex'));
      } else if (keytar) {
        // Legacy format: fall back to keytar.
        const stored = await keytar.getPassword(KEYTAR_SERVICE, KEYTAR_KEY_ACCOUNT(username));
        if (stored) {
          const [saltHex, keyHex] = stored.split(':');
          key = await this.scrypt(password, Buffer.from(saltHex, 'hex'));
          if (key.toString('hex') !== keyHex) {
            return { success: false, error: 'Invalid password.' };
          }
        } else {
          key = await this.scrypt(password, Buffer.alloc(16));
        }
      } else {
        key = await this.scrypt(password, Buffer.alloc(16));
      }

      this.keyCache.set(username, key);
      const account = await this.loadAccountRaw(raw, key);
      return { success: true, account };
    } catch {
      return { success: false, error: 'Invalid password.' };
    }
  }

  /**
   * Load a previously unlocked account (key must already be cached).
   */
  async loadAccount(username: string): Promise<LocalAccount> {
    const key = await this.getKey(username);
    return this.loadAccountWithKey(username, key);
  }

  /**
   * Persist changes to an account (key must already be cached).
   * Preserves the salt already embedded in the file.
   */
  async saveAccount(account: LocalAccount): Promise<void> {
    const key = await this.getKey(account.username);
    account.updatedAt = new Date().toISOString();
    const salt = this.readEmbeddedSalt(account.username);
    await this.saveAccountWithKey(account, key, salt ?? undefined);
  }

  /** Read the salt embedded in the file header, or null for legacy files. */
  private readEmbeddedSalt(username: string): Buffer | null {
    const filePath = this.encFilePath(username);
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, 'utf8').trim();
    const parts = raw.split(':');
    return parts.length >= 3 ? Buffer.from(parts[0], 'hex') : null;
  }

  /**
   * Permanently delete a local account and its media.
   */
  deleteAccount(username: string): void {
    const filePath = this.encFilePath(username);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    this.keyCache.delete(username);
    // Optionally remove from keychain.
    if (keytar) keytar.deletePassword(KEYTAR_SERVICE, KEYTAR_KEY_ACCOUNT(username)).catch(() => {});
  }

  /**
   * List usernames for accounts stored on disk.
   */
  listAccounts(): string[] {
    return fs.readdirSync(this.accountsDir)
      .filter(f => f.endsWith('.json.enc'))
      .map(f => f.replace('.json.enc', ''));
  }

  // ── Profile picture ──────────────────────────────────────────────────────────

  /**
   * Returns the absolute path to a file inside the account media directory.
   * Safe to call without a cached key — no async / no decryption needed.
   */
  getMediaFilePath(filename: string): string {
    return path.join(this.mediaDir, filename);
  }

  /**
   * Save a profile picture from a data URI (e.g. FileReader result),
   * persist the filename inside the encrypted account file, and return
   * the absolute path so the renderer can use it immediately as an img src.
   */
  async saveProfilePic(username: string, dataUri: string): Promise<string> {
    const match = dataUri.match(/^data:image\/(\w[\w+.-]*);base64,(.+)$/s);
    if (!match) throw new Error('Invalid image data URI.');
    const [, rawExt, base64] = match;
    const ext = rawExt === 'jpeg' ? 'jpg' : rawExt.toLowerCase().replace(/[+.].*/, '');
    const filename = `avatar-${username}.${ext}`;
    const filePath = path.join(this.mediaDir, filename);
    fs.writeFileSync(filePath, Buffer.from(base64, 'base64'));
    const account = await this.loadAccount(username);
    account.profilePic = filename;
    await this.saveAccount(account);
    return filePath;
  }

  /**
   * Save a server icon from a data URI, write it to the media directory, and
   * return the absolute path so the renderer can use it immediately as an img src.
   * The filename is deterministic (`server-icon-{serverId}.{ext}`) so repeated
   * saves for the same server overwrite the previous file.
   */
  async saveServerIcon(serverId: string, dataUri: string): Promise<string> {
    const match = dataUri.match(/^data:image\/(\w[\w+.-]*);base64,(.+)$/s);
    if (!match) throw new Error('Invalid image data URI.');
    const [, rawExt, base64] = match;
    const ext = rawExt === 'jpeg' ? 'jpg' : rawExt.toLowerCase().replace(/[+.].*/, '');
    const filename = `server-icon-${serverId}.${ext}`;
    const filePath = path.join(this.mediaDir, filename);
    fs.writeFileSync(filePath, Buffer.from(base64, 'base64'));
    return filePath;
  }

  /**
   * Replace the full server list for an account and persist it.
   * Pass all non-home servers — this overwrites the stored list completely.
   */
  async updateServerList(
    username: string,
    updatedServers: Array<{ id: string; name: string; url: string; icon?: string }>
  ): Promise<void> {
    const account = await this.loadAccount(username);
    // Merge incoming entries with existing ones so icon filenames are preserved
    const existingMap = new Map(account.serverList.servers.map(s => [s.id, s]));
    account.serverList.servers = updatedServers.map(s => ({
      ...existingMap.get(s.id),
      ...s,
      // Keep stored icon filename if no new one supplied
      icon: s.icon ?? existingMap.get(s.id)?.icon
    }));
    account.updatedAt = new Date().toISOString();
    await this.saveAccount(account);
  }

  // ── Internal save/load ───────────────────────────────────────────────────────

  private async saveAccountWithKey(account: LocalAccount, key: Buffer, salt?: Buffer): Promise<void> {
    const json = JSON.stringify(account, null, 2);
    const encrypted = this.encrypt(json, key); // {ivHex}:{cipherHex}
    // Embed the salt so login never needs keytar: {saltHex}:{ivHex}:{cipherHex}
    const content = salt ? `${salt.toString('hex')}:${encrypted}` : encrypted;
    fs.writeFileSync(this.encFilePath(account.username), content, 'utf8');
  }

  private async loadAccountWithKey(username: string, key: Buffer): Promise<LocalAccount> {
    const raw = fs.readFileSync(this.encFilePath(username), 'utf8').trim();
    return this.loadAccountRaw(raw, key);
  }

  /** Decrypt `raw` file content (handles both old 2-part and new 3-part formats). */
  private loadAccountRaw(raw: string, key: Buffer): LocalAccount {
    const parts = raw.split(':');
    // New format: {saltHex}:{ivHex}:{cipherHex} — skip part[0] (the salt)
    const payload = parts.length >= 3 ? parts.slice(1).join(':') : raw;
    const json = this.decrypt(payload, key);
    return JSON.parse(json) as LocalAccount;
  }

  // ── ZIP backup ───────────────────────────────────────────────────────────────

  /**
   * Export an account and its media to a plain ZIP file.
   * The account JSON inside the ZIP is in plain text (the .json.enc file on
   * disk is encrypted, but the export is readable since the user chose to export).
   */
  async exportToZip(username: string): Promise<Buffer> {
    const account = await this.loadAccount(username);
    const zip = new JSZip();

    // Account JSON (plain – user is intentionally exporting).
    zip.file('account.json', JSON.stringify(account, null, 2));

    // Profile picture if present.
    if (account.profilePic) {
      const picPath = path.join(this.mediaDir, account.profilePic);
      if (fs.existsSync(picPath)) {
        zip.file(`media/${account.profilePic}`, fs.readFileSync(picPath));
      }
    }

    // Per-server profile pictures if present.
    if (account.serverProfilePics) {
      for (const filename of Object.values(account.serverProfilePics)) {
        const picPath = path.join(this.mediaDir, filename);
        if (fs.existsSync(picPath)) {
          zip.file(`media/${filename}`, fs.readFileSync(picPath));
        }
      }
    }

    return zip.generateAsync({ type: 'nodebuffer' });
  }

  /**
   * Import an account from a ZIP previously exported with `exportToZip`.
   * The account is re-encrypted with a new key derived from `newPassword`.
   */
  async importFromZip(zipBuffer: Buffer, newPassword: string): Promise<LocalAccount> {
    const zip = await JSZip.loadAsync(zipBuffer);

    const accountFile = zip.file('account.json');
    if (!accountFile) throw new Error('Invalid backup: account.json not found.');

    const json = await accountFile.async('string');
    const imported = JSON.parse(json) as LocalAccount;

    // Re-derive and store a fresh key.
    const { key, salt } = await this.deriveAndStoreKey(imported.username, newPassword);

    // Extract media.
    const mediaFiles = Object.keys(zip.files).filter(f => f.startsWith('media/') && !zip.files[f].dir);
    for (const mediaPath of mediaFiles) {
      const filename = path.basename(mediaPath);
      const data = await zip.files[mediaPath].async('nodebuffer');
      fs.writeFileSync(path.join(this.mediaDir, filename), data);
    }

    // Save with the new key and embedded salt.
    await this.saveAccountWithKey(imported, key, salt);

    this.keyCache.set(imported.username, key);
    return imported;
  }

  // ── Password helpers ─────────────────────────────────────────────────────────

  private hashPassword(password: string): Promise<string> {
    return new Promise((resolve, reject) => {
      // Use Node's crypto for a simple PBKDF2 hash – bcrypt requires a native addon.
      crypto.pbkdf2(password, 'kiama-salt', 100_000, 32, 'sha256', (err, buf) => {
        if (err) reject(err);
        else resolve(buf.toString('hex'));
      });
    });
  }
}
