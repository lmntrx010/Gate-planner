const { execFileSync, spawn } = require('child_process');
const path = require('path');

console.log('Starting GATE CS/IT Hinglish Study Planner...');

function clearPort(port) {
  try {
    const output = execFileSync('powershell.exe', [
      '-NoProfile',
      '-Command',
      `Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess`
    ], { encoding: 'utf8' });

    const pids = [...new Set(output.split(/\s+/).map(Number).filter(Boolean))];
    for (const pid of pids) {
      execFileSync('powershell.exe', [
        '-NoProfile',
        '-Command',
        `Stop-Process -Id ${pid} -Force`
      ]);
    }
  } catch (_err) {
    // No listener on this port.
  }
}

clearPort(5000);
clearPort(5173);
clearPort(5174);

function runNpm(args, cwd) {
  return spawn('cmd.exe', ['/d', '/s', '/c', 'npm.cmd', ...args], {
    cwd,
    windowsHide: true,
    shell: false
  });
}

const backend = runNpm(['start'], path.join(__dirname, 'backend'));

backend.stdout.on('data', (data) => {
  console.log(`[Backend] ${data.toString().trim()}`);
});

backend.stderr.on('data', (data) => {
  console.error(`[Backend ERROR] ${data.toString().trim()}`);
});

const frontend = runNpm(['run', 'dev', '--', '--host', '0.0.0.0', '--port', '5173', '--strictPort'], path.join(__dirname, 'frontend'));

frontend.stdout.on('data', (data) => {
  console.log(`[Frontend] ${data.toString().trim()}`);
});

frontend.stderr.on('data', (data) => {
  console.error(`[Frontend ERROR] ${data.toString().trim()}`);
});

process.on('SIGINT', () => {
  console.log('\nShutting down servers...');
  backend.kill();
  frontend.kill();
  process.exit();
});
