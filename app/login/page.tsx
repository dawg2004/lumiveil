'use client'

import { Suspense, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter, useSearchParams } from 'next/navigation'

type Mode = 'login' | 'signup' | 'reset'

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  )
}

function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [mode, setMode] = useState<Mode>('login')
  const [message, setMessage] = useState('')
  const [isError, setIsError] = useState(false)
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

  useEffect(() => {
    const incoming = searchParams.get('message')
    if (incoming) {
      setIsError(true)
      setMessage(incoming)
    }
  }, [searchParams])

  const handleSubmit = async () => {
    setLoading(true)
    setMessage('')
    setIsError(false)

    if (mode === 'signup') {
      const { error } = await supabase.auth.signUp({ email, password })
      if (error) { setIsError(true); setMessage(error.message) }
      else setMessage('確認メールを送信しました。メールをご確認ください。')
    } else if (mode === 'reset') {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      })
      if (error) { setIsError(true); setMessage(error.message) }
      else setMessage('パスワードリセット用のメールを送信しました。メールをご確認ください。')
    } else {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) { setIsError(true); setMessage(error.message) }
      else {
        const token = data.session?.access_token
        if (token) {
          try {
            await fetch('/api/session/touch', { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
          } catch {
            // 端末登録に失敗してもログイン自体はブロックしない
          }
        }
        router.push('/')
      }
    }
    setLoading(false)
  }

  const title = mode === 'signup' ? 'アカウント作成' : mode === 'reset' ? 'パスワード再発行' : 'ログイン'

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0a0e1a',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '20px',
      fontFamily: 'var(--font-lumiveil-sans)',
    }}>
      <div style={{
        background: '#111827',
        border: '1px solid #1e293b',
        borderRadius: '12px',
        padding: '48px',
        width: '100%',
        maxWidth: '400px',
      }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{ color: '#c9a84c', fontSize: '24px', fontWeight: 500, letterSpacing: '0.08em', marginBottom: '8px' }}>
            ✦ LUMIVEIL
          </div>
          <div style={{ color: '#64748b', fontSize: '14px' }}>{title}</div>
        </div>

        <div style={{ marginBottom: '16px' }}>
          <input
            type="email"
            placeholder="メールアドレス"
            value={email}
            onChange={e => setEmail(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') void handleSubmit() }}
            style={{
              width: '100%',
              padding: '12px 16px',
              background: '#1e293b',
              border: '1px solid #334155',
              borderRadius: '8px',
              color: '#fff',
              fontSize: '14px',
              boxSizing: 'border-box',
            }}
          />
        </div>

        {mode !== 'reset' && (
          <div style={{ marginBottom: '24px', position: 'relative' }}>
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="パスワード"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') void handleSubmit() }}
              style={{
                width: '100%',
                padding: '12px 76px 12px 16px',
                background: '#1e293b',
                border: '1px solid #334155',
                borderRadius: '8px',
                color: '#fff',
                fontSize: '14px',
                boxSizing: 'border-box',
              }}
            />
            <button
              type="button"
              onClick={() => setShowPassword(current => !current)}
              aria-label={showPassword ? 'パスワードを隠す' : 'パスワードを表示'}
              style={{
                position: 'absolute',
                right: '8px',
                top: '50%',
                transform: 'translateY(-50%)',
                padding: '6px 9px',
                borderRadius: '7px',
                border: '1px solid #334155',
                background: showPassword ? '#c9a84c' : 'rgba(255,255,255,0.04)',
                color: showPassword ? '#0a0e1a' : '#cbd5e1',
                fontSize: '12px',
                fontWeight: 500,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {showPassword ? '隠す' : '表示'}
            </button>
          </div>
        )}

        {message && (
          <div style={{ color: isError ? '#f87171' : '#6ee7a0', fontSize: '13px', marginBottom: '16px', textAlign: 'center' }}>
            {message}
          </div>
        )}

        <button
          onClick={() => void handleSubmit()}
          disabled={loading}
          style={{
            width: '100%',
            padding: '12px',
            background: '#c9a84c',
            border: 'none',
            borderRadius: '8px',
            color: '#0a0e1a',
            fontSize: '15px',
            fontWeight: 500,
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? '処理中...' : mode === 'signup' ? 'アカウント作成' : mode === 'reset' ? 'リセットメール送信' : 'ログイン'}
        </button>

        <div style={{ textAlign: 'center', marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {mode === 'login' && (
            <>
              <button
                onClick={() => { setMode('reset'); setMessage('') }}
                style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '12px' }}
              >
                パスワードを忘れた方はこちら
              </button>
              <button
                onClick={() => { setMode('signup'); setMessage('') }}
                style={{ background: 'none', border: 'none', color: '#c9a84c', cursor: 'pointer', fontSize: '13px' }}
              >
                アカウントをお持ちでない方はこちら
              </button>
            </>
          )}
          {mode !== 'login' && (
            <button
              onClick={() => { setMode('login'); setMessage('') }}
              style={{ background: 'none', border: 'none', color: '#c9a84c', cursor: 'pointer', fontSize: '13px' }}
            >
              ログインに戻る
            </button>
          )}
        </div>
      </div>

      <a
        href="/admin-login"
        style={{
          display: 'inline-block',
          padding: '10px 20px',
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid #334155',
          borderRadius: '8px',
          color: '#94a3b8',
          fontSize: '13px',
          fontWeight: 500,
          textDecoration: 'none',
          letterSpacing: '0.04em',
        }}
      >
        管理者用ログイン
      </a>
    </div>
  )
}
