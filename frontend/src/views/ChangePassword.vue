<template>
  <div class="login-page" id="change-password-page">
    <div class="login-bg">
      <img src="/Latar_belakang.png" alt="" class="bg-image" />
      <div class="bg-overlay"></div>
    </div>

    <div class="floating-particles">
      <span v-for="i in 12" :key="i" class="float-icon" :style="floatStyle(i)">
        {{ floatIcons[(i - 1) % floatIcons.length] }}
      </span>
    </div>

    <div class="grid-lines">
      <div class="grid-line gl-h gl-h1"></div>
      <div class="grid-line gl-h gl-h2"></div>
      <div class="grid-line gl-v gl-v1"></div>
      <div class="grid-line gl-v gl-v2"></div>
    </div>

    <div class="login-center">
      <div class="logo-section" :class="{ 'logo-loaded': mounted }">
        <div class="logo-glow"></div>
        <img src="/logo_white.png" alt="GMS Logo" class="login-logo" />
        <h1 class="brand-title">
          <span class="brand-gate">GATEWAYS</span>
          <span class="brand-sub">Management System</span>
        </h1>
      </div>

      <div class="login-card" :class="{ 'shake': shakeCard, 'card-loaded': mounted }">
        <div class="card-header">
          <h2 class="card-title">Ganti Password</h2>
          <p class="card-subtitle">Wajib mengganti temporary password akun Anda</p>
        </div>

        <Transition name="fade-slide">
          <div v-if="statusMsg" class="status-bar" :class="statusClass">
            <span class="status-icon">{{ statusIcon }}</span>
            <span class="text-xs leading-relaxed">{{ statusMsg }}</span>
          </div>
        </Transition>

        <!-- NIST Policy Hint Box -->
        <div class="policy-hint-card">
          <div class="policy-hint-header">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="hint-shield-icon">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
            <span class="policy-hint-title">Standar Keamanan Password (NIST SP 800-63B)</span>
          </div>
          <ul class="policy-hint-list">
            <li>Minimal <strong>15 karakter</strong> (maks. 128 karakter).</li>
            <li>Dapat menggunakan frasa kalimat, angka, simbol & spasi.</li>
            <li>Hindari kata sandi umum atau karakter tunggal berulang.</li>
          </ul>
        </div>

        <form class="login-form" @submit.prevent="handleChangePassword" id="change-password-form">
          <!-- Current Password -->
          <div class="form-group">
            <label for="input-current" class="input-label">Password Saat Ini</label>
            <div class="field" :class="{ 'field-active': focusCurrent }">
              <div class="field-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
              </div>
              <input
                id="input-current"
                v-model="formData.currentPassword"
                :type="showCurrent ? 'text' : 'password'"
                required
                autocomplete="current-password"
                placeholder="Masukkan password saat ini"
                @focus="focusCurrent = true"
                @blur="focusCurrent = false"
              />
              <button type="button" class="eye-btn" @click="showCurrent = !showCurrent" tabindex="-1" title="Tampilkan/sembunyikan password">
                <svg v-if="!showCurrent" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
                <svg v-else width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                  <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                  <line x1="1" y1="1" x2="23" y2="23"/>
                </svg>
              </button>
            </div>
          </div>

          <!-- New Password -->
          <div class="form-group">
            <div class="label-row">
              <label for="input-new" class="input-label">Password Baru</label>
              <span v-if="formData.newPassword" class="char-counter" :class="formData.newPassword.length >= 15 ? 'counter-ok' : 'counter-warn'">
                {{ formData.newPassword.length }} / 15 min
              </span>
            </div>
            <div class="field" :class="{ 'field-active': focusNew }">
              <div class="field-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
              </div>
              <input
                id="input-new"
                v-model="formData.newPassword"
                :type="showNew ? 'text' : 'password'"
                required
                autocomplete="new-password"
                placeholder="Minimal 15 karakter"
                @focus="focusNew = true"
                @blur="focusNew = false"
              />
              <button type="button" class="eye-btn" @click="showNew = !showNew" tabindex="-1" title="Tampilkan/sembunyikan password">
                <svg v-if="!showNew" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
                <svg v-else width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                  <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                  <line x1="1" y1="1" x2="23" y2="23"/>
                </svg>
              </button>
            </div>
          </div>

          <!-- Confirm Password -->
          <div class="form-group">
            <label for="input-confirm" class="input-label">Konfirmasi Password Baru</label>
            <div class="field" :class="{ 'field-active': focusConfirm }">
              <div class="field-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
              </div>
              <input
                id="input-confirm"
                v-model="formData.confirmPassword"
                :type="showConfirm ? 'text' : 'password'"
                required
                autocomplete="new-password"
                placeholder="Ketik ulang password baru"
                @focus="focusConfirm = true"
                @blur="focusConfirm = false"
              />
              <button type="button" class="eye-btn" @click="showConfirm = !showConfirm" tabindex="-1" title="Tampilkan/sembunyikan password">
                <svg v-if="!showConfirm" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
                <svg v-else width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                  <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                  <line x1="1" y1="1" x2="23" y2="23"/>
                </svg>
              </button>
            </div>
          </div>

          <div class="actions-wrapper">
            <button type="submit" class="btn-login" :disabled="isLoading" id="change-password-submit">
              <span v-if="isLoading" class="btn-loader">
                <span class="spinner"></span>
                <span>Memproses...</span>
              </span>
              <span v-else class="btn-content">
                <span>Simpan & Lanjutkan</span>
              </span>
            </button>

            <button type="button" class="btn-back-login" @click="handleBackToLogin" :disabled="isLoading" id="change-password-cancel">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M19 12H5M12 19l-7-7 7-7"/>
              </svg>
              <span>Batal & Kembali ke Login</span>
            </button>
          </div>
        </form>
      </div>

      <p class="login-footer">© 2026 PT Santos Jaya Abadi · Built by Rahmat Auliya</p>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/authStore'
import { useNotificationStore } from '../stores/notificationStore'
import api from '../services/api'

const router = useRouter()
const authStore = useAuthStore()
const notificationStore = useNotificationStore()

const mounted = ref(false)
const showCurrent = ref(false)
const showNew = ref(false)
const showConfirm = ref(false)
const isLoading = ref(false)
const shakeCard = ref(false)
const focusCurrent = ref(false)
const focusNew = ref(false)
const focusConfirm = ref(false)
const statusMsg = ref('')
const statusClass = ref('')
const statusIcon = ref('')

const formData = reactive({ currentPassword: '', newPassword: '', confirmPassword: '' })

const floatIcons = ['🚛', '📦', '🏗️', '⚓', '🚢', '🔧']

const floatStyle = (i) => {
  const left = 5 + ((i * 17) % 90)
  const delay = (i * 1.3) % 8
  const dur = 14 + (i % 5) * 3
  const size = 16 + (i % 4) * 4
  return {
    left: `${left}%`,
    animationDelay: `${delay}s`,
    animationDuration: `${dur}s`,
    fontSize: `${size}px`,
    opacity: 0.12 + (i % 3) * 0.04
  }
}

onMounted(() => {
  setTimeout(() => { mounted.value = true }, 100)
})

const handleChangePassword = async () => {
  if (formData.newPassword.length < 15) {
    statusMsg.value = 'Password baru minimal 15 karakter (standar keamanan NIST SP 800-63B)'
    statusClass.value = 'status-error'
    statusIcon.value = '❌'
    shakeCard.value = true
    setTimeout(() => { shakeCard.value = false }, 600)
    return
  }

  if (formData.newPassword !== formData.confirmPassword) {
    statusMsg.value = 'Password baru dan konfirmasi password tidak cocok'
    statusClass.value = 'status-error'
    statusIcon.value = '❌'
    shakeCard.value = true
    setTimeout(() => { shakeCard.value = false }, 600)
    return
  }

  isLoading.value = true
  statusMsg.value = ''

  try {
    await api.post('/auth/change-password', {
      currentPassword: formData.currentPassword,
      newPassword: formData.newPassword,
      confirmPassword: formData.confirmPassword
    })
    
    statusMsg.value = 'Password berhasil diubah!'
    statusClass.value = 'status-success'
    statusIcon.value = '✅'
    notificationStore.addNotification('Success', 'Password berhasil diubah', 'success')
    
    authStore.clearAuth()

    setTimeout(() => { 
      router.replace('/login?passwordChanged=1')
    }, 1200)
  } catch (err) {
    const errMsg = err.response?.data?.details?.[0] || err.response?.data?.message || err.gmsMessage || 'Gagal mengubah password'
    statusMsg.value = errMsg
    statusClass.value = 'status-error'
    statusIcon.value = '❌'
    notificationStore.addNotification('Error', errMsg, 'error')
    shakeCard.value = true
    setTimeout(() => { shakeCard.value = false }, 600)
  } finally {
    isLoading.value = false
  }
}

const handleBackToLogin = async () => {
  isLoading.value = true
  try {
    await authStore.logout()
  } catch (e) {
    console.error('Logout error:', e)
  } finally {
    authStore.clearAuth()
    router.replace('/login')
    isLoading.value = false
  }
}
</script>

<style scoped>
.login-page {
  position: relative;
  min-height: 100vh;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  font-family: 'Inter', 'Segoe UI', system-ui, sans-serif;
}
.login-bg { position: absolute; inset: 0; z-index: 0; }
.bg-image { width: 100%; height: 100%; object-fit: cover; animation: bgZoom 30s ease-in-out infinite alternate; transform-origin: center center; }
.bg-overlay {
  position: absolute; inset: 0;
  background: linear-gradient(135deg, rgba(10, 25, 60, 0.88) 0%, rgba(15, 40, 90, 0.78) 40%, rgba(20, 55, 110, 0.72) 100%),
              radial-gradient(ellipse at 30% 80%, rgba(59, 130, 246, 0.15) 0%, transparent 60%),
              radial-gradient(ellipse at 70% 20%, rgba(14, 165, 233, 0.1) 0%, transparent 50%);
}
@keyframes bgZoom { 0% { transform: scale(1); } 100% { transform: scale(1.08); } }
.grid-lines { position: absolute; inset: 0; z-index: 1; pointer-events: none; }
.grid-line { position: absolute; background: rgba(59, 130, 246, 0.06); }
.gl-h { height: 1px; width: 100%; } .gl-v { width: 1px; height: 100%; }
.gl-h1 { top: 30%; animation: lineSlideH 20s linear infinite; }
.gl-h2 { top: 70%; animation: lineSlideH 25s linear infinite reverse; }
.gl-v1 { left: 25%; animation: lineSlideV 22s linear infinite; }
.gl-v2 { left: 75%; animation: lineSlideV 18s linear infinite reverse; }
@keyframes lineSlideH { 0% { opacity: 0; transform: translateX(-100%); } 20% { opacity: 1; } 80% { opacity: 1; } 100% { opacity: 0; transform: translateX(100%); } }
@keyframes lineSlideV { 0% { opacity: 0; transform: translateY(-100%); } 20% { opacity: 1; } 80% { opacity: 1; } 100% { opacity: 0; transform: translateY(100%); } }
.floating-particles { position: absolute; inset: 0; z-index: 1; pointer-events: none; overflow: hidden; }
.float-icon { position: absolute; bottom: -30px; animation: floatUp linear infinite; }
@keyframes floatUp { 0% { transform: translateY(0) rotate(0deg); opacity: 0; } 8% { opacity: var(--fo, 0.12); } 85% { opacity: var(--fo, 0.08); } 100% { transform: translateY(-110vh) rotate(180deg); opacity: 0; } }
.login-center { position: relative; z-index: 10; width: 100%; max-width: 440px; padding: 24px 20px; display: flex; flex-direction: column; align-items: center; }
.logo-section { display: flex; flex-direction: column; align-items: center; margin-bottom: 24px; opacity: 0; transform: translateY(-20px); transition: all 0.8s cubic-bezier(0.16, 1, 0.3, 1); position: relative; }
.logo-section.logo-loaded { opacity: 1; transform: translateY(0); }
.logo-glow { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 120px; height: 120px; background: radial-gradient(circle, rgba(59, 130, 246, 0.25) 0%, transparent 70%); border-radius: 50%; animation: glowPulse 3s ease-in-out infinite; }
.login-logo { width: 68px; height: 68px; object-fit: contain; filter: drop-shadow(0 4px 20px rgba(59, 130, 246, 0.4)); animation: logoFloat 4s ease-in-out infinite; margin-bottom: 12px; position: relative; z-index: 1; }
.brand-title { text-align: center; display: flex; flex-direction: column; gap: 2px; }
.brand-gate { font-size: 22px; font-weight: 800; color: #ffffff; letter-spacing: 0.12em; text-shadow: 0 2px 12px rgba(59, 130, 246, 0.3); }
.brand-sub { font-size: 12px; font-weight: 500; color: rgba(148, 197, 255, 0.7); letter-spacing: 0.06em; }
@keyframes logoFloat { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
@keyframes glowPulse { 0%, 100% { opacity: 0.6; transform: translate(-50%, -50%) scale(1); } 50% { opacity: 1; transform: translate(-50%, -50%) scale(1.15); } }

.login-card {
  width: 100%;
  background: rgba(255, 255, 255, 0.07);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 20px;
  padding: 28px 24px;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(255, 255, 255, 0.05) inset, 0 1px 0 rgba(255, 255, 255, 0.1) inset;
  opacity: 0;
  transform: translateY(24px) scale(0.97);
  transition: all 0.7s cubic-bezier(0.16, 1, 0.3, 1) 0.2s;
}
.login-card.card-loaded { opacity: 1; transform: translateY(0) scale(1); }
.login-card.shake { animation: shakeAnim 0.5s ease-in-out; }
@keyframes shakeAnim { 0%, 100% { transform: translateX(0); } 15%, 45%, 75% { transform: translateX(-6px); } 30%, 60%, 90% { transform: translateX(6px); } }

.card-header { text-align: center; margin-bottom: 20px; }
.card-title { font-size: 22px; font-weight: 700; color: #ffffff; margin: 0 0 6px 0; }
.card-subtitle { font-size: 13px; color: rgba(148, 197, 255, 0.7); margin: 0; font-weight: 400; }

.status-bar {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 14px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
  margin-bottom: 16px;
  animation: slideDown 0.3s ease both;
}
.status-icon { font-size: 14px; flex-shrink: 0; margin-top: 1px; }
.status-success { background: rgba(34, 197, 94, 0.12); border: 1px solid rgba(34, 197, 94, 0.3); color: #86efac; }
.status-error { background: rgba(239, 68, 68, 0.12); border: 1px solid rgba(239, 68, 68, 0.3); color: #fca5a5; }

/* Policy Hint Card */
.policy-hint-card {
  background: rgba(59, 130, 246, 0.08);
  border: 1px solid rgba(59, 130, 246, 0.2);
  border-radius: 12px;
  padding: 12px 14px;
  margin-bottom: 18px;
}
.policy-hint-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}
.hint-shield-icon { color: #60a5fa; }
.policy-hint-title {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #93c5fd;
}
.policy-hint-list {
  margin: 0;
  padding-left: 16px;
  font-size: 11px;
  color: rgba(219, 234, 254, 0.85);
  line-height: 1.5;
}

/* Form Styles */
.login-form { display: flex; flex-direction: column; gap: 16px; }
.form-group { display: flex; flex-direction: column; }
.label-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
.input-label {
  font-size: 11px;
  font-weight: 700;
  color: rgba(148, 197, 255, 0.85);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: 6px;
}
.char-counter {
  font-family: ui-monospace, monospace;
  font-size: 10px;
  font-weight: 700;
}
.counter-ok { color: #4ade80; }
.counter-warn { color: #fbbf24; }

.field {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.05);
  border: 1.5px solid rgba(255, 255, 255, 0.1);
  transition: all 0.3s ease;
}
.field:hover {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.16);
}
.field.field-active {
  background: rgba(59, 130, 246, 0.1);
  border-color: rgba(59, 130, 246, 0.5);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.12);
}
.field-icon {
  color: rgba(148, 197, 255, 0.6);
  flex-shrink: 0;
  transition: color 0.3s;
  display: flex;
}
.field.field-active .field-icon { color: #60a5fa; }
.field input {
  flex: 1;
  height: 24px;
  border: none;
  background: transparent;
  color: #ffffff;
  font-size: 13.5px;
  font-family: 'Inter', sans-serif;
  font-weight: 500;
  outline: none;
}
.field input::placeholder {
  color: rgba(148, 197, 255, 0.3);
  font-size: 12.5px;
}
.field input::-ms-reveal,
.field input::-ms-clear {
  display: none !important;
}

.eye-btn {
  background: none;
  border: none;
  color: rgba(148, 197, 255, 0.5);
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.2s;
  border-radius: 6px;
}
.eye-btn:hover { color: #93c5fd; background: rgba(255, 255, 255, 0.05); }

.btn-login {
  width: 100%;
  height: 46px;
  border: none;
  border-radius: 12px;
  font-family: 'Inter', sans-serif;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  color: white;
  background: linear-gradient(135deg, #2563eb 0%, #3b82f6 50%, #0ea5e9 100%);
  box-shadow: 0 4px 20px rgba(37, 99, 235, 0.4);
  transition: all 0.3s ease;
  margin-top: 6px;
  position: relative;
  overflow: hidden;
}
.btn-login::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, transparent 0%, rgba(255,255,255,0.15) 50%, transparent 100%);
  transform: translateX(-100%);
  transition: transform 0.5s ease;
}
.btn-login:hover:not(:disabled)::before { transform: translateX(100%); }
.btn-login:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 8px 30px rgba(37, 99, 235, 0.5); }
.btn-login:active:not(:disabled) { transform: translateY(0) scale(0.98); }
.btn-login:disabled { opacity: 0.7; cursor: not-allowed; }

.actions-wrapper {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 6px;
}

.btn-back-login {
  width: 100%;
  height: 40px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 12px;
  font-family: 'Inter', sans-serif;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  color: rgba(148, 197, 255, 0.85);
  background: rgba(255, 255, 255, 0.04);
  transition: all 0.25s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}
.btn-back-login:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.09);
  border-color: rgba(148, 197, 255, 0.35);
  color: #ffffff;
  transform: translateY(-1px);
}
.btn-back-login:active:not(:disabled) {
  transform: translateY(0) scale(0.98);
}
.btn-back-login:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-content, .btn-loader { display: flex; align-items: center; justify-content: center; gap: 8px; }
.spinner { width: 16px; height: 16px; border: 2.5px solid rgba(255,255,255,0.3); border-top-color: white; border-radius: 50%; animation: spin 0.7s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.login-footer { margin-top: 24px; font-size: 11px; font-weight: 500; color: rgba(148, 197, 255, 0.25); text-align: center; opacity: 0; animation: fadeIn 1s ease 0.8s forwards; }

.fade-slide-enter-active { transition: all 0.35s ease; }
.fade-slide-leave-active { transition: all 0.25s ease; }
.fade-slide-enter-from { opacity: 0; transform: translateY(-8px); }
.fade-slide-leave-to { opacity: 0; transform: translateY(-8px); }
@keyframes slideDown { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

@media (max-width: 480px) {
  .login-center { padding: 16px; }
  .login-card { padding: 24px 18px; border-radius: 16px; }
  .login-logo { width: 56px; height: 56px; }
  .brand-gate { font-size: 18px; }
  .card-title { font-size: 20px; }
}
</style>
