#!/usr/bin/env node
/**
 * openGym Clinical HTTPS Tunnel Launcher
 * Crea un túnel seguro Cloudflare HTTPS temporal, sincroniza el WebAuthn RP_ID en .env,
 * reinicia la API y muestra el código QR en consola para escaneo inmediato con el móvil.
 */

import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import qrcode from 'qrcode-terminal';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const ENV_PATH = path.join(ROOT_DIR, '.env');

console.log('\n🚀 Iniciando túnel seguro Cloudflare para OpenGym...');

// Limpiar contenedor previo si quedó abierto
try {
  execSync('docker rm -f opengym-tunnel', { stdio: 'ignore' });
} catch {}

const tunnel = spawn('docker', [
  'run',
  '--name', 'opengym-tunnel',
  '--rm',
  '--network', 'opengym_default',
  'cloudflare/cloudflared:latest',
  'tunnel',
  '--url', 'http://web:80'
]);

let tunnelUrl = null;
let tunnelHostname = null;

function updateEnv(origin, rpId) {
  let env = fs.readFileSync(ENV_PATH, 'utf8');
  env = env.replace(/^ORIGIN=.*$/m, `ORIGIN=${origin}`);
  env = env.replace(/^RP_ID=.*$/m, `RP_ID=${rpId}`);
  fs.writeFileSync(ENV_PATH, env);
}

function restoreEnv() {
  console.log('\n🛑 Restaurando configuración local...');
  try {
    updateEnv('http://localhost:8080', 'localhost');
    execSync('docker compose up -d api', { cwd: ROOT_DIR, stdio: 'ignore' });
    execSync('docker rm -f opengym-tunnel', { stdio: 'ignore' });
  } catch {}
  console.log('✅ Entorno restaurado a localhost:8080. Sesión finalizada.\n');
  process.exit(0);
}

process.on('SIGINT', restoreEnv);
process.on('SIGTERM', restoreEnv);

const handleOutput = data => {
  const text = data.toString();
  
  if (!tunnelUrl) {
    const match = text.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
    if (match) {
      tunnelUrl = match[0];
      tunnelHostname = new URL(tunnelUrl).hostname;

      console.log(`\n🔗 ¡Túnel seguro establecido con éxito!`);
      console.log(`   URL pública: ${tunnelUrl}`);
      console.log(`   Configurando WebAuthn/Passkeys para el dominio: ${tunnelHostname}...`);

      // Actualizar .env y reiniciar API para que los Passkeys/FaceID funcionen
      updateEnv(tunnelUrl, tunnelHostname);
      execSync('docker compose up -d api', { cwd: ROOT_DIR, stdio: 'inherit' });

      console.log('\n================================================================');
      console.log('📲 ESCANEA ESTE CÓDIGO QR CON LA CÁMARA DE TU CELULAR:');
      console.log('================================================================\n');
      qrcode.generate(tunnelUrl, { small: true });
      console.log(`\n🌐 O abre directamente este enlace en tu navegador móvil:`);
      console.log(`   👉 ${tunnelUrl}\n`);
      console.log('✨ Lo que puedes probar en tu móvil ahora mismo:');
      console.log('   1. Registrar tu FaceID / TouchID.');
      console.log('   2. Entrar a la cuenta de Pepe Perez o crear un paciente nuevo.');
      console.log('   3. Abrir la rutina "Nivel 0: Activación Sedentario" y probar un ejercicio.');
      console.log('\n(Presiona Ctrl+C en cualquier momento para apagar el túnel)\n');
    }
  }
};

tunnel.stdout.on('data', handleOutput);
tunnel.stderr.on('data', handleOutput);

tunnel.on('close', code => {
  if (code !== 0 && code !== null) {
    console.error(`El proceso del túnel terminó con código: ${code}`);
  }
});
