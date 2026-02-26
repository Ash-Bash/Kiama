import fs from 'fs';
import path from 'path';
import { Command } from 'commander';
import { Server, InitialServerConfig } from './server';

// CLI entry point for starting the KIAMA server and querying stats.
const program = new Command();

program
  .name('kiama-server')
  .description('KIAMA decentralized chat server')
  .version('1.0.0');

program
  .command('start')
  .description('Start the server')
  .option('-p, --port <port>', 'Port to listen on', '3000')
  .option('--public', 'Make server public')
  .option('--private', 'Make server private')
  .option('--token <token>', 'Admin token used to protect management endpoints (falls back to KIAMA_ADMIN_TOKEN env)')
  .option('--config <path>', 'Path to an initial server configuration JSON file')
  .option('--owner <username>', 'Username of the account that owns this server (grants full admin role to that user)')
  .action((options) => {
    const port = Number.parseInt(options.port, 10) || 3000;
    const adminToken = options.token || process.env.KIAMA_ADMIN_TOKEN || '';
    const resolvedConfigPath = options.config
      ? (path.isAbsolute(options.config) ? options.config : path.join(process.cwd(), options.config))
      : undefined;
    let config = resolvedConfigPath ? loadConfig(resolvedConfigPath) : undefined;

    // Merge --owner flag into the config so it takes precedence over any value
    // that may already be stored in the config file.
    if (options.owner) {
      config = { ...(config || { name: 'KIAMA Server' }), ownerUsername: options.owner };
    }

    const server = new Server(port, options.public ? 'public' : 'private', undefined, adminToken, config, resolvedConfigPath);
    server.start();

    if (!adminToken) {
      console.warn('Admin token not provided; management CLI commands will be rejected.');
    }
    if (options.owner) {
      console.log(`Server owner set to: ${options.owner}`);
    }
  });

program
  .command('stats')
  .description('Show server system statistics')
  .option('-p, --port <port>', 'Server port to query', '3000')
  .option('-H, --host <host>', 'Server host', 'http://localhost')
  .action(async (options) => {
    const url = `${options.host}:${options.port}/system/stats`;

    try {
      const response = await fetch(url);
      if (!response.ok) {
        console.error(`Failed to fetch stats: ${response.status} ${response.statusText}`);
        return;
      }

      const stats = await response.json();
      displaySystemStats(stats);
    } catch (error) {
      console.error('Error fetching system stats:', error instanceof Error ? error.message : String(error));
      console.log('Make sure the server is running and accessible.');
    }
  });

program
  .command('notify')
  .description('Send a broadcast notification to connected clients')
  .requiredOption('-m, --message <message>', 'Message to broadcast')
  .option('--type <type>', 'Notification type label', 'maintenance')
  .option('-c, --channel <channel...>', 'Channel IDs to target (defaults to all channels)')
  .option('-p, --port <port>', 'Server port to query', '3000')
  .option('-H, --host <host>', 'Server host', 'http://localhost')
  .option('-t, --token <token>', 'Admin token (falls back to KIAMA_ADMIN_TOKEN env)')
  .action(async (options) => {
    const token = resolveAdminToken(options.token);
    await callAdminEndpoint({
      host: options.host,
      port: options.port,
      token,
      path: '/admin/notify',
      body: { message: options.message, type: options.type, channelIds: options.channel }
    });
  });

program
  .command('stop')
  .description('Gracefully stop the running server via the management API')
  .option('-m, --message <message>', 'Notify users before shutdown')
  .option('-p, --port <port>', 'Server port to query', '3000')
  .option('-H, --host <host>', 'Server host', 'http://localhost')
  .option('-t, --token <token>', 'Admin token (falls back to KIAMA_ADMIN_TOKEN env)')
  .action(async (options) => {
    const token = resolveAdminToken(options.token);
    await callAdminEndpoint({
      host: options.host,
      port: options.port,
      token,
      path: '/admin/shutdown',
      body: { message: options.message }
    });
  });

program
  .command('restart')
  .description('Gracefully restart the running server (requires a process manager to bring it back up)')
  .option('-m, --message <message>', 'Notify users before restart')
  .option('-d, --delay <ms>', 'Delay in milliseconds before restart', '1000')
  .option('-p, --port <port>', 'Server port to query', '3000')
  .option('-H, --host <host>', 'Server host', 'http://localhost')
  .option('-t, --token <token>', 'Admin token (falls back to KIAMA_ADMIN_TOKEN env)')
  .action(async (options) => {
    const token = resolveAdminToken(options.token);
    await callAdminEndpoint({
      host: options.host,
      port: options.port,
      token,
      path: '/admin/restart',
      body: { message: options.message, delayMs: Number.parseInt(options.delay, 10) || 1000 }
    });
  });

program
  .command('init-config')
  .description('Generate an initial server configuration file with channels, sections, and roles')
  .option('-n, --name <name>', 'Server name', 'KIAMA Server')
  .option('-o, --output <path>', 'Output file path', 'server.config.json')
  .action((options) => {
    const outputPath = path.isAbsolute(options.output)
      ? options.output
      : path.join(__dirname, options.output);

    const template: InitialServerConfig = {
      name: options.name,
      sections: [
        { id: 'general', name: 'General', position: 0, permissions: { view: true, manage: false } },
        { id: 'staff', name: 'Staff', position: 1, permissions: { view: true, manage: true, roles: ['admin'] } }
      ],
      channels: [
        { id: 'general', name: 'general', type: 'text', sectionId: 'general', position: 0, permissions: { read: true, write: true, manage: false } },
        { id: 'announcements', name: 'announcements', type: 'announcement', sectionId: 'general', position: 1, permissions: { read: true, write: false, manage: true } },
        { id: 'staff-chat', name: 'staff-chat', type: 'text', sectionId: 'staff', position: 0, permissions: { read: true, write: true, manage: true, roles: ['admin'] } }
      ],
      roles: [
        { id: 'admin', name: 'Admin', color: '#e5533d', permissions: { manageServer: true, manageChannels: true, manageRoles: true, viewChannels: true, sendMessages: true, manageMessages: true } },
        { id: 'member', name: 'Member', color: '#4a90e2', permissions: { manageServer: false, manageChannels: false, manageRoles: false, viewChannels: true, sendMessages: true, manageMessages: false } }
      ]
    };

    fs.writeFileSync(outputPath, JSON.stringify(template, null, 2));
    console.log(`Created server config at ${outputPath}`);
  });

const plugins = program.command('plugins').description('Manage server plugins');

plugins
  .command('install <url>')
  .description('Download a server plugin from a URL and load it')
  .option('-p, --port <port>', 'Server port to query', '3000')
  .option('-H, --host <host>', 'Server host', 'http://localhost')
  .option('-t, --token <token>', 'Admin token (falls back to KIAMA_ADMIN_TOKEN env)')
  .action(async (url, options) => {
    const token = resolveAdminToken(options.token);
    await callAdminEndpoint({
      host: options.host,
      port: options.port,
      token,
      path: '/admin/plugins/install',
      body: { url }
    });
  });

plugins
  .command('reload')
  .description('Reload plugins from the server data plugins directory')
  .option('-p, --port <port>', 'Server port to query', '3000')
  .option('-H, --host <host>', 'Server host', 'http://localhost')
  .option('-t, --token <token>', 'Admin token (falls back to KIAMA_ADMIN_TOKEN env)')
  .action(async (options) => {
    const token = resolveAdminToken(options.token);
    await callAdminEndpoint({
      host: options.host,
      port: options.port,
      token,
      path: '/admin/plugins/reload',
      body: {}
    });
  });

program
  .command('whitelist')
  .description('Manage whitelist')
  .command('add <user>')
  .action((user) => {
    // Add to whitelist
    console.log(`Added ${user} to whitelist`);
  });

program
  .command('blacklist')
  .description('Manage blacklist')
  .command('add <user>')
  .action((user) => {
    // Add to blacklist
    console.log(`Added ${user} to blacklist`);
  });

function loadConfig(configPath: string): InitialServerConfig | undefined {
  try {
    const fullPath = path.isAbsolute(configPath) ? configPath : path.join(process.cwd(), configPath);
    const raw = fs.readFileSync(fullPath, 'utf-8');
    return JSON.parse(raw) as InitialServerConfig;
  } catch (error) {
    console.error('Failed to load config file:', error instanceof Error ? error.message : String(error));
    return undefined;
  }
}

function resolveAdminToken(optionToken?: string) {
  return optionToken || process.env.KIAMA_ADMIN_TOKEN || '';
}

async function callAdminEndpoint({ host, port, token, path: apiPath, body }: { host: string; port: string; token: string; path: string; body: any; }) {
  if (!token) {
    console.error('Admin token is required for this command. Provide --token or set KIAMA_ADMIN_TOKEN.');
    return;
  }

  const url = `${host}:${port}${apiPath}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-token': token
      },
      body: JSON.stringify(body || {})
    });

    if (!response.ok) {
      const text = await response.text();
      console.error(`Request failed [${response.status}]: ${text}`);
      return;
    }

    const data = await response.json();
    console.log('Success:', data);
  } catch (error) {
    console.error('Failed to reach server:', error instanceof Error ? error.message : String(error));
  }
}

/** Pretty-print the system stats returned by the running server. */
function displaySystemStats(stats: any) {
  console.log('🚀 KIAMA Server System Statistics');
  console.log('==================================');

  console.log('\n📊 CPU Usage:');
  console.log(`  Usage: ${stats.cpu.usage.toFixed(1)}%`);
  console.log(`  Cores: ${stats.cpu.cores}`);
  console.log(`  Model: ${stats.cpu.model}`);

  console.log('\n🧠 Memory Usage:');
  console.log(`  Total: ${(stats.memory.total / 1024 / 1024 / 1024).toFixed(2)} GB`);
  console.log(`  Used: ${(stats.memory.used / 1024 / 1024 / 1024).toFixed(2)} GB`);
  console.log(`  Free: ${(stats.memory.free / 1024 / 1024 / 1024).toFixed(2)} GB`);
  console.log(`  Usage: ${stats.memory.usage.toFixed(1)}%`);

  console.log('\n💾 Storage Usage:');
  console.log(`  Total: ${(stats.storage.total / 1024 / 1024 / 1024).toFixed(2)} GB`);
  console.log(`  Used: ${(stats.storage.used / 1024 / 1024 / 1024).toFixed(2)} GB`);
  console.log(`  Free: ${(stats.storage.free / 1024 / 1024 / 1024).toFixed(2)} GB`);
  console.log(`  Usage: ${stats.storage.usage.toFixed(1)}%`);

  console.log('\n⏱️  System Uptime:');
  const uptime = stats.uptime;
  const days = Math.floor(uptime / 86400);
  const hours = Math.floor((uptime % 86400) / 3600);
  const minutes = Math.floor((uptime % 3600) / 60);
  console.log(`  ${days}d ${hours}h ${minutes}m`);

  console.log('\n📈 Load Average:');
  console.log(`  1min: ${stats.loadAverage[0].toFixed(2)}`);
  console.log(`  5min: ${stats.loadAverage[1].toFixed(2)}`);
  console.log(`  15min: ${stats.loadAverage[2].toFixed(2)}`);

  console.log('\n==================================');
}

program.parse();