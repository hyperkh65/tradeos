'use strict';
// Multi-protocol TCP server: detects TLS vs HTTP on same port
// HTTP  → proxy to Next.js internal HTTP server
// HTTPS → TLS termination + proxy to Next.js internal HTTP server
const net = require('net');
const tls = require('tls');
const fs = require('fs');
const { execSync, spawn } = require('child_process');
const path = require('path');

const PORT = parseInt(process.env.PORT || '3103');
const INTERNAL_PORT = PORT + 100;

function findCert() {
  // Synology stores certs as RSA-fullchain.pem / RSA-privkey.pem (or ECC-*)
  const variants = [
    ['RSA-fullchain.pem', 'RSA-privkey.pem'],
    ['fullchain.pem', 'privkey.pem'],
    ['ECC-fullchain.pem', 'ECC-privkey.pem'],
  ];

  function tryDir(dir) {
    for (const [cf, kf] of variants) {
      const cert = path.join(dir, cf);
      const key = path.join(dir, kf);
      if (fs.existsSync(cert) && fs.existsSync(key)) {
        try { const k = fs.readFileSync(key); return { cert, key }; } catch (e) {}
      }
    }
    return null;
  }

  const searchRoots = [
    '/usr/syno/etc/certificate/ReverseProxy',
    '/usr/syno/etc/certificate/system/default',
    '/usr/syno/etc/certificate/_archive',
    '/usr/syno/etc/certificate/system',
  ];

  for (const root of searchRoots) {
    const direct = tryDir(root);
    if (direct) return direct;
    try {
      for (const sub of fs.readdirSync(root)) {
        const subDir = path.join(root, sub);
        try {
          if (fs.statSync(subDir).isDirectory()) {
            const r = tryDir(subDir);
            if (r) return r;
          }
        } catch (e) {}
      }
    } catch (e) {}
  }

  try {
    const cert = execSync("grep -rh 'ssl_certificate ' /etc/nginx/ 2>/dev/null | grep -v key | head -1 | awk '{print $2}' | tr -d ';'", { timeout: 5000 }).toString().trim();
    const key = execSync("grep -rh 'ssl_certificate_key ' /etc/nginx/ 2>/dev/null | head -1 | awk '{print $2}' | tr -d ';'", { timeout: 5000 }).toString().trim();
    if (cert && key && fs.existsSync(cert) && fs.existsSync(key)) {
      try { fs.readFileSync(key); return { cert, key }; } catch (e) {}
    }
  } catch (e) {}

  try {
    const certPath = '/tmp/tradeos-self.crt';
    const keyPath = '/tmp/tradeos-self.key';
    if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
      execSync(`openssl req -x509 -newkey rsa:2048 -keyout "${keyPath}" -out "${certPath}" -days 3650 -nodes -subj "/CN=gw.ynk2014.com" 2>/dev/null`, { timeout: 30000 });
    }
    if (fs.existsSync(certPath) && fs.existsSync(keyPath)) return { cert: certPath, key: keyPath };
  } catch (e) {}
  return null;
}

// Start Next.js on internal port
const nextEnv = { ...process.env, PORT: String(INTERNAL_PORT), HOSTNAME: '127.0.0.1' };
const nextProc = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
  env: nextEnv,
  stdio: 'inherit',
});
try { fs.writeFileSync('/tmp/tradeos-next.pid', String(nextProc.pid)); } catch (e) {}
nextProc.on('exit', (code) => { process.exit(typeof code === 'number' ? code : 1); });

function proxyToInternal(stream) {
  const target = net.connect(INTERNAL_PORT, '127.0.0.1');
  target.on('connect', () => { stream.pipe(target); target.pipe(stream); });
  target.on('error', () => { try { stream.destroy(); } catch (e) {} });
  stream.on('error', () => { try { target.destroy(); } catch (e) {} });
  stream.on('close', () => { try { target.destroy(); } catch (e) {} });
  target.on('close', () => { try { stream.destroy(); } catch (e) {} });
}

setTimeout(() => {
  const certInfo = findCert();
  let tlsOptions = null;
  if (certInfo) {
    try {
      tlsOptions = { key: fs.readFileSync(certInfo.key), cert: fs.readFileSync(certInfo.cert) };
      console.log(`TLS cert: ${certInfo.cert}`);
    } catch (e) { console.error('cert load error:', e.message); }
  } else {
    console.log('No cert found - HTTPS will respond with connection error');
  }

  const server = net.createServer({ allowHalfOpen: false }, (socket) => {
    socket.once('readable', () => {
      const peek = socket.read(1);
      if (!peek) { socket.destroy(); return; }
      socket.unshift(peek);
      const isTLS = peek[0] === 0x16;
      if (isTLS && tlsOptions) {
        const tlsSocket = new tls.TLSSocket(socket, { ...tlsOptions, isServer: true });
        tlsSocket.on('error', () => { try { socket.destroy(); } catch (e) {} });
        proxyToInternal(tlsSocket);
      } else {
        proxyToInternal(socket);
      }
    });
    socket.on('error', () => {});
  });

  server.on('error', (e) => { console.error('Server error:', e.message); process.exit(1); });
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`▲ TradeOS on port ${PORT} (HTTP+HTTPS → internal:${INTERNAL_PORT})`);
    if (tlsOptions) console.log('  HTTPS: enabled');
  });
}, 2000);
