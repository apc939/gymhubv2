#!/usr/bin/env node
/**
 * openGym Clinical Prescription & Adherency Manager
 * Diseñado para Medicina del Deporte & Consulta Médica.
 * Conectado en tiempo real con GymHub en Railway & Docker.
 *
 * Comandos:
 *   node clinical/clinical-manager.mjs list
 *   node clinical/clinical-manager.mjs invite <Nombre Paciente> [nivel0|nivel1|postural]
 *   node clinical/clinical-manager.mjs assign <usuario/UID> <nivel0|nivel1|postural>
 *   node clinical/clinical-manager.mjs report <usuario/UID>
 */

import { execSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';
import qrcodeTerminal from 'qrcode-terminal';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const ARCHETYPES_DIR = path.join(__dirname, 'archetypes');
const PRESCRIPTIONS_DIR = path.join(__dirname, 'prescripciones');
const ENV_PATH = path.join(ROOT_DIR, '.env');

if (!fs.existsSync(PRESCRIPTIONS_DIR)) {
  fs.mkdirSync(PRESCRIPTIONS_DIR, { recursive: true });
}

const ARCHETYPE_MAP = {
  'nivel0': 'nivel0_sedentario.json',
  'nivel-0': 'nivel0_sedentario.json',
  '0': 'nivel0_sedentario.json',
  'sedentario': 'nivel0_sedentario.json',

  'nivel1': 'nivel1_bandas_mancuernas.json',
  'nivel-1': 'nivel1_bandas_mancuernas.json',
  '1': 'nivel1_bandas_mancuernas.json',
  'bandas': 'nivel1_bandas_mancuernas.json',

  'nivel2': 'nivel2_salud_postural.json',
  'postural': 'nivel2_salud_postural.json',
  '2': 'nivel2_salud_postural.json',
  'columna': 'nivel2_salud_postural.json',
  'lumbar': 'nivel2_salud_postural.json'
};

const CANONICAL_ARCHETYPE = {
  'nivel0': 'nivel0',
  'nivel-0': 'nivel0',
  '0': 'nivel0',
  'sedentario': 'nivel0',

  'nivel1': 'nivel1',
  'nivel-1': 'nivel1',
  '1': 'nivel1',
  'bandas': 'nivel1',

  'nivel2': 'nivel2',
  'postural': 'nivel2',
  '2': 'nivel2',
  'columna': 'nivel2',
  'lumbar': 'nivel2'
};

const DEFAULT_ORIGIN = 'https://web-production-5a975.up.railway.app';
const DEFAULT_ADMIN_KEY = 'gymhub-clinical-admin-2026';

function getOrigin() {
  if (process.env.ORIGIN) return process.env.ORIGIN.trim();
  try {
    const env = fs.readFileSync(ENV_PATH, 'utf8');
    const m = env.match(/^ORIGIN=(.+)$/m);
    if (m && m[1].trim() && !m[1].includes('localhost')) return m[1].trim();
  } catch {}
  return DEFAULT_ORIGIN;
}

function getAdminKey() {
  if (process.env.ADMIN_KEY) return process.env.ADMIN_KEY.trim();
  try {
    const env = fs.readFileSync(ENV_PATH, 'utf8');
    const m = env.match(/^ADMIN_KEY=(.+)$/m);
    if (m && m[1].trim()) return m[1].trim();
  } catch {}
  return DEFAULT_ADMIN_KEY;
}

const ORIGIN = getOrigin();
const ADMIN_KEY = getAdminKey();
const USE_API = !process.env.LOCAL_DOCKER && (ORIGIN.startsWith('http://') || ORIGIN.startsWith('https://'));

async function apiRequest(endpoint, options = {}) {
  const url = `${ORIGIN}${endpoint}`;
  const headers = {
    'Content-Type': 'application/json',
    'x-admin-key': ADMIN_KEY,
    ...(options.headers || {})
  };
  let lastErr;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(url, { ...options, headers });
      if (res.ok) return await res.json();
      const errText = await res.text().catch(() => '');
      if (res.status === 502 && attempt === 1) {
        await new Promise(r => setTimeout(r, 400));
        continue;
      }
      throw new Error(`Error API (${res.status}): ${errText}`);
    } catch (e) {
      lastErr = e;
      if (attempt === 1) {
        await new Promise(r => setTimeout(r, 400));
        continue;
      }
      throw lastErr;
    }
  }
}

function runDockerApiCmd(cmd) {
  try {
    return execSync(`docker compose exec -T api ${cmd}`, { encoding: 'utf8' });
  } catch (err) {
    console.error('Error al comunicarse con el contenedor Docker de OpenGym:', err.message);
    process.exit(1);
  }
}

async function getDatabase() {
  if (USE_API) {
    try {
      const uRes = await apiRequest('/api/admin/users');
      const iRes = await apiRequest('/api/admin/invites').catch(() => ({ invites: [] }));
      return {
        users: uRes.users || [],
        invites: iRes.invites || []
      };
    } catch (e) {
      console.warn('⚠️ No se pudo conectar vía API Railway, probando Docker local...', e.message);
    }
  }
  const raw = runDockerApiCmd('cat /data/db.json');
  return JSON.parse(raw);
}

async function getUserState(uid) {
  if (USE_API) {
    try {
      const data = await apiRequest('/api/admin/user/raw-state?id=' + encodeURIComponent(uid));
      return data.state || null;
    } catch {
      return null;
    }
  }
  try {
    const raw = runDockerApiCmd(`cat /data/state-${uid}.json`);
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function findUser(query, db) {
  const q = query.trim().toLowerCase();
  return db.users.find(u => {
    const invite = (db.invites || []).find(i => i.code === u.invitedBy || i.usedBy === u.id);
    const clinicalNote = invite?.note?.toLowerCase() || '';
    return (
      (u.id && u.id.toLowerCase() === q) ||
      (u.name && u.name.toLowerCase().includes(q)) ||
      clinicalNote.includes(q) ||
      (u.invitedBy && u.invitedBy.toLowerCase() === q)
    );
  });
}

// 1. LISTAR PACIENTES Y ADHERENCIA
async function listPatients() {
  console.log(`📡 Conectado a: ${ORIGIN}`);
  const db = await getDatabase();
  console.log('\n🏥 =================== PACIENTES REGISTRADOS ===================');
  if (!db.users || !db.users.length) {
    console.log('No hay pacientes registrados aún.');
    return;
  }

  for (let idx = 0; idx < db.users.length; idx++) {
    const u = db.users[idx];
    const state = await getUserState(u.id);
    const routinesCount = state?.routines?.length || u.workouts || 0;
    const routines = state?.routines?.map(r => r.name).join(', ');
    const currentRoutine = routines || 'Sin prescripción';
    const workoutsCount = state?.workouts?.length ?? u.workouts ?? 0;
    const lastWorkout = state?.workouts?.[state.workouts.length - 1];
    const lastDate = lastWorkout ? lastWorkout.d : (u.lastWorkout || 'Nunca');

    const invite = (db.invites || []).find(i => i.code === u.invitedBy || i.usedBy === u.id);
    const prescriptionNote = invite?.note ? ` [Recetado a: "${invite.note}"]` : '';
    const inviteInfo = u.invitedBy ? ` (Código: ${u.invitedBy})` : '';
    const adminTag = u.admin ? ' 👑 [ADMIN]' : '';

    console.log(`\n${idx + 1}. ${u.name}${adminTag}${prescriptionNote} (UID: ${u.id})${inviteInfo}`);
    console.log(`   • Prescripción actual: ${currentRoutine}`);
    console.log(`   • Sesiones realizadas: ${workoutsCount}`);
    console.log(`   • Último entrenamiento: ${lastDate}`);
  }
  console.log('\n================================================================\n');
}

// 2. ASIGNAR ARQUETIPO CLÍNICO A UN USUARIO
async function assignArchetype(targetUser, archetypeKey) {
  const db = await getDatabase();
  const user = findUser(targetUser, db);

  if (!user) {
    console.error(`\n❌ Paciente no encontrado con el criterio: "${targetUser}".`);
    console.log('Usa "node clinical/clinical-manager.mjs list" para ver los pacientes disponibles.\n');
    process.exit(1);
  }

  const fileName = ARCHETYPE_MAP[archetypeKey.toLowerCase()];
  if (!fileName) {
    console.error(`\n❌ Arquetipo desconocido: "${archetypeKey}".`);
    console.log('Opciones disponibles:');
    console.log('  - nivel0   : Activación Sedentario (Casa / Sin Equipo)');
    console.log('  - nivel1   : Adaptación con Cargas (Bandas / Mancuernas)');
    console.log('  - postural : Salud Postural & Columna (Anti-Sedentarismo)\n');
    process.exit(1);
  }

  const canonicalKey = CANONICAL_ARCHETYPE[archetypeKey.toLowerCase()] || 'nivel0';

  if (USE_API) {
    try {
      const res = await apiRequest('/api/admin/user/assign', {
        method: 'POST',
        body: JSON.stringify({ id: user.id, archetype: canonicalKey })
      });
      console.log(`\n✅ ¡Prescripción médica asignada con éxito a ${res.user} en Railway!`);
      console.log(`   📋 Arquetipo: ${res.archetype}`);
      console.log(`   🔔 Recordatorio diario: 08:00 AM activado`);
      console.log(`   💡 El paciente verá inmediatamente su rutina y calendario al abrir la app.\n`);
      return;
    } catch (err) {
      console.error('Error al asignar vía API:', err.message);
      process.exit(1);
    }
  }

  // Fallback Docker local
  const archetypePath = path.join(ARCHETYPES_DIR, fileName);
  const archetype = JSON.parse(fs.readFileSync(archetypePath, 'utf8'));

  let state = (await getUserState(user.id)) || {
    unit: 'kg', restSec: 60, sound: true, lang: 'es', theme: 'light',
    accent: 'sky', body: 'male', targetW: null, bodyweight: [],
    workouts: [], customEx: [], gifSize: 'full'
  };

  state.routines = [
    {
      id: archetype.id,
      name: archetype.name,
      emoji: archetype.emoji,
      prog: archetype.prog,
      ex: archetype.ex.map(e => ({
        id: e.id,
        sets: e.sets,
        reps: e.reps || 10,
        mode: e.mode || 'reps',
        weight: e.weight || 0,
        ...(e.restSec ? { restSec: e.restSec } : {}),
        prog: e.prog || 'linear'
      }))
    }
  ];

  state.week = archetype.week;
  state.lang = 'es';
  state.reminder = { on: true, time: '08:00', tz: 'America/Bogota' };
  state.checkIn = false;
  state._clinical = true;
  state._ts = Date.now();

  const tmpFile = `/tmp/state-${user.id}.json`;
  fs.writeFileSync(tmpFile, JSON.stringify(state, null, 2));
  execSync(`docker compose cp ${tmpFile} api:/data/state-${user.id}.json`);
  fs.unlinkSync(tmpFile);

  console.log(`\n✅ ¡Prescripción médica asignada con éxito a ${user.name}!`);
  console.log(`   📋 Arquetipo: ${archetype.name}`);
  console.log(`   💡 El paciente verá inmediatamente su rutina y calendario en su app móvil.\n`);
}

// 3. GENERAR INVITACIÓN CON QR Y HOJA DE PRESCRIPCIÓN CLÍNICA
async function createInvite(patientName, archetypeKey = 'nivel0') {
  const fileName = ARCHETYPE_MAP[archetypeKey.toLowerCase()] || 'nivel0_sedentario.json';
  const archetypePath = path.join(ARCHETYPES_DIR, fileName);
  const archetype = JSON.parse(fs.readFileSync(archetypePath, 'utf8'));
  const canonicalKey = CANONICAL_ARCHETYPE[archetypeKey.toLowerCase()] || 'nivel0';

  let code;

  if (USE_API) {
    try {
      const res = await apiRequest('/api/admin/invites/new', {
        method: 'POST',
        body: JSON.stringify({ note: patientName, archetype: canonicalKey })
      });
      code = res.invite.code;
    } catch (e) {
      console.error('Error al generar invitación en Railway:', e.message);
      process.exit(1);
    }
  } else {
    const db = await getDatabase();
    code = crypto.randomBytes(8).toString('hex').toUpperCase();
    db.invites = db.invites || [];
    db.invites.push({
      code,
      note: patientName,
      archetype: canonicalKey,
      createdBy: 'admin',
      created: new Date().toISOString()
    });
    const tmp = `/tmp/db-${Date.now()}.json`;
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
    execSync(`docker compose cp ${tmp} api:/data/db.json`);
    fs.unlinkSync(tmp);
  }

  const inviteUrl = `${ORIGIN}/?code=${code}&name=${encodeURIComponent(patientName)}`;
  const qrDataUrl = await QRCode.toDataURL(inviteUrl, { width: 300, margin: 1 });

  const slug = patientName.toLowerCase().replace(/[^a-z0-9]/g, '-');
  const prescriptionFile = path.join(PRESCRIPTIONS_DIR, `receta-${slug}.html`);

  const htmlContent = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Receta de Ejercicio Clínico — ${patientName}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f8fafc; color: #1e293b; margin: 0; padding: 24px; line-height: 1.5; }
    .card { max-width: 600px; margin: 0 auto; background: white; border-radius: 16px; padding: 32px; box-shadow: 0 4px 20px rgba(0,0,0,0.06); border: 1px solid #e2e8f0; }
    .header { text-align: center; border-bottom: 2px solid #0284c7; padding-bottom: 20px; margin-bottom: 24px; }
    .logo { font-size: 32px; font-weight: 800; color: #0284c7; display: flex; align-items: center; justify-content: center; gap: 8px; }
    .badge { display: inline-block; background: #e0f2fe; color: #0369a1; font-weight: 600; font-size: 13px; padding: 4px 12px; border-radius: 20px; margin-top: 8px; }
    .meta-box { background: #f1f5f9; border-radius: 10px; padding: 14px 18px; margin-bottom: 20px; font-size: 14px; }
    .qr-container { text-align: center; margin: 28px 0; padding: 20px; background: #f8fafc; border-radius: 12px; border: 1px dashed #cbd5e1; }
    .qr-img { width: 220px; height: 220px; }
    .steps { background: #f0fdf4; border: 1px solid #bbf7d0; color: #166534; padding: 16px; border-radius: 10px; font-size: 13px; margin-bottom: 20px; }
    .footer { text-align: center; font-size: 12px; color: #64748b; margin-top: 24px; border-top: 1px solid #e2e8f0; padding-top: 16px; }
    .btn { display: block; text-align: center; background: #0284c7; color: white; text-decoration: none; padding: 12px; border-radius: 10px; font-weight: 600; margin-top: 14px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <div class="logo">🩺 GymHub</div>
      <div style="font-size: 13px; color: #64748b; margin-top: 4px;">Medicina del Deporte — Dr. Andrés Parra (@medandresparra)</div>
      <div class="badge">PRESCRIPCIÓN MÉDICA INDIVIDUALIZADA</div>
    </div>

    <div class="meta-box">
      <div><strong>Paciente:</strong> ${patientName}</div>
      <div><strong>Protocolo Terapéutico:</strong> ${archetype.name}</div>
      <div><strong>Frecuencia Semanal:</strong> ${archetype.meta.frequencyDays} días / semana (15-20 min)</div>
      <div><strong>Código de Activación:</strong> <span style="font-family: monospace; font-size: 16px; font-weight: 700; color: #0284c7;">${code}</span></div>
    </div>

    <div class="qr-container">
      <div style="font-weight: 700; font-size: 15px; margin-bottom: 8px; color: #0f172a;">ACCESO DIRECTO DESDE TU CELULAR</div>
      <img class="qr-img" src="${qrDataUrl}" alt="Código QR de Acceso">
      <div style="font-size: 11px; color: #64748b; margin-top: 8px;">Apunta la cámara de tu smartphone para abrir la aplicación</div>
      <a href="${inviteUrl}" class="btn">Abrir en mi celular</a>
    </div>

    <div class="steps">
      <strong>Instrucciones para iniciar en 60 segundos:</strong>
      <ol>
        <li>Abre la cámara de tu celular y <strong>escanea el código QR</strong> de arriba o toca el botón.</li>
        <li>Toca en <strong>"Crear passkey"</strong> y confirma con tu <strong>Face ID / Huella dactilar</strong> (cero contraseñas).</li>
        <li>¡Listo! Tu rutina ya está cargada con animaciones y cronómetros de descanso.</li>
      </ol>
    </div>

    <div class="footer">
      Esta prescripción forma parte de tu plan médico integral. Ante cualquier molestia, detén la sesión y consúltame.
    </div>
  </div>
</body>
</html>`;

  fs.writeFileSync(prescriptionFile, htmlContent);

  console.log(`\n🏥 ================= INVITACIÓN CLÍNICA GENERADA =================`);
  console.log(`PACIENTE: ${patientName}`);
  console.log(`CÓDIGO DE INVITACIÓN: ${code}`);
  console.log(`PLAN ASOCIADO: ${archetype.name}`);
  console.log(`URL DE ACCESO: ${inviteUrl}`);
  console.log('\n📲 ESCANEA EN CONSULTA CON EL MÓVIL:');
  qrcodeTerminal.generate(inviteUrl, { small: true });
  console.log(`\n📄 Hoja de prescripción creada en:`);
  console.log(`   👉 file://${prescriptionFile}`);
  console.log(`\n💡 Tip: Puedes enviar el enlace directo por WhatsApp al paciente.`);
  console.log('===================================================================\n');
}

// 4. INFORME CLÍNICO PARA HISTORIA CLÍNICA
async function generateReport(targetUser) {
  const db = await getDatabase();
  const user = findUser(targetUser, db);

  if (!user) {
    console.error(`\n❌ Paciente "${targetUser}" no encontrado.\n`);
    process.exit(1);
  }

  const state = await getUserState(user.id);
  const workouts = state?.workouts || [];
  const routine = state?.routines?.[0]?.name || 'Ninguna';

  console.log('\n📄 ================= NOTA DE EVOLUCIÓN CLÍNICA (EHR) =================');
  console.log(`PACIENTE: ${user.name} | UID: ${user.id}`);
  console.log(`FECHA DEL INFORME: ${new Date().toLocaleDateString('es-ES')}`);
  console.log(`PLAN TERAPÉUTICO PRESCRITO: ${routine}`);
  console.log(`TOTAL SESIONES REGISTRADAS: ${workouts.length}`);
  
  if (workouts.length > 0) {
    const last3 = workouts.slice(-3);
    console.log('\nÚLTIMAS SESIONES REALIZADAS:');
    last3.forEach(w => {
      const durationMin = w.end && w.start ? Math.round((w.end - w.start) / 60000) : 'N/A';
      console.log(`  • ${w.d}: ${w.name} | Duración: ${durationMin} min | Series completadas: ${w.entries?.length || 0}`);
    });
  } else {
    console.log('\nESTADO DE ADHERENCIA: Sin entrenamientos registrados aún.');
  }
  console.log('=========================================================================\n');
}

// MAIN
const args = process.argv.slice(2);
const command = args[0];

switch (command) {
  case 'list':
  case 'pacientes':
    await listPatients();
    break;
  case 'invite':
  case 'invitar':
    if (!args[1]) {
      console.log('Uso: node clinical/clinical-manager.mjs invite <Nombre Paciente> [nivel0 | nivel1 | postural]');
    } else {
      await createInvite(args[1], args[2] || 'nivel0');
    }
    break;
  case 'assign':
  case 'prescribir':
    if (!args[1] || !args[2]) {
      console.log('Uso: node clinical/clinical-manager.mjs assign <paciente> <nivel0 | nivel1 | postural>');
    } else {
      await assignArchetype(args[1], args[2]);
    }
    break;
  case 'report':
  case 'informe':
    if (!args[1]) {
      console.log('Uso: node clinical/clinical-manager.mjs report <paciente>');
    } else {
      await generateReport(args[1]);
    }
    break;
  default:
    console.log('\n🩺 openGym Clinical Manager (Conectado a Railway)');
    console.log('Comandos disponibles:');
    console.log('  node clinical/clinical-manager.mjs list');
    console.log('  node clinical/clinical-manager.mjs invite <Nombre Paciente> [nivel0|nivel1|postural]');
    console.log('  node clinical/clinical-manager.mjs assign <usuario> <nivel0|nivel1|postural>');
    console.log('  node clinical/clinical-manager.mjs report <usuario>\n');
    break;
}
