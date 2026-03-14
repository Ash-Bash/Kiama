/**
 * BotAccountManager – Server-side bot/owner-created account storage for Kiama.
 *
 * Bot accounts are the ONLY accounts stored on the server.
 * Regular user (local) accounts never leave the client.
 *
 * Accounts are written as AES-256-CBC encrypted JSON files:
 *   {dataRoot}/accounts/{username}.json.enc
 *
 * The encryption key is derived from KIAMA_ACCOUNT_SECRET (env var) via scrypt.
 * This integrates with the existing BackupManager so bot accounts are included
 * in scheduled server backups automatically.
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

// ── Shared types (mirrored from client types/account.ts) ──────────────────────

export interface ServerEntry {
  id: string;
  name: string;
  icon?: string;
  url: string;
}

export interface ServerFolder {
  id: string;
  name: string;
  servers: ServerEntry[];
}

export interface ServerList {
  servers: ServerEntry[];
  folders: ServerFolder[];
}

export interface BotAccount {
  id: string;
  username: string;
  passwordHash: string;
  botType: 'chat' | 'moderator' | 'custom';
  isBot: true;
  isServerCreated: true;
  linkedPlugin?: string;
  preconfig: {
    chatStyle?: string;
    autoJoinServers?: string[];
    [key: string]: unknown;
  };
  serverList: ServerList;
  createdAt: string;
  updatedAt: string;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const ALGORITHM = 'aes-256-cbc' as const;
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const ACCOUNTS_DIRNAME = 'accounts';
const EMPTY_SERVER_LIST: ServerList = { servers: [], folders: [] };

// ── BotAccountManager ──────────────────────────────────────────────────────────

export class BotAccountManager {
  private accountsDir: string;
  private key: Buffer;

  constructor(dataRoot: string) {
    this.accountsDir = path.join(dataRoot, ACCOUNTS_DIRNAME);
    this.key = this.deriveKey();
    this.ensureDir();
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────────

  private ensureDir(): void {
    if (!fs.existsSync(this.accountsDir)) {
      fs.mkdirSync(this.accountsDir, { recursive: true });
    }
  }

  private deriveKey(): Buffer {
    const secret = process.env.KIAMA_ACCOUNT_SECRET || 'kiama-default-secret-change-me';
    const salt = process.env.KIAMA_ACCOUNT_SALT || 'kiama-default-salt';
    return crypto.scryptSync(secret, salt, KEY_LENGTH) as Buffer;
  }

  // ── Encryption helpers ───────────────────────────────────────────────────────

  private encrypt(data: string): string {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, this.key, iv);
    const encrypted = Buffer.concat([cipher.update(data, 'utf8'), cipher.final()]);
    return `${iv.toString('hex')}:${encrypted.toString('hex')}`;
  }

  private decrypt(payload: string): string {
    const [ivHex, cipherHex] = payload.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const ciphertext = Buffer.from(cipherHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, this.key, iv);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  }

  // ── File paths ───────────────────────────────────────────────────────────────

  private encFilePath(username: string): string {
    return path.join(this.accountsDir, `${username}.json.enc`);
  }

  // ── CRUD ─────────────────────────────────────────────────────────────────────

  /**
   * Create a new bot account, optionally linked to a plugin.
   */
  createBotAccount(options: {
    username: string;
    passwordHash: string;
    botType: BotAccount['botType'];
    linkedPlugin?: string;
    preconfig?: BotAccount['preconfig'];
  }): BotAccount {
    if (fs.existsSync(this.encFilePath(options.username))) {
      throw new Error(`Bot account "${options.username}" already exists.`);
    }

    const now = new Date().toISOString();
    const autoServers = options.preconfig?.autoJoinServers ?? [];

    const account: BotAccount = {
      id: uuidv4(),
      username: options.username,
      passwordHash: options.passwordHash,
      botType: options.botType,
      isBot: true,
      isServerCreated: true,
      linkedPlugin: options.linkedPlugin,
      preconfig: options.preconfig ?? {},
      serverList: autoServers.length
        ? {
            servers: autoServers.map(id => ({ id, name: 'Auto-Joined', url: '' })),
            folders: [],
          }
        : { ...EMPTY_SERVER_LIST },
      createdAt: now,
      updatedAt: now,
    };

    this.save(account);
    return account;
  }

  /**
   * Load a bot account by username.
   */
  load(username: string): BotAccount | null {
    const filePath = this.encFilePath(username);
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(this.decrypt(raw)) as BotAccount;
  }

  /**
   * Persist changes to an existing bot account.
   */
  save(account: BotAccount): void {
    account.updatedAt = new Date().toISOString();
    const encrypted = this.encrypt(JSON.stringify(account, null, 2));
    fs.writeFileSync(this.encFilePath(account.username), encrypted, 'utf8');
    try {
      fs.chmodSync(this.encFilePath(account.username), 0o600);
    } catch { /* Windows */ }
  }

  /**
   * Delete a bot account.
   */
  delete(username: string): boolean {
    const filePath = this.encFilePath(username);
    if (!fs.existsSync(filePath)) return false;
    fs.unlinkSync(filePath);
    return true;
  }

  /**
   * Rename a bot account (change username). Deletes old file & saves under new name.
   * Returns the updated account, or null if the old account doesn't exist.
   */
  rename(oldUsername: string, newUsername: string): BotAccount | null {
    const account = this.load(oldUsername);
    if (!account) return null;
    if (fs.existsSync(this.encFilePath(newUsername))) {
      throw new Error(`Bot account "${newUsername}" already exists.`);
    }
    this.delete(oldUsername);
    account.username = newUsername;
    this.save(account);
    return account;
  }

  /**
   * List all bot account usernames stored on disk.
   */
  list(): string[] {
    return fs.readdirSync(this.accountsDir)
      .filter(f => f.endsWith('.json.enc'))
      .map(f => f.replace('.json.enc', ''));
  }

  /**
   * List all bot accounts as full objects.
   */
  listAll(): BotAccount[] {
    return this.list()
      .map(username => this.load(username))
      .filter((a): a is BotAccount => a !== null);
  }

  /**
   * Verify a bot account's password hash.
   */
  verifyPassword(username: string, candidateHash: string): boolean {
    const account = this.load(username);
    return account !== null && account.passwordHash === candidateHash;
  }
}
