// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Home from './Home.jsx'
import { useStore, DEF } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { todayISO } from '../lib/format.js'
import { t } from '../lib/i18n.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn()
}))

const clone = o => JSON.parse(JSON.stringify(o))
const mounted = []

function renderHome() {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  mounted.push(root)
  act(() => root.render(<Home />))
  return { host, root }
}

describe('Home view with Cardio and Pain logging', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    useStore.setState({ S: clone(DEF), user: null })
    useUI.setState({ sheets: [], toastMsg: '' })
  })

  afterEach(() => {
    act(() => { mounted.splice(0).forEach(root => root.unmount()) })
    document.body.innerHTML = ''
  })

  it('renders weekly cardio progress section with default prescription', () => {
    const { host } = renderHome()
    expect(host.textContent).toContain(t('Cardiorespiratory Exercise'))
    expect(host.textContent).toContain(t('Weekly minutes progress'))
    // Default: 120 min target
    expect(host.textContent).toContain('0 / 120 min')
  })

  it('reflects logged cardio minutes in weekly progress', () => {
    const state = clone(DEF)
    state.cardioPrescription = {
      type: 'Elíptica',
      targetMinutes: 20,
      frequencyPerWeek: 4,
      note: 'Mantener pulsaciones moderadas'
    }
    state.cardioLogs = [
      { id: 'c1', type: 'Elíptica', minutes: 20, effort: 'good', date: todayISO(), ts: Date.now() },
      { id: 'c2', type: 'Elíptica', minutes: 25, effort: 'good', date: todayISO(), ts: Date.now() }
    ]
    useStore.setState({ S: state })

    const { host } = renderHome()
    // 20 min * 4 days = 80 min target; 20 + 25 = 45 min completed
    expect(host.textContent).toContain('45 / 80 min')
    expect(host.textContent).toContain('Mantener pulsaciones moderadas')
  })

  it('renders distinct shortcut/button to open PainLogSheet', () => {
    const { host } = renderHome()
    expect(host.textContent).toContain(t('Clinical tracking'))
    expect(host.textContent).toContain(t('Report Pain or Discomfort'))

    const buttons = [...host.querySelectorAll('button')]
    const reportBtn = buttons.find(b => b.textContent.trim() === t('Report'))
    expect(reportBtn).toBeDefined()

    act(() => { reportBtn.click() })

    // Check that a sheet was opened in useUI
    expect(useUI.getState().sheets).toHaveLength(1)
  })

  it('displays today status if pain log exists', () => {
    const state = clone(DEF)
    state.painLogs = [
      { id: 'p1', date: todayISO(), pain: true, area: 'Rodilla', level: 'moderada', notes: '' }
    ]
    useStore.setState({ S: state })

    const { host } = renderHome()
    expect(host.textContent).toContain(`${t('Discomfort')}: Rodilla`)
  })

  it('opens CardioLogSheet when clicking cardio Log button', () => {
    const { host } = renderHome()
    const cardioCard = [...host.querySelectorAll('.card')].find(c =>
      c.textContent.includes(t('Cardiorespiratory Exercise'))
    )
    expect(cardioCard).toBeDefined()

    const logBtn = cardioCard.querySelector('button')
    expect(logBtn).toBeDefined()

    act(() => { logBtn.click() })

    expect(useUI.getState().sheets).toHaveLength(1)
  })

  it('handles partial cardio prescription gracefully without displaying undefined min', () => {
    const state = clone(DEF)
    state.cardioPrescription = {
      type: 'Remo'
      // targetMinutes and frequencyPerWeek are deliberately omitted
    }
    useStore.setState({ S: state })

    const { host } = renderHome()
    expect(host.textContent).toContain(t('Cardiorespiratory Exercise'))
    expect(host.textContent).not.toContain('undefined min')
    expect(host.textContent).toContain('0 / 120 min')
  })

  it('maintains distinct Report button and picks chronologically latest pain entry for today', () => {
    const state = clone(DEF)
    state.painLogs = [
      { id: 'p1', date: todayISO(), ts: 1000, pain: false, area: null },
      { id: 'p2', date: todayISO(), ts: 2000, pain: true, area: 'Hombro', level: 'leve' }
    ]
    useStore.setState({ S: state })

    const { host } = renderHome()
    expect(host.textContent).toContain(`${t('Discomfort')}: Hombro`)

    // Distinct report button must still be available even when pain was already reported today
    const buttons = [...host.querySelectorAll('button')]
    const reportBtn = buttons.find(b => b.textContent.trim() === t('Report'))
    expect(reportBtn).toBeDefined()

    act(() => { reportBtn.click() })
    expect(useUI.getState().sheets).toHaveLength(1)
  })
})

