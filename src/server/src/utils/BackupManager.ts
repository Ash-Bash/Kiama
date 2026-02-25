import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import archiver from 'archiver';
import * as unzipper from 'unzipper';

export type BackupSchedule = 'manual' | 'daily' | 'weekly' | 'monthly';

export interface BackupEntry {
  filename: string;
  createdAt: string; // ISO string
  sizeBytes: number;
  checksum: string; // SHA-256 of zip
}

export interface BackupConfig {
  schedule: BackupSchedule;
  lastBackupAt?: string; // ISO string
  maxBackups?: number; // 0 = unlimited
}

const BACKUP_CONFIG_FILE = 'backup-config.json';
const BACKUPS_FOLDER = 'Backups';

// Schedules in milliseconds (approximate)
const SCHEDULE_MS: Record<BackupSchedule, number> = {
  manual: 0,
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
  monthly: 30 * 24 * 60 * 60 * 1000
};

export class BackupManager {
  private dataRoot: string;
  private serverName: string;
  private backupsDir: string;
  private configFilePath: string;
  private backupConfig: BackupConfig;
  private scheduleTimer: NodeJS.Timeout | null = null;

  constructor(dataRoot: string, serverName: string) {
    this.dataRoot = dataRoot;
    this.serverName = serverName;
    this.backupsDir = path.join(dataRoot, BACKUPS_FOLDER);
    this.configFilePath = path.join(dataRoot, BACKUP_CONFIG_FILE);

    this.ensureBackupsDir();
    this.backupConfig = this.loadConfig();
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  private ensureBackupsDir() {
    if (!fs.existsSync(this.backupsDir)) {
      fs.mkdirSync(this.backupsDir, { recursive: true });
    }
  }

  private loadConfig(): BackupConfig {
    if (fs.existsSync(this.configFilePath)) {
      try {
        const raw = fs.readFileSync(this.configFilePath, 'utf-8');
        return JSON.parse(raw) as BackupConfig;
      } catch {
        // fallback to defaults
      }
    }
    return { schedule: 'manual', maxBackups: 10 };
  }

  private saveConfig() {
    fs.writeFileSync(this.configFilePath, JSON.stringify(this.backupConfig, null, 2), { mode: 0o600 });
  }

  private sanitizeServerName(name: string): string {
    return name.replace(/[^a-zA-Z0-9_\-]/g, '_').replace(/_{2,}/g, '_');
  }

  private buildZipFilename(): string {
    const safeName = this.sanitizeServerName(this.serverName);
    const now = new Date();
    const dateStr = now.toISOString()
      .replace(/:/g, '-')
      .replace(/\..+/, '')
      .replace('T', '_');
    return `${safeName}_Backup_${dateStr}.zip`;
  }

  private fileChecksum(filePath: string): string {
    const buf = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(buf).digest('hex');
  }

  /** Add all files under dataRoot into the archive, excluding the Backups folder itself. */
  private addDirectoryToArchive(archive: archiver.Archiver, dir: string, archivePrefix: string) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const archivePath = path.join(archivePrefix, entry.name);

      // Skip the Backups folder to avoid recursive backups
      if (entry.isDirectory() && entry.name === BACKUPS_FOLDER && dir === this.dataRoot) {
        continue;
      }
      // Skip the backup config file (it's managed separately)
      if (!entry.isDirectory() && entry.name === BACKUP_CONFIG_FILE && dir === this.dataRoot) {
        continue;
      }

      if (entry.isDirectory()) {
        this.addDirectoryToArchive(archive, fullPath, archivePath);
      } else {
        archive.file(fullPath, { name: archivePath });
      }
    }
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /** Get the current backup configuration. */
  getConfig(): BackupConfig {
    return { ...this.backupConfig };
  }

  /** Update schedule (and optionally maxBackups). Restarts the internal timer. */
  setConfig(update: Partial<BackupConfig>) {
    this.backupConfig = { ...this.backupConfig, ...update };
    this.saveConfig();
    this.restartScheduler();
  }

  /** List all backup entries in chronological order (oldest first). */
  listBackups(): BackupEntry[] {
    this.ensureBackupsDir();
    const files = fs.readdirSync(this.backupsDir).filter(f => f.endsWith('.zip'));
    const entries: BackupEntry[] = [];

    for (const file of files) {
      const fullPath = path.join(this.backupsDir, file);
      try {
        const stat = fs.statSync(fullPath);
        const checksum = this.fileChecksum(fullPath);
        entries.push({
          filename: file,
          createdAt: stat.birthtime.toISOString(),
          sizeBytes: stat.size,
          checksum
        });
      } catch {
        // Skip unreadable files
      }
    }

    // Sort by creation time, oldest first
    entries.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    return entries;
  }

  /** Create a backup zip of dataRoot (excluding Backups folder). Returns the new entry. */
  createBackup(): Promise<BackupEntry> {
    return new Promise((resolve, reject) => {
      this.ensureBackupsDir();

      const filename = this.buildZipFilename();
      const destPath = path.join(this.backupsDir, filename);
      const output = fs.createWriteStream(destPath);

      const archive = archiver('zip', { zlib: { level: 9 } });

      output.on('close', () => {
        try {
          const stat = fs.statSync(destPath);
          const checksum = this.fileChecksum(destPath);

          // Update last backup time
          this.backupConfig.lastBackupAt = new Date().toISOString();
          this.saveConfig();

          const entry: BackupEntry = {
            filename,
            createdAt: new Date().toISOString(),
            sizeBytes: stat.size,
            checksum
          };

          // Prune old backups if maxBackups is set
          this.pruneOldBackups();

          resolve(entry);
        } catch (err) {
          reject(err);
        }
      });

      archive.on('error', (err) => {
        reject(err);
      });

      archive.pipe(output);

      // Add everything in dataRoot except the Backups folder
      this.addDirectoryToArchive(archive, this.dataRoot, 'data');

      archive.finalize();
    });
  }

  /** Delete a named backup zip file. */
  deleteBackup(filename: string): boolean {
    // Safety: only allow filenames, not path traversal
    if (filename.includes('/') || filename.includes('..') || !filename.endsWith('.zip')) {
      return false;
    }
    const fullPath = path.join(this.backupsDir, filename);
    if (!fs.existsSync(fullPath)) return false;
    fs.unlinkSync(fullPath);
    return true;
  }

  /** Restore from a named backup zip. Extracts into dataRoot (excluding the Backups folder). */
  restoreBackup(filename: string): Promise<void> {
    if (filename.includes('/') || filename.includes('..') || !filename.endsWith('.zip')) {
      return Promise.reject(new Error('Invalid filename'));
    }
    const fullPath = path.join(this.backupsDir, filename);
    if (!fs.existsSync(fullPath)) {
      return Promise.reject(new Error('Backup not found'));
    }

    return new Promise((resolve, reject) => {
      fs.createReadStream(fullPath)
        .pipe(unzipper.Parse())
        .on('entry', (entry: unzipper.Entry) => {
          const entryPath: string = (entry as any).path;
          // Strip leading 'data/' prefix if present
          const relativePath = entryPath.startsWith('data/') ? entryPath.slice(5) : entryPath;
          // Never extract over the Backups folder
          if (relativePath.startsWith(BACKUPS_FOLDER)) {
            entry.autodrain();
            return;
          }
          const destPath = path.join(this.dataRoot, relativePath);
          const destDir = path.dirname(destPath);
          if (!fs.existsSync(destDir)) {
            fs.mkdirSync(destDir, { recursive: true });
          }
          entry.pipe(fs.createWriteStream(destPath));
        })
        .on('finish', resolve)
        .on('error', reject);
    });
  }

  /** Remove oldest backups when count exceeds maxBackups. */
  private pruneOldBackups() {
    const max = this.backupConfig.maxBackups ?? 10;
    if (max <= 0) return; // 0 = unlimited

    const backups = this.listBackups(); // already sorted oldest first
    if (backups.length > max) {
      const toDelete = backups.slice(0, backups.length - max);
      for (const entry of toDelete) {
        this.deleteBackup(entry.filename);
      }
    }
  }

  /** Start the automatic backup scheduler based on the current config. */
  startScheduler() {
    this.stopScheduler();
    const intervalMs = SCHEDULE_MS[this.backupConfig.schedule];
    if (intervalMs === 0) return; // manual only

    // Check if an initial backup is overdue
    if (this.backupConfig.lastBackupAt) {
      const lastMs = new Date(this.backupConfig.lastBackupAt).getTime();
      const overdueMs = Date.now() - lastMs;
      if (overdueMs >= intervalMs) {
        console.log('[BackupManager] Scheduled backup is overdue — running immediately.');
        this.createBackup().catch(err => console.error('[BackupManager] Scheduled backup failed:', err));
      }
    }

    this.scheduleTimer = setInterval(() => {
      console.log(`[BackupManager] Running scheduled ${this.backupConfig.schedule} backup.`);
      this.createBackup().catch(err => console.error('[BackupManager] Scheduled backup failed:', err));
    }, intervalMs);

    console.log(`[BackupManager] Scheduler started: ${this.backupConfig.schedule} (every ${intervalMs / 1000}s)`);
  }

  stopScheduler() {
    if (this.scheduleTimer) {
      clearInterval(this.scheduleTimer);
      this.scheduleTimer = null;
    }
  }

  private restartScheduler() {
    this.stopScheduler();
    this.startScheduler();
  }

  /** Update the server name (e.g. if renamed). */
  setServerName(name: string) {
    this.serverName = name;
  }
}
