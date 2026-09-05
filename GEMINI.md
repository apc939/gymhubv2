# GEMINI.md

Este archivo contiene las directrices específicas para Gemini y otros agentes en el proyecto **GymHub by @medandresparra**.

## Protocolo de Eliminación de Usuarios por Chat

Cuando el usuario pida en el chat eliminar a un paciente o usuario de pruebas (por ejemplo: *"elimina a tal paciente"* o *"borra el usuario X"*):

1. **Procedimiento de Ejecución**:
   - Ejecutar en la terminal el comando del gestor clínico:
     ```bash
     node clinical/clinical-manager.mjs delete "<nombre_o_uid>"
     ```
   - Alternativamente, si se requiere llamada HTTP directa a la API de Railway:
     ```bash
     curl -s -X POST https://web-production-5a975.up.railway.app/api/admin/user/delete \
       -H "Content-Type: application/json" \
       -H "x-admin-key: gymhub-clinical-admin-2026" \
       -d '{"id": "<uid_o_nombre>"}'
     ```

2. **Salvaguardas Críticas**:
   - **NUNCA** eliminar el usuario de **Andrés Parra Charris** ni ningún usuario con rol `admin: true`.
   - La eliminación es en cascada completa: remueve el registro de usuario (`db.users`), credenciales WebAuthn (`db.creds`), tokens push (`db.subs`), invitaciones asociadas (`db.invites`) y el archivo de prescripción y entrenamientos (`state-<uid>.json`).
   - Tras la eliminación, ejecutar siempre `node clinical/clinical-manager.mjs list` para verificar el estado final limpio de los pacientes.
