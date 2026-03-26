#!/usr/bin/env node

const { execSync, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const net = require('net');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_PORT = 3001;

// parse cli args
const args = process.argv.slice(2);
let port = DEFAULT_PORT;
let openBrowser = true;

for (let i = 0; i < args.length; i++) {
  if ((args[i] === '-p' || args[i] === '--port') && args[i + 1]) {
    port = parseInt(args[i + 1], 10);
    i++;
  }
  if (args[i] === '--no-open') {
    openBrowser = false;
  }
  if (args[i] === '-h' || args[i] === '--help') {
    console.log(`
  claude-dashboard-local

  a local dashboard for visualizing your claude code usage

  usage:
    cci [options]
    npx claude-dashboard-local [options]

  options:
    -p, --port <number>  port to run on (default: ${DEFAULT_PORT})
    --no-open            don't open browser automatically
    -h, --help           show this help

  the app reads data from ~/.claude — your data never leaves your machine
`);
    process.exit(0);
  }
}

// check if ~/.claude exists
const claudeDir = path.join(require('os').homedir(), '.claude');
if (!fs.existsSync(claudeDir)) {
  console.error('\n  ~/.claude directory not found');
  console.error('  install and use claude code first: https://docs.anthropic.com/en/docs/claude-code\n');
  process.exit(1);
}

// check if build exists, build if not
const standaloneServer = path.join(ROOT, '.next', 'standalone', 'server.js');
const nextDir = path.join(ROOT, '.next');

if (!fs.existsSync(standaloneServer)) {
  if (!fs.existsSync(nextDir)) {
    console.log('  building claude code inspector (first run only)...\n');
    try {
      execSync('npm run build', { cwd: ROOT, stdio: 'inherit' });
    } catch {
      console.error('\n  build failed — make sure node 18+ is installed\n');
      process.exit(1);
    }
  }
}

// find an available port
function isPortAvailable(p) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close();
      resolve(true);
    });
    server.listen(p);
  });
}

async function findPort(startPort) {
  let p = startPort;
  while (p < startPort + 20) {
    if (await isPortAvailable(p)) return p;
    p++;
  }
  return startPort;
}

async function main() {
  const actualPort = await findPort(port);
  if (actualPort !== port) {
    console.log(`  port ${port} in use, using ${actualPort}`);
  }

  const url = `http://localhost:${actualPort}`;
  console.log(`\n  claude code inspector`);
  console.log(`  ${url}\n`);

  // start the server
  let serverProcess;

  if (fs.existsSync(standaloneServer)) {
    // use standalone output
    serverProcess = spawn('node', [standaloneServer], {
      cwd: path.join(ROOT, '.next', 'standalone'),
      env: { ...process.env, PORT: String(actualPort), HOSTNAME: '0.0.0.0' },
      stdio: 'inherit',
    });
  } else {
    // fallback to next start
    serverProcess = spawn('npx', ['next', 'start', '-p', String(actualPort)], {
      cwd: ROOT,
      stdio: 'inherit',
    });
  }

  // open browser
  if (openBrowser) {
    setTimeout(() => {
      const platform = process.platform;
      try {
        if (platform === 'darwin') execSync(`open ${url}`);
        else if (platform === 'linux') execSync(`xdg-open ${url}`);
        else if (platform === 'win32') execSync(`start ${url}`);
      } catch {
        // browser open failed silently
      }
    }, 1500);
  }

  // handle shutdown
  const shutdown = () => {
    serverProcess.kill();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main();
