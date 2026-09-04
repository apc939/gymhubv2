import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { webauthnOK, passkeyLogin, passkeyRegister, BIO } from '../lib/api.js'
import { hasData } from '../store/useStore.js'
import { t } from '../lib/i18n.js'
import { DEMO, REPO } from '../lib/demo.js'
import { guestAllowed } from '../lib/guest.js'
import { useState, useRef, useEffect } from 'react'
import Icon from '../components/Icon.jsx'
import { Button } from '../components/ui.jsx'

function getInviteParams() {
  try {
    const p1 = new URLSearchParams(window.location.search);
    let code = p1.get('code') || '';
    let name = p1.get('name') || '';
    if (!code && window.location.hash.includes('?')) {
      const p2 = new URLSearchParams(window.location.hash.split('?')[1]);
      code = p2.get('code') || '';
      if (!name) name = p2.get('name') || '';
    }
    return { code: code.trim().toUpperCase(), name: name.trim() };
  } catch {
    return { code: '', name: '' };
  }
}

function RegisterSheet({ close, initialName = '', initialCode = '' }) {
  const { setUser, pushState, pullState, loadConfig } = useStore()
  const config = useStore(s => s.config)
  const [name, setName] = useState(initialName)
  const [code, setCode] = useState(initialCode)
  const inviteOnly = !!config?.invite_only
  const ref = useRef(null)
  useEffect(() => { setTimeout(() => ref.current?.focus(), 250) }, [])
  // Boot already fetched this; retry here only if that attempt failed, so the invite field still
  // appears on an instance whose config arrived late rather than never.
  useEffect(() => { loadConfig() }, [loadConfig])
  const go = async () => {
    const n = name.trim()
    if (!n) { useUI.getState().toast(t('Enter a name')); return }
    if (inviteOnly && !code.trim()) { useUI.getState().toast(t('An invite code is required')); return }
    try {
      const u = await passkeyRegister(n, code.trim())
      setUser(u); close()
      if (code.trim()) {
        // Patient registering via invite code: always pull the clinical prescription from the server
        localStorage.removeItem('gym_state_v1')
        localStorage.removeItem('gym_dirty')
        await pullState(true)
        useUI.getState().toast(t('Welcome, {0}', u.name))
      } else if (hasData(useStore.getState().S)) {
        await pushState()
        useUI.getState().toast(t('Profile created — data from this device moved into it'))
      } else {
        await pullState(true)
        useUI.getState().toast(t('Welcome, {0}', u.name))
      }
    } catch (e) { if (e.name !== 'NotAllowedError' && e.name !== 'AbortError') useUI.getState().toast(e.message || t('Registration failed')) }
  }
  return <>
    <h3>{t('Create your profile')}</h3>
    <div className="muted small" style={{ marginBottom: 14 }}>{t('Pick a name, then confirm with {0}. The passkey is saved in your device — no password needed.', BIO)}</div>
    {code && (
      <div style={{
        background: 'color-mix(in srgb, var(--green) 12%, transparent)',
        border: '1px solid var(--green)',
        borderRadius: 10,
        padding: '10px 14px',
        marginBottom: 14,
        fontSize: 13
      }}>
        <div style={{ fontWeight: 600, color: 'var(--green)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>🩺</span> <span>{t('Prescripción médica detectada')}</span>
        </div>
        <div className="dim small" style={{ marginTop: 3 }}>
          {t('Tu plan de ejercicio personalizado se cargará automáticamente.')}
        </div>
      </div>
    )}
    <input ref={ref} className="input" placeholder={t('Your name')} maxLength={40} value={name} onChange={e => setName(e.target.value)} />
    {inviteOnly && <>
      <div style={{ height: 10 }} />
      <input className="input" placeholder={t('Invite code')} maxLength={40} value={code}
        onChange={e => setCode(e.target.value.toUpperCase())} style={{ letterSpacing: '.14em', fontWeight: 600, textAlign: 'center' }} />
      <div className="dim small" style={{ marginTop: 6 }}>{t('This app is invite-only — enter the code you were given.')}</div>
    </>}
    <div style={{ height: 12 }} />
    <Button variant="primary" onClick={go}>{t('Create passkey')}</Button>
  </>
}

export default function Login() {
  const { setUser, pullState, setGuest } = useStore()
  const config = useStore(s => s.config)
  const canGuest = guestAllowed(config)

  useEffect(() => {
    const { code, name } = getInviteParams();
    if (code || name) {
      setTimeout(() => {
        useUI.getState().openSheet(close => <RegisterSheet close={close} initialName={name} initialCode={code} />);
      }, 150);
    }
  }, []);
  const signIn = async () => {
    try {
      const u = await passkeyLogin()
      setUser(u)
      await pullState(true)
      useUI.getState().toast(t('Welcome back, {0}', u.name))
    }
    catch (e) { if (e.name !== 'NotAllowedError' && e.name !== 'AbortError') useUI.getState().toast(e.message || t('Sign-in failed')) }
  }
  const head = <>
    <div style={{ fontSize: 84, display: 'flex', justifyContent: 'center', color: 'var(--acc)', filter: 'drop-shadow(0 6px 24px var(--acc-soft))', transition: 'all var(--med) var(--ease)', marginTop: 12, marginBottom: -4 }}>
      <Icon name="dumbbell" />
    </div>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, margin: '4px 0 4px' }}>
      <img src="/brand-logo-128.png" alt="GymHub" style={{ width: 56, height: 56, borderRadius: '50%', objectFit: 'contain' }} />
      <h1 style={{ fontSize: 34, fontWeight: 700, letterSpacing: '-.028em', margin: 0 }}>GymHub</h1>
    </div>
    <div style={{ fontSize: 13, color: 'var(--label-2)', marginBottom: 4 }}>by @medandresparra</div>
  </>
  const wrap = { display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: '78vh', textAlign: 'center' }

  // Demo build: no backend to sign in against — the only way in is the local guest profile.
  if (DEMO) return (
    <div className="narrow" style={wrap}>
      {head}
      <div className="muted" style={{ marginBottom: 30 }}>{t('Live demo — everything stays in this browser.')}</div>
      <Button variant="primary" icon="sparkles" onClick={() => setGuest(true)}>{t('Start the demo')}</Button>
      <div className="card small muted" style={{ textAlign: 'left', marginTop: 16 }}>
        {t('This demo runs entirely in your browser on example data — nothing is sent anywhere. Passkey sign-in and sync across your devices come with the openGym server, which you get by self-hosting it.')}
      </div>
      <div className="dim small" style={{ marginTop: 22, lineHeight: 1.6 }}>
        <div>{t('Based on openGym by Duarte Santos · Free & open source (AGPL v3)')}</div>
        <a href={REPO} target="_blank" rel="noopener">{t('Source code & self-hosting →')}</a>
      </div>
    </div>
  )

  return (
    <div className="narrow" style={wrap}>
      {head}
      <div className="muted" style={{ marginBottom: 34 }}>{t('Your workouts. Your weights. Your profile.')}</div>
      {webauthnOK() ? <>
        <Button variant="primary" icon="person" onClick={signIn}>{t('Sign in with passkey')}</Button>
        <div style={{ height: 10 }} />
        <Button icon="sparkles" onClick={() => useUI.getState().openSheet(close => <RegisterSheet close={close} />)}>{t('Create new profile')}</Button>
        {canGuest && <div style={{ height: 10 }} />}
      </> : <div className="card small muted" style={{ textAlign: 'left' }}>{canGuest
        ? t("This browser doesn't support passkeys — you can still use openGym locally on this device.")
        // Without passkeys and without the guest entrance there is no way in from this browser,
        // so say that plainly instead of offering a local profile that cannot be created.
        : t("This browser doesn't support passkeys, and this instance requires an account. Try a browser or device with passkey support.")}</div>}
      {canGuest && <Button variant="ghost" className="dim" onClick={() => setGuest(true)}>{t('Continue without account')}</Button>}
      <div className="dim small" style={{ marginTop: 26, lineHeight: 1.5 }}>
        {t('Passkeys use {0} — no passwords.', BIO)}<br />
        {t('Each profile keeps its own plan, workouts & body weight.')}
        <div style={{ marginTop: 16, opacity: .8, fontSize: 11 }}>
          {t('Based on openGym by Duarte Santos · Free & open source (AGPL v3)')}<br />
          <a href={REPO} target="_blank" rel="noopener">{t('Source code')}</a>
        </div>
      </div>
    </div>
  )
}
