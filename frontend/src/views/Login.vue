<template>
  <div class="login-page" id="login-page">
    <!-- Full Background Image -->
    <div class="login-bg">
      <img src="/Latar_belakang.png" alt="" class="bg-image" />
      <div class="bg-overlay"></div>
    </div>

    <!-- Floating Logistics Particles -->
    <div class="floating-particles">
      <span v-for="i in 12" :key="i" class="float-icon" :style="floatStyle(i)">
        {{ floatIcons[(i - 1) % floatIcons.length] }}
      </span>
    </div>

    <!-- Animated Grid Lines -->
    <div class="grid-lines">
      <div class="grid-line gl-h gl-h1"></div>
      <div class="grid-line gl-h gl-h2"></div>
      <div class="grid-line gl-v gl-v1"></div>
      <div class="grid-line gl-v gl-v2"></div>
    </div>

    <!-- Main Content -->
    <div class="login-center">
      <!-- Logo Section -->
      <div class="logo-section" :class="{ 'logo-loaded': mounted }">
        <div class="logo-glow"></div>
        <img src="/logo_white.png" alt="GMS Logo" class="login-logo" />
        <h1 class="brand-title">
          <span class="brand-gate">GATEWAYS</span>
          <span class="brand-sub">Management System</span>
        </h1>
      </div>

      <!-- Login Card with Glassmorphism -->
      <div class="login-card" :class="{ 'shake': shakeCard, 'card-loaded': mounted }">
        <!-- Card Header -->
        <div class="card-header">
          <h2 class="card-title">Selamat Datang</h2>
          <p class="card-subtitle">Masuk ke sistem untuk melanjutkan</p>
        </div>

        <!-- Status Indicator -->
        <Transition name="fade-slide">
          <div v-if="statusMsg" class="status-bar" :class="statusClass">
            <span class="status-icon">{{ statusIcon }}</span>
            <span>{{ statusMsg }}</span>
          </div>
        </Transition>

        <!-- Login Form -->
        <form class="login-form" @submit.prevent="handleLogin" id="login-form">
          <!-- Username -->
          <div class="field" :class="{ 'field-active': focusUser || formData.identifier }">
            <div class="field-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
              </svg>
            </div>
            <div class="field-input-wrap">
              <label for="input-username" class="field-label">Username / Email</label>
              <input
                id="input-username"
                v-model="formData.identifier"
                type="text"
                required
                autocomplete="username"
                placeholder="Enter username or email"
                @focus="focusUser = true"
                @blur="focusUser = false"
              />
            </div>
            <div class="field-line"></div>
          </div>

          <!-- Password -->
          <div class="field" :class="{ 'field-active': focusPass || formData.password }">
            <div class="field-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
            </div>
            <div class="field-input-wrap">
              <label for="input-password" class="field-label">Password</label>
              <input
                id="input-password"
                v-model="formData.password"
                :type="showPassword ? 'text' : 'password'"
                required
                autocomplete="current-password"
                @focus="focusPass = true"
                @blur="focusPass = false"
              />
            </div>
            <button type="button" class="eye-btn" @click="showPassword = !showPassword" tabindex="-1">
              <svg v-if="!showPassword" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
              <svg v-else width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                <line x1="1" y1="1" x2="23" y2="23"/>
              </svg>
            </button>
            <div class="field-line"></div>
          </div>

          <!-- Sign In Button -->
          <button type="submit" class="btn-login" :disabled="isLoading" id="login-submit">
            <span v-if="isLoading" class="btn-loader">
              <span class="spinner"></span>
              <span>Memproses...</span>
            </span>
            <span v-else class="btn-content">
              <span>Masuk</span>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <line x1="5" y1="12" x2="19" y2="12"/>
                <polyline points="12 5 19 12 12 19"/>
              </svg>
            </span>
          </button>

          <!-- Try Again -->
          <Transition name="fade-slide">
            <button v-if="loginFailed" type="button" class="btn-retry" @click="resetForm">
              Coba Lagi
            </button>
          </Transition>
        </form>
      </div>

      <!-- Footer -->
      <p class="login-footer">© 2026 Gate Management System — PT Santos Jaya Abadi</p>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '../stores/authStore'
import { useNotificationStore } from '../stores/notificationStore'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()
const notificationStore = useNotificationStore()

const mounted = ref(false)
const showPassword = ref(false)
const isLoading = ref(false)
const shakeCard = ref(false)
const focusUser = ref(false)
const focusPass = ref(false)
const loginSuccess = ref(false)
const loginFailed = ref(false)
const statusMsg = ref('')
const statusClass = ref('')
const statusIcon = ref('')

const formData = reactive({ identifier: '', password: '' })

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
  
  if (route.query.expired) {
    statusMsg.value = 'Sesi login sudah habis. Silakan login ulang.'
    statusClass.value = 'status-error'
    statusIcon.value = '⚠️'
    loginFailed.value = true
    router.replace('/login')
  } else {
    authStore.error = null
    statusMsg.value = ''
    loginFailed.value = false
  }
})

const resetForm = () => {
  statusMsg.value = ''
  statusClass.value = ''
  loginFailed.value = false
  authStore.error = null
}

watch(() => formData.identifier, () => {
  if (statusMsg.value) resetForm()
})

watch(() => formData.password, () => {
  if (statusMsg.value) resetForm()
})

const handleLogin = async () => {
  isLoading.value = true
  resetForm()
  loginSuccess.value = false

  let identifierValue = formData.identifier.trim()

  try {
    const result = await authStore.login({
      identifier: identifierValue,
      password: formData.password
    })
    
    if (result.success) {
      loginSuccess.value = true
      if (result.mustChangePassword) {
        statusMsg.value = 'Wajib ganti password! Mengalihkan...'
        statusClass.value = 'status-success'
        statusIcon.value = '⚠️'
        notificationStore.addNotification('Login Success', 'Anda wajib mengganti password sementara Anda.', 'warning')
        setTimeout(() => {
          router.replace('/change-password')
        }, 1200)
        return
      }

      statusMsg.value = 'Login Berhasil! Mengalihkan...'
      statusClass.value = 'status-success'
      statusIcon.value = '✅'
      notificationStore.addNotification('Login Success', `Selamat datang kembali, ${authStore.user.name || 'User'}!`, 'success')
      setTimeout(() => { 
        if (authStore.user.role === 'SECURITY') {
          router.push('/gate-in')
        } else if (authStore.user.role === 'WAREHOUSE') {
          router.push('/weighbridge')
        } else if (authStore.user.role === 'QC') {
          router.push('/qc')
        } else {
          router.push('/')
        }
      }, 1200)
    } else {
      statusMsg.value = result.message || 'Username atau password salah'
      statusClass.value = 'status-error'
      statusIcon.value = '❌'
      loginFailed.value = true
      notificationStore.addNotification('Login Failed', result.message || 'Username atau password salah', 'error')
      shakeCard.value = true
      setTimeout(() => { shakeCard.value = false }, 600)
    }
  } catch (err) {
    const errMsg = authStore.error || 'Terjadi kesalahan sistem'
    statusMsg.value = errMsg
    statusClass.value = 'status-error'
    statusIcon.value = '❌'
    loginFailed.value = true
    notificationStore.addNotification('Login Failed', errMsg, 'error')
    shakeCard.value = true
    setTimeout(() => { shakeCard.value = false }, 600)
  } finally {
    isLoading.value = false
  }
}
</script>

<style scoped>
/* ══════════════════════════════════════════
   PAGE LAYOUT
   ══════════════════════════════════════════ */
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

/* ══════════════════════════════════════════
   BACKGROUND
   ══════════════════════════════════════════ */
.login-bg {
  position: absolute;
  inset: 0;
  z-index: 0;
}
.bg-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  animation: bgZoom 30s ease-in-out infinite alternate;
  transform-origin: center center;
}
.bg-overlay {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(135deg, rgba(10, 25, 60, 0.88) 0%, rgba(15, 40, 90, 0.78) 40%, rgba(20, 55, 110, 0.72) 100%),
    radial-gradient(ellipse at 30% 80%, rgba(59, 130, 246, 0.15) 0%, transparent 60%),
    radial-gradient(ellipse at 70% 20%, rgba(14, 165, 233, 0.1) 0%, transparent 50%);
}

@keyframes bgZoom {
  0% { transform: scale(1); }
  100% { transform: scale(1.08); }
}

/* ══════════════════════════════════════════
   GRID LINES (subtle deco)
   ══════════════════════════════════════════ */
.grid-lines {
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: none;
}
.grid-line {
  position: absolute;
  background: rgba(59, 130, 246, 0.06);
}
.gl-h { height: 1px; width: 100%; }
.gl-v { width: 1px; height: 100%; }
.gl-h1 { top: 30%; animation: lineSlideH 20s linear infinite; }
.gl-h2 { top: 70%; animation: lineSlideH 25s linear infinite reverse; }
.gl-v1 { left: 25%; animation: lineSlideV 22s linear infinite; }
.gl-v2 { left: 75%; animation: lineSlideV 18s linear infinite reverse; }

@keyframes lineSlideH {
  0% { opacity: 0; transform: translateX(-100%); }
  20% { opacity: 1; }
  80% { opacity: 1; }
  100% { opacity: 0; transform: translateX(100%); }
}
@keyframes lineSlideV {
  0% { opacity: 0; transform: translateY(-100%); }
  20% { opacity: 1; }
  80% { opacity: 1; }
  100% { opacity: 0; transform: translateY(100%); }
}

/* ══════════════════════════════════════════
   FLOATING PARTICLES
   ══════════════════════════════════════════ */
.floating-particles {
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: none;
  overflow: hidden;
}
.float-icon {
  position: absolute;
  bottom: -30px;
  animation: floatUp linear infinite;
}

@keyframes floatUp {
  0% { transform: translateY(0) rotate(0deg); opacity: 0; }
  8% { opacity: var(--fo, 0.12); }
  85% { opacity: var(--fo, 0.08); }
  100% { transform: translateY(-110vh) rotate(180deg); opacity: 0; }
}

/* ══════════════════════════════════════════
   CENTER CONTENT
   ══════════════════════════════════════════ */
.login-center {
  position: relative;
  z-index: 10;
  width: 100%;
  max-width: 420px;
  padding: 24px 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
}

/* ══════════════════════════════════════════
   LOGO SECTION
   ══════════════════════════════════════════ */
.logo-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 28px;
  opacity: 0;
  transform: translateY(-20px);
  transition: all 0.8s cubic-bezier(0.16, 1, 0.3, 1);
  position: relative;
}
.logo-section.logo-loaded {
  opacity: 1;
  transform: translateY(0);
}
.logo-glow {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 120px;
  height: 120px;
  background: radial-gradient(circle, rgba(59, 130, 246, 0.25) 0%, transparent 70%);
  border-radius: 50%;
  animation: glowPulse 3s ease-in-out infinite;
}
.login-logo {
  width: 72px;
  height: 72px;
  object-fit: contain;
  filter: drop-shadow(0 4px 20px rgba(59, 130, 246, 0.4));
  animation: logoFloat 4s ease-in-out infinite;
  margin-bottom: 12px;
  position: relative;
  z-index: 1;
}
.brand-title {
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.brand-gate {
  font-size: 22px;
  font-weight: 800;
  color: #ffffff;
  letter-spacing: 0.12em;
  text-shadow: 0 2px 12px rgba(59, 130, 246, 0.3);
}
.brand-sub {
  font-size: 12px;
  font-weight: 500;
  color: rgba(148, 197, 255, 0.7);
  letter-spacing: 0.06em;
}

@keyframes logoFloat {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-6px); }
}
@keyframes glowPulse {
  0%, 100% { opacity: 0.6; transform: translate(-50%, -50%) scale(1); }
  50% { opacity: 1; transform: translate(-50%, -50%) scale(1.15); }
}

/* ══════════════════════════════════════════
   LOGIN CARD (Glassmorphism)
   ══════════════════════════════════════════ */
.login-card {
  width: 100%;
  background: rgba(255, 255, 255, 0.07);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 20px;
  padding: 32px 28px;
  box-shadow:
    0 24px 64px rgba(0, 0, 0, 0.3),
    0 0 0 1px rgba(255, 255, 255, 0.05) inset,
    0 1px 0 rgba(255, 255, 255, 0.1) inset;
  opacity: 0;
  transform: translateY(24px) scale(0.97);
  transition: all 0.7s cubic-bezier(0.16, 1, 0.3, 1) 0.2s;
}
.login-card.card-loaded {
  opacity: 1;
  transform: translateY(0) scale(1);
}
.login-card.shake {
  animation: shakeAnim 0.5s ease-in-out;
}

@keyframes shakeAnim {
  0%, 100% { transform: translateX(0); }
  15%, 45%, 75% { transform: translateX(-6px); }
  30%, 60%, 90% { transform: translateX(6px); }
}

/* Card Header */
.card-header {
  text-align: center;
  margin-bottom: 24px;
}
.card-title {
  font-size: 22px;
  font-weight: 700;
  color: #ffffff;
  margin: 0 0 6px 0;
}
.card-subtitle {
  font-size: 13px;
  color: rgba(148, 197, 255, 0.6);
  margin: 0;
  font-weight: 400;
}

/* ══════════════════════════════════════════
   STATUS BAR
   ══════════════════════════════════════════ */
.status-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 16px;
  animation: slideDown 0.3s ease both;
}
.status-icon { font-size: 15px; }
.status-success {
  background: rgba(34, 197, 94, 0.12);
  border: 1px solid rgba(34, 197, 94, 0.3);
  color: #86efac;
}
.status-error {
  background: rgba(239, 68, 68, 0.12);
  border: 1px solid rgba(239, 68, 68, 0.3);
  color: #fca5a5;
}

@keyframes slideDown {
  from { opacity: 0; transform: translateY(-8px); }
  to { opacity: 1; transform: translateY(0); }
}

/* ══════════════════════════════════════════
   FORM FIELDS
   ══════════════════════════════════════════ */
.login-form {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.field {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.04);
  border: 1.5px solid rgba(255, 255, 255, 0.08);
  transition: all 0.3s ease;
}
.field:hover {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(255, 255, 255, 0.12);
}
.field.field-active {
  background: rgba(59, 130, 246, 0.08);
  border-color: rgba(59, 130, 246, 0.4);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.08);
}
.field-icon {
  color: rgba(148, 197, 255, 0.5);
  flex-shrink: 0;
  transition: color 0.3s;
  display: flex;
}
.field.field-active .field-icon {
  color: #60a5fa;
}
.field-input-wrap {
  flex: 1;
  position: relative;
}
.field-label {
  position: absolute;
  top: 50%;
  left: 0;
  transform: translateY(-50%);
  font-size: 14px;
  color: rgba(148, 197, 255, 0.4);
  pointer-events: none;
  transition: all 0.25s ease;
  font-weight: 500;
}
.field.field-active .field-label {
  top: -2px;
  transform: translateY(-100%);
  font-size: 10px;
  color: #60a5fa;
  font-weight: 600;
  letter-spacing: 0.04em;
}
.field-input-wrap input {
  width: 100%;
  height: 28px;
  border: none;
  background: transparent;
  color: #ffffff;
  font-size: 14px;
  font-family: 'Inter', sans-serif;
  font-weight: 500;
  outline: none;
}
/* Hide Edge/IE default password reveal icon to prevent double eye icon */
.field-input-wrap input::-ms-reveal,
.field-input-wrap input::-ms-clear {
  display: none !important;
}
.field-input-wrap input::placeholder {
  color: transparent;
}
.field-line {
  position: absolute;
  bottom: 0;
  left: 14px;
  right: 14px;
  height: 2px;
  background: linear-gradient(90deg, transparent, #3b82f6, transparent);
  border-radius: 1px;
  opacity: 0;
  transform: scaleX(0);
  transition: all 0.35s ease;
}
.field.field-active .field-line {
  opacity: 1;
  transform: scaleX(1);
}

/* Eye toggle */
.eye-btn {
  background: none;
  border: none;
  color: rgba(148, 197, 255, 0.4);
  cursor: pointer;
  padding: 2px;
  display: flex;
  transition: color 0.2s;
}
.eye-btn:hover {
  color: #60a5fa;
}

/* ══════════════════════════════════════════
   BUTTONS
   ══════════════════════════════════════════ */
.btn-login {
  width: 100%;
  height: 46px;
  border: none;
  border-radius: 12px;
  font-family: 'Inter', sans-serif;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
  color: white;
  background: linear-gradient(135deg, #2563eb 0%, #3b82f6 50%, #0ea5e9 100%);
  box-shadow: 0 4px 20px rgba(37, 99, 235, 0.4);
  transition: all 0.3s ease;
  margin-top: 4px;
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
.btn-login:hover:not(:disabled)::before {
  transform: translateX(100%);
}
.btn-login:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 8px 30px rgba(37, 99, 235, 0.5);
}
.btn-login:active:not(:disabled) {
  transform: translateY(0) scale(0.98);
}
.btn-login:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.btn-content {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}
.btn-loader {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}
.spinner {
  width: 16px;
  height: 16px;
  border: 2.5px solid rgba(255,255,255,0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

.btn-retry {
  width: 100%;
  height: 42px;
  border: 1.5px solid rgba(255,255,255,0.15);
  border-radius: 12px;
  font-family: 'Inter', sans-serif;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  color: rgba(255,255,255,0.7);
  background: rgba(255,255,255,0.05);
  transition: all 0.3s ease;
}
.btn-retry:hover {
  background: rgba(255,255,255,0.1);
  border-color: rgba(255,255,255,0.25);
  color: white;
}

/* ══════════════════════════════════════════
   FOOTER
   ══════════════════════════════════════════ */
.login-footer {
  margin-top: 24px;
  font-size: 11px;
  font-weight: 500;
  color: rgba(148, 197, 255, 0.25);
  text-align: center;
  opacity: 0;
  animation: fadeIn 1s ease 0.8s forwards;
}

/* ══════════════════════════════════════════
   TRANSITIONS
   ══════════════════════════════════════════ */
.fade-slide-enter-active { transition: all 0.35s ease; }
.fade-slide-leave-active { transition: all 0.25s ease; }
.fade-slide-enter-from { opacity: 0; transform: translateY(-8px); }
.fade-slide-leave-to { opacity: 0; transform: translateY(-8px); }

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* ══════════════════════════════════════════
   RESPONSIVE
   ══════════════════════════════════════════ */
@media (max-width: 480px) {
  .login-center { padding: 16px; }
  .login-card { padding: 24px 20px; border-radius: 16px; }
  .login-logo { width: 56px; height: 56px; }
  .brand-gate { font-size: 18px; }
  .card-title { font-size: 20px; }
}
</style>
