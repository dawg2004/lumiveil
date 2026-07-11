'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [message, setMessage] = useState('')
  const [isError, setIsError] = useState(false)
  const [loading, setLoading] = useState(false)
  const [ready, setReady] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    // Supabase redirects here with a session in the URL hash; getSession picks it up
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setReady(true)
      } else {
        setIsError(true)
        setMessage('リンクが無効または期限切れです。再度パスワードリセットをお試しください。')
      }
    })
  }, [])

  const handleSubmit = async () => {
    if (!password) {
      setIsError(true)
      setMessage('新しいパスワードを入力してください。')
      return
    }
    if (password !== confirmPassword) {
      setIsError(true)
      setMessage('パスワードが一致しません。')
      return
    }
    setLoading(true)
    setMessage('')
    setIsError(false)

    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      setIsError(true)
      setMessage(error.message)
    } else {
      setMessage('パスワードを更新しました。ログインページに移動します。')
      setTimeout(() => router.push('/login'), 2000)
    }
    setLoading(false)
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0a0e1a',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
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
          <div style={{ color: '#64748b', fontSize: '14px' }}>新しいパスワードを設定</div>
        </div>

        {message && (
          <div style={{ color: isError ? '#f87171' : '#6ee7a0', fontSize: '13px', marginBottom: '16px', textAlign: 'center' }}>
            {message}
          </div>
        )}

        {ready && (
          <>
            <div style={{ marginBottom: '16px', position: 'relative' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="新しいパスワード"
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
                onClick={() => setShowPassword(v => !v)}
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

            <div style={{ marginBottom: '24px' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="パスワード（確認）"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
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
              {loading ? '処理中...' : 'パスワードを更新'}
            </button>
          </>
        )}

        <div style={{ textAlign: 'center', marginTop: '16px' }}>
          <button
            onClick={() => router.push('/login')}
            style={{ background: 'none', border: 'none', color: '#c9a84c', cursor: 'pointer', fontSize: '13px' }}
          >
            ログインに戻る
          </button>
        </div>
      </div>
    </div>
  )
}
