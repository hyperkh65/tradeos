'use strict';
// Kills all processes listening on specified ports using /proc/net/tcp
// Safe: finds by socket inode, not by process name (no self-kill risk)
const fs = require('fs');
const ports = process.argv.slice(2).map(Number).filter(Boolean);
if (!ports.length) { console.error('Usage: node kill-ports.js <port> [port...]'); process.exit(1); }

for (const port of ports) {
  try {
    const hex = port.toString(16).toUpperCase().padStart(4, '0');
    const inodes = new Set();
    for (const file of ['/proc/net/tcp', '/proc/net/tcp6']) {
      try {
        for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
          const p = line.trim().split(/\s+/);
          if (p[1] && p[1].endsWith(':' + hex) && p[3] === '0A') inodes.add(p[9]);
        }
      } catch (e) {}
    }
    if (!inodes.size) { console.log(`port ${port}: no listeners`); continue; }
    for (const pid of fs.readdirSync('/proc').filter(p => /^\d+$/.test(p))) {
      try {
        for (const fd of fs.readdirSync(`/proc/${pid}/fd`)) {
          try {
            const link = fs.readlinkSync(`/proc/${pid}/fd/${fd}`);
            const m = link.match(/^socket:\[(\d+)\]$/);
            if (m && inodes.has(m[1])) {
              console.log(`killing PID ${pid} on port ${port}`);
              process.kill(parseInt(pid), 9);
            }
          } catch (e) {}
        }
      } catch (e) {}
    }
  } catch (e) { console.error(`port ${port} error:`, e.message); }
}
