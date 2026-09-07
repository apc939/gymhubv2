// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CardioLogSheet from './CardioLogSheet.jsx'
import { useStore, DEF } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const clone = o => JSON.parse(JSON.stringify(o))
const mounted = []

function type(el, value) {
  Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value').set.call(el, value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.dispatchEvent(new Event('change', { bubbles: true }))
}

function renderCardio(props = {}) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  mounted.push(root)
  act(() => root.render(<CardioLogSheet {...props} />))
  return { host, root }
}

describe('CardioLogSheet component', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    useStore.setState({ S: clone(DEF), user: null })
    useUI.setState({ sheets: [], toastMsg: '' })
  })

  afterEach(() => {
    act(() => { mounted.splice(0).forEach(root => root.unmount()) })
    document.body.innerHTML = ''
  })

  it('renders default activity and minutes without prescription', () => {
    const { host } = renderCardio()
    expect(host.textContent).toContain('Registrar Cardio Realizado')
    expect(host.textContent).toContain('Caminata')
    const input = host.querySelector('input[type="number"]')
    expect(input.value).toBe('30')
  })

  it('pre-populates activity and minutes from prescription', () => {
    const prescription = {
      type: 'Natación',
      targetMinutes: 45,
      frequencyPerWeek: 3
    }
    const { host } = renderCardio({ prescription })
    expect(host.textContent).toContain('Natación')
    const input = host.querySelector('input[type="number"]')
    expect(input.value).toBe('45')
  })

  it('MUST NOT include pain tracking (articular pain / molestia)', () => {
    const { host } = renderCardio()
    const text = host.textContent.toLowerCase()
    expect(text).not.toContain('cero dolor')
    expect(text).not.toContain('sentí molestia')
    expect(text).not.toContain('zona articular')
    expect(text).not.toContain('rodilla')
    expect(text).not.toContain('zona lumbar')
  })

  it('allows stepping minutes up and down', () => {
    const { host } = renderCardio()
    const input = host.querySelector('input[type="number"]')
    const buttons = [...host.querySelectorAll('button')]
    const minusBtn = buttons.find(b => b.textContent.trim() === '-5')
    const plusBtn = buttons.find(b => b.textContent.trim() === '+5')

    act(() => { plusBtn.click() })
    expect(input.value).toBe('35')

    act(() => { minusBtn.click() })
    expect(input.value).toBe('30')
  })

  it('allows selecting different effort scales (easy, good, hard)', () => {
    const { host } = renderCardio()
    const buttons = [...host.querySelectorAll('button')]
    const hardBtn = buttons.find(b => b.textContent.includes('Muy exigente'))
    const easyBtn = buttons.find(b => b.textContent.includes('Fácil / Ligero'))

    expect(hardBtn).toBeDefined()
    expect(easyBtn).toBeDefined()

    act(() => { hardBtn.click() })
    expect(hardBtn.className).toContain('on')
    expect(hardBtn.getAttribute('data-effort')).toBe('hard')

    act(() => { easyBtn.click() })
    expect(easyBtn.className).toContain('on')
    expect(easyBtn.getAttribute('data-effort')).toBe('easy')
  })

  it('allows custom activity via "Otro..." chip', () => {
    const close = vi.fn()
    const { host } = renderCardio({ close })
    const chips = [...host.querySelectorAll('.chip')]
    const otherChip = chips.find(c => c.textContent.includes('Otro...'))
    expect(otherChip).toBeDefined()

    act(() => { otherChip.click() })

    const textInput = host.querySelector('input[placeholder*="Nombre de la actividad"]')
    expect(textInput).not.toBeNull()

    act(() => {
      type(textInput, 'Remo Ergómetro')
    })

    const saveBtn = [...host.querySelectorAll('button')].find(b => b.textContent.includes('Guardar Registro'))
    act(() => { saveBtn.click() })

    const logs = useStore.getState().S.cardioLogs
    expect(logs).toHaveLength(1)
    expect(logs[0].type).toBe('Remo Ergómetro')
  })

  it('saves cardio log to S.cardioLogs and invokes close callback', () => {
    const close = vi.fn()
    const prescription = { type: 'Bicicleta', targetMinutes: 25 }
    const { host } = renderCardio({ close, prescription })

    const buttons = [...host.querySelectorAll('button')]
    const saveBtn = buttons.find(b => b.textContent.includes('Guardar Registro'))

    act(() => { saveBtn.click() })

    const logs = useStore.getState().S.cardioLogs
    expect(logs).toHaveLength(1)
    expect(logs[0].type).toBe('Bicicleta')
    expect(logs[0].minutes).toBe(25)
    expect(logs[0].effort).toBe('good')
    expect(logs[0].date).toBeDefined()
    expect(logs[0].ts).toBeDefined()
    expect(logs[0].id).toMatch(/^c_/)
    expect(logs[0].pain).toBeUndefined() // No pain field in cardio log!

    expect(close).toHaveBeenCalledTimes(1)
    expect(useUI.getState().toastMsg).toContain('Bicicleta')
  })

  it('rejects saving when "Otro..." is selected but custom name is empty', () => {
    const close = vi.fn()
    const { host } = renderCardio({ close })
    const chips = [...host.querySelectorAll('.chip')]
    const otherChip = chips.find(c => c.textContent.includes('Otro...'))
    act(() => { otherChip.click() })

    const saveBtn = [...host.querySelectorAll('button')].find(b => b.textContent.includes('Guardar Registro'))
    act(() => { saveBtn.click() })

    expect(useStore.getState().S.cardioLogs).toHaveLength(0)
    expect(close).not.toHaveBeenCalled()
    expect(useUI.getState().toastMsg).toContain('indica el nombre')
  })

  it('validates minutes and clamps +5 stepper to max 300', () => {
    const close = vi.fn()
    const { host } = renderCardio({ close })
    const input = host.querySelector('input[type="number"]')
    const buttons = [...host.querySelectorAll('button')]
    const plusBtn = buttons.find(b => b.textContent.trim() === '+5')
    const saveBtn = buttons.find(b => b.textContent.includes('Guardar Registro'))

    // Set to 298 and step +5
    act(() => { type(input, '298') })
    act(() => { plusBtn.click() })
    expect(input.value).toBe('300') // clamped to 300

    // Set invalid 0 minutes
    act(() => { type(input, '0') })
    act(() => { saveBtn.click() })
    expect(useStore.getState().S.cardioLogs).toHaveLength(0)
    expect(close).not.toHaveBeenCalled()
    expect(useUI.getState().toastMsg).toContain('duración válida')
  })
})

