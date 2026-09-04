#!/usr/bin/env node
/**
 * openGym Clinical Prescription & Adherency Manager
 * Diseñado para Medicina del Deporte & Consulta Médica.
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

// Mapeo canónico a los archivos en /data/archetypes/{key}.json
const CANONICAL_ARCHETYPE = {
  'nivel0': 'nivel0',
  'nivel-0': 'nivel0',
  '0': 'nivel0',
  'sedentario': 'nivel0',

  'nivel1': 'nivel1',
  'nivel-1': 'nivel1',
  '1': 'nivel1',
  'bandas': 'nivel1',

  'nivel2': 'postural',
  'postural': 'postural',
  '2': 'postural',
  'columna': 'postural',
  'lumbar': 'postural'
};

function runDockerApiCmd(cmd) {
  try {
    return execSync(`docker compose exec -T api ${cmd}`, { encoding: 'utf8' });
  } catch (err) {
    console.error('Error al comunicarse con el contenedor Docker de OpenGym:', err.message);
    process.exit(1);
  }
}

function getDatabase() {
  const raw = runDockerApiCmd('cat /data/db.json');
  return JSON.parse(raw);
}

function saveDatabase(db) {
  const tmp = `/tmp/db-${Date.now()}.json`;
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  execSync(`docker compose cp ${tmp} api:/data/db.json`);
  fs.unlinkSync(tmp);
}

function getOrigin() {
  try {
    const env = fs.readFileSync(ENV_PATH, 'utf8');
    const m = env.match(/^ORIGIN=(.+)$/m);
    return m ? m[1].trim() : 'http://localhost:8080';
  } catch {
    return 'http://localhost:8080';
  }
}

function getUserState(uid) {
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
      u.id.toLowerCase() === q ||
      u.name.toLowerCase().includes(q) ||
      clinicalNote.includes(q) ||
      (u.invitedBy && u.invitedBy.toLowerCase() === q)
    );
  });
}

// 1. LISTAR PACIENTES Y ADHERENCIA
function listPatients() {
  const db = getDatabase();
  console.log('\n🏥 =================== PACIENTES REGISTRADOS ===================');
  if (!db.users || !db.users.length) {
    console.log('No hay pacientes registrados aún.');
    return;
  }

  db.users.forEach((u, idx) => {
    const state = getUserState(u.id);
    const routinesCount = state?.routines?.length || 0;
    const currentRoutine = state?.routines?.[0]?.name || 'Sin prescripción';
    const workoutsCount = state?.workouts?.length || 0;
    const lastWorkout = state?.workouts?.[state.workouts.length - 1];
    const lastDate = lastWorkout ? lastWorkout.d : 'Nunca';

    // Vincular con la prescripción clínica original
    const invite = (db.invites || []).find(i => i.code === u.invitedBy || i.usedBy === u.id);
    const prescriptionNote = invite?.note ? ` [Recetado a: "${invite.note}"]` : '';
    const inviteInfo = u.invitedBy ? ` (Código: ${u.invitedBy})` : '';

    console.log(`\n${idx + 1}. ${u.name}${prescriptionNote} (UID: ${u.id})${inviteInfo}`);
    console.log(`   • Prescripción actual: ${currentRoutine} (${routinesCount} rutina/s)`);
    console.log(`   • Sesiones realizadas: ${workoutsCount}`);
    console.log(`   • Último entrenamiento: ${lastDate}`);
  });
  console.log('\n================================================================\n');
}

// 2. ASIGNAR ARQUETIPO CLÍNICO A UN USUARIO
function assignArchetype(targetUser, archetypeKey) {
  const db = getDatabase();
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

  const archetypePath = path.join(ARCHETYPES_DIR, fileName);
  const archetype = JSON.parse(fs.readFileSync(archetypePath, 'utf8'));

  let state = getUserState(user.id) || {
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
  console.log(`   ⏱️  Duración estimada: ${archetype.meta.durationMin} minutos`);
  console.log(`   📅 Frecuencia: ${archetype.meta.frequencyDays} días por semana (Lunes, Miércoles, Viernes)`);
  console.log(`   🔔 Recordatorio diario: 08:00 AM activado`);
  console.log(`   💡 El paciente verá inmediatamente su rutina y calendario en su app móvil.\n`);
}

// 3. GENERAR INVITACIÓN CON QR Y HOJA DE PRESCRIPCIÓN CLÍNICA
async function createInvite(patientName, archetypeKey = 'nivel0') {
  const db = getDatabase();
  const origin = getOrigin();
  const code = crypto.randomBytes(8).toString('hex').toUpperCase();

  const fileName = ARCHETYPE_MAP[archetypeKey.toLowerCase()] || 'nivel0_sedentario.json';
  const archetypePath = path.join(ARCHETYPES_DIR, fileName);
  const archetype = JSON.parse(fs.readFileSync(archetypePath, 'utf8'));

  const canonicalKey = CANONICAL_ARCHETYPE[archetypeKey.toLowerCase()] || 'nivel0';

  db.invites = db.invites || [];
  db.invites.push({
    code,
    note: patientName,
    archetype: canonicalKey,
    createdBy: 'admin',
    created: new Date().toISOString()
  });
  saveDatabase(db);

  const inviteUrl = `${origin}/?code=${code}&name=${encodeURIComponent(patientName)}`;
  const qrDataUrl = await QRCode.toDataURL(inviteUrl, { width: 300, margin: 1 });

  // Crear archivo HTML imprimible/enviable
  const slug = patientName.toLowerCase().replace(/[^a-z0-9]/g, '-');
  const prescriptionFile = path.join(PRESCRIPTIONS_DIR, `receta-${slug}.html`);

  const htmlContent = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Prescripción Médica de Ejercicio - ${patientName}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 40px; background: #f8fafc; color: #1e293b; }
    .card { max-width: 650px; margin: 0 auto; background: white; border-radius: 16px; padding: 36px; box-shadow: 0 4px 20px rgba(0,0,0,0.06); border: 1px solid #e2e8f0; }
    .header { border-bottom: 2px solid #e2e8f0; padding-bottom: 20px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: center; }
    .title { font-size: 22px; font-weight: 700; color: #0f172a; margin: 0; }
    .subtitle { font-size: 13px; color: #64748b; margin-top: 4px; }
    .patient-box { background: #f1f5f9; padding: 16px; border-radius: 10px; margin-bottom: 24px; }
    .badge { display: inline-block; background: #10b981; color: white; padding: 4px 10px; border-radius: 20px; font-size: 12px; font-weight: 600; margin-bottom: 8px; }
    .rx-box { border-left: 4px solid #10b981; padding-left: 16px; margin: 20px 0; }
    .qr-container { text-align: center; margin: 30px 0; padding: 20px; background: #f8fafc; border-radius: 12px; border: 1px dashed #cbd5e1; }
    .qr-img { width: 220px; height: 220px; border-radius: 8px; }
    .steps { font-size: 14px; line-height: 1.6; color: #334155; margin: 20px 0; }
    .steps ol { padding-left: 20px; }
    .footer { text-align: center; font-size: 12px; color: #94a3b8; margin-top: 30px; border-top: 1px solid #f1f5f9; padding-top: 16px; }
    @media print { body { background: white; padding: 0; } .card { box-shadow: none; border: none; padding: 20px; } .btn-print { display: none; } }
    .btn-print { background: #0f172a; color: white; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer; font-weight: 600; margin-bottom: 16px; }
  </style>
</head>
<body>
  <div style="max-width: 650px; margin: 0 auto; text-align: right;">
    <button class="btn-print" onclick="window.print()">🖨️ Imprimir / Guardar como PDF</button>
  </div>
  <div class="card">
    <div class="header">
      <div>
        <h1 class="title">Receta de Ejercicio Terapéutico</h1>
        <div class="subtitle">Dr. Andrés Parra Charris · Medicina del Deporte</div>
      </div>
      <div style="font-size: 28px;">🩺</div>
    </div>

    <div class="patient-box">
      <div style="font-size: 13px; color: #64748b;">PACIENTE PRESCRITO:</div>
      <div style="font-size: 18px; font-weight: 700; color: #0f172a;">${patientName}</div>
      <div style="font-size: 12px; color: #64748b; margin-top: 4px;">Fecha: ${new Date().toLocaleDateString('es-ES')} | Código de Acceso Clínico: <code>${code}</code></div>
    </div>

    <div class="rx-box">
      <span class="badge">PLAN CLÍNICO ASIGNADO</span>
      <h3 style="margin: 4px 0 8px 0; color: #0f172a;">${archetype.name}</h3>
      <p style="font-size: 14px; color: #475569; margin: 0;">${archetype.meta.description}</p>
      <div style="margin-top: 10px; font-size: 13px; font-weight: 600; color: #0f172a;">
        ⏱️ Dosis: ${archetype.meta.durationMin} min/sesión · 📅 Frecuencia: ${archetype.meta.frequencyDays} días por semana · ⏱️ Descanso: 60 seg
      </div>
    </div>

    <div class="qr-container">
      <div style="font-weight: 700; font-size: 15px; margin-bottom: 8px; color: #0f172a;">ACCESO DIRECTO DESDE TU CELULAR</div>
      <img class="qr-img" src="${qrDataUrl}" alt="Código QR de Acceso">
      <div style="font-size: 11px; color: #64748b; margin-top: 8px;">Apunta la cámara de tu smartphone para abrir la aplicación</div>
    </div>

    <div class="steps">
      <strong>Instrucciones para iniciar en 60 segundos:</strong>
      <ol>
        <li>Abre la cámara de tu celular y <strong>escanea el código QR</strong> de arriba.</li>
        <li>Toca en <strong>"Registrarme"</strong> y confirma con tu <strong>FaceID / Huella dactilar</strong> (no necesitas recordar contraseñas).</li>
        <li>¡Listo! Tu rutina ya está cargada con animaciones y cronómetros de descanso.</li>
      </ol>
    </div>

    <div class="footer">
      Esta prescripción forma parte de tu plan médico integral. Ante cualquier dolor agudo, detén la sesión y consúltame en la próxima cita.
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
  console.log(`\n📄 Hoja de prescripción imprimible/enviable creada en:`);
  console.log(`   👉 file://${prescriptionFile}`);
  console.log(`\n💡 Tip: Puedes abrir esa hoja en tu navegador para imprimirla o guardarla en PDF y enviarla por WhatsApp al paciente.`);
  console.log('===================================================================\n');
}

// 4. INFORME CLÍNICO PARA HISTORIA CLÍNICA
function generateReport(targetUser) {
  const db = getDatabase();
  const user = findUser(targetUser, db);

  if (!user) {
    console.error(`\n❌ Paciente "${targetUser}" no encontrado.\n`);
    process.exit(1);
  }

  const state = getUserState(user.id);
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
    console.log('\nESTADO DE ADHERENCIA: Sin registros aún. Reforzar motivación y micro-hábitos.');
  }
  console.log('=========================================================================\n');
}

// MAIN
const args = process.argv.slice(2);
const command = args[0];

switch (command) {
  case 'list':
  case 'pacientes':
    listPatients();
    break;
  case 'invite':
  case 'invitar':
    if (!args[1]) {
      console.log('Uso: node clinical/clinical-manager.mjs invite <Nombre Paciente> [nivel0 | nivel1 | postural]');
    } else {
      createInvite(args[1], args[2] || 'nivel0');
    }
    break;
  case 'assign':
  case 'prescribir':
    if (!args[1] || !args[2]) {
      console.log('Uso: node clinical/clinical-manager.mjs assign <paciente> <nivel0 | nivel1 | postural>');
    } else {
      assignArchetype(args[1], args[2]);
    }
    break;
  case 'report':
  case 'informe':
    if (!args[1]) {
      console.log('Uso: node clinical/clinical-manager.mjs report <paciente>');
    } else {
      generateReport(args[1]);
    }
    break;
  default:
    console.log('\n🩺 openGym Clinical Manager');
    console.log('Comandos disponibles:');
    console.log('  node clinical/clinical-manager.mjs list');
    console.log('  node clinical/clinical-manager.mjs invite <Nombre Paciente> [nivel0|nivel1|postural]');
    console.log('  node clinical/clinical-manager.mjs assign <usuario> <nivel0|nivel1|postural>');
    console.log('  node clinical/clinical-manager.mjs report <usuario>\n');
    break;
}
