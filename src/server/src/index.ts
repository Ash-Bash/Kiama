import { Command } from 'commander';
import { Server } from './server';

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
  .option('--password <password>', 'Optional server join password')
  .action((options) => {
    const server = new Server(options.port, options.public ? 'public' : 'private', undefined, options.password);
    server.start();
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