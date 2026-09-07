import { useState, useRef } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { todayISO } from '../lib/format.js'
import { useSheetKeyboard } from '../lib/use-sheet-keyboard.js'
import Icon from './Icon.jsx'
import { Button } from './ui.jsx'

const PAIN_AREAS = [
  'Rodilla',
  'Zona Lumbar',
  'Hombro',
  'Cadera',
  'Tobillo',
  'Cuello / Cervical',
  'Codo / Muñeca',
  'Espalda alta / Dorsal'
]

export default function PainLogSheet({ close }) {
  const update = useStore(s => s.update)
  const toast = useUI(s => s.toast)
  const sheetRef = useRef(null)
  const onFocus = useSheetKeyboard(sheetRef)

  const [hasPain, setHasPain] = useState(false)
  const [painArea, setPainArea] = useState(PAIN_AREAS[0])
  const [customArea, setCustomArea] = useState('')
  const [isCustomArea, setIsCustomArea] = useState(false)
  const [intensity, setIntensity] = useState('leve') // 'leve' | 'moderada' | 'intensa'
  const [notes, setNotes] = useState('')

  const handleSave = () => {
    if (hasPain && isCustomArea && !customArea.trim()) {
      toast('Por favor, indica la zona anatómica de la molestia')
      return
    }

    const selectedZone = hasPain
      ? (isCustomArea && customArea.trim() ? customArea.trim() : (painArea || 'Zona articular'))
      : null

    const log = {
      id: 'p_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      date: todayISO(),
      ts: Date.now(),
      pain: hasPain,
      level: hasPain ? intensity : 0,
      area: selectedZone,
      notes: hasPain && notes.trim() ? notes.trim() : null
    }

    update(s => {
      s.painLogs = s.painLogs || []
      s.painLogs.push(log)
    })

    if (hasPain) {
      toast(`Molestia (${selectedZone}) registrada para seguimiento clínico.`)
    } else {
      toast('¡Excelente! Registro de Cero Dolor guardado.')
    }
    close?.()
  }

  return (
    <div ref={sheetRef} onFocus={onFocus} style={{ textAlign: 'left', padding: '6px 0' }}>
      <div className="row between" style={{ marginBottom: 12 }}>
        <div>
          <h3 style={{ margin: 0 }}>Reporte Diario de Dolor y Molestias</h3>
          <div className="dim small" style={{ marginTop: 2 }}>
            Monitoreo clínico para adaptar tus cargas y ejercicios
          </div>
        </div>
        {close && (
          <button
            type="button"
            className="iconbtn"
            onClick={close}
            aria-label="Cerrar"
            style={{ width: 32, height: 32 }}
          >
            <Icon name="xmark" />
          </button>
        )}
      </div>

      {/* Selector principal: Cero dolor vs Sentí molestia */}
      <label className="small muted" style={{ display: 'block', marginBottom: 8, fontWeight: 600 }}>
        ¿Cómo te sientes hoy?
      </label>
      <div className="row" style={{ gap: 10, marginBottom: hasPain ? 16 : 20 }}>
        <button
          type="button"
          className={'btn' + (!hasPain ? ' on' : '')}
          data-pain="none"
          style={{
            flex: 1, padding: '14px 10px', fontSize: 14, fontWeight: 600,
            border: !hasPain ? '2px solid var(--green)' : '1px solid var(--sep)',
            background: !hasPain ? 'color-mix(in srgb, var(--green) 14%, transparent)' : 'var(--surface-2)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4
          }}
          onClick={() => { setHasPain(false); setIsCustomArea(false) }}
        >
          <span style={{ fontSize: 24 }}>🟢</span>
          <span>Cero Dolor</span>
          <span className="dim small" style={{ fontSize: 11, fontWeight: 400 }}>Sin molestias hoy</span>
        </button>

        <button
          type="button"
          className={'btn' + (hasPain ? ' on' : '')}
          data-pain="present"
          style={{
            flex: 1, padding: '14px 10px', fontSize: 14, fontWeight: 600,
            border: hasPain ? '2px solid var(--orange)' : '1px solid var(--sep)',
            background: hasPain ? 'color-mix(in srgb, var(--orange) 14%, transparent)' : 'var(--surface-2)',
            color: hasPain ? 'var(--orange)' : 'inherit',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4
          }}
          onClick={() => {
            setHasPain(true)
            if (!painArea) setPainArea(PAIN_AREAS[0])
          }}
        >
          <span style={{ fontSize: 24 }}>⚠️</span>
          <span>Molestia o Dolor</span>
          <span className="dim small" style={{ fontSize: 11, fontWeight: 400 }}>Siento dolor en alguna zona</span>
        </button>
      </div>

      {/* Detalles si hay molestia */}
      {hasPain ? (
        <div style={{ marginBottom: 18 }}>
          {/* Zona de la molestia */}
          <label className="small muted" style={{ display: 'block', marginBottom: 6, fontWeight: 600 }}>
            Zona anatómica de la molestia:
          </label>
          <div className="chips" style={{ marginBottom: 10 }}>
            {PAIN_AREAS.map(a => (
              <button
                key={a}
                type="button"
                className={'chip' + (!isCustomArea && painArea === a ? ' on' : '')}
                onClick={() => { setPainArea(a); setIsCustomArea(false) }}
              >
                {a}
              </button>
            ))}
            <button
              type="button"
              className={'chip' + (isCustomArea ? ' on' : '')}
              onClick={() => setIsCustomArea(true)}
            >
              Otra zona...
            </button>
          </div>

          {isCustomArea && (
            <div style={{ marginBottom: 14 }}>
              <input
                type="text"
                className="input"
                placeholder="Especifica la zona (ej. Isquiotibial izquierdo)"
                value={customArea}
                onChange={e => setCustomArea(e.target.value)}
                style={{ width: '100%' }}
                autoFocus
              />
            </div>
          )}

          {/* Intensidad */}
          <label className="small muted" style={{ display: 'block', marginBottom: 6, fontWeight: 600 }}>
            Intensidad de la molestia:
          </label>
          <div className="row" style={{ gap: 8, marginBottom: 16 }}>
            <button
              type="button"
              className={'btn' + (intensity === 'leve' ? ' on' : '')}
              data-intensity="leve"
              style={{
                flex: 1, padding: '9px 4px', fontSize: 12, fontWeight: 600,
                border: intensity === 'leve' ? '2px solid var(--yellow, #eab308)' : '1px solid var(--sep)',
                background: intensity === 'leve' ? 'color-mix(in srgb, var(--yellow, #eab308) 16%, transparent)' : 'var(--surface-2)'
              }}
              onClick={() => setIntensity('leve')}
            >
              🟡 Leve
            </button>
            <button
              type="button"
              className={'btn' + (intensity === 'moderada' ? ' on' : '')}
              data-intensity="moderada"
              style={{
                flex: 1, padding: '9px 4px', fontSize: 12, fontWeight: 600,
                border: intensity === 'moderada' ? '2px solid var(--orange)' : '1px solid var(--sep)',
                background: intensity === 'moderada' ? 'color-mix(in srgb, var(--orange) 16%, transparent)' : 'var(--surface-2)'
              }}
              onClick={() => setIntensity('moderada')}
            >
              🟠 Moderada
            </button>
            <button
              type="button"
              className={'btn' + (intensity === 'intensa' ? ' on' : '')}
              data-intensity="intensa"
              style={{
                flex: 1, padding: '9px 4px', fontSize: 12, fontWeight: 600,
                border: intensity === 'intensa' ? '2px solid var(--red)' : '1px solid var(--sep)',
                background: intensity === 'intensa' ? 'color-mix(in srgb, var(--red) 16%, transparent)' : 'var(--surface-2)'
              }}
              onClick={() => setIntensity('intensa')}
            >
              🔴 Intensa
            </button>
          </div>

          {/* Notas opcionales */}
          <label className="small muted" style={{ display: 'block', marginBottom: 6, fontWeight: 600 }}>
            Detalles adicionales (opcional):
          </label>
          <input
            type="text"
            className="input"
            placeholder="Ej. Apareció al terminar de entrenar"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            style={{ width: '100%', marginBottom: 16 }}
          />
        </div>
      ) : (
        <div style={{
          padding: '12px 14px',
          background: 'color-mix(in srgb, var(--green) 8%, transparent)',
          borderRadius: 'var(--r-card, 12px)',
          border: '1px solid color-mix(in srgb, var(--green) 25%, transparent)',
          marginBottom: 18
        }}>
          <div className="small" style={{ color: 'var(--green)', fontWeight: 600 }}>
            ✓ Sin molestias reportadas
          </div>
          <div className="dim small" style={{ marginTop: 2 }}>
            Tu reporte ayuda a registrar la tolerancia al entrenamiento y recuperación adecuada.
          </div>
        </div>
      )}

      <Button
        variant="primary"
        onClick={handleSave}
        style={{ width: '100%', height: 48, fontSize: 16 }}
      >
        Guardar Reporte
      </Button>
    </div>
  )
}

export function painLogSheet() {
  return useUI.getState().openSheet(close => <PainLogSheet close={close} />)
}
