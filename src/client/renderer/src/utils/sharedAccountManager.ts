/**
 * Shared AccountManager singleton — imported by both Login.tsx and App.tsx
 * so the in-memory key cache populated on login is available everywhere.
 */
import * as os from 'os';
import * as path from 'path';
import { AccountManager } from './AccountManager';

export const sharedAccountManager = new AccountManager(
  path.join(os.homedir(), '.kiama', 'accounts')
);
