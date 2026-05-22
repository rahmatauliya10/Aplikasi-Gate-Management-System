<template>
  <div class="forklift-scene" aria-hidden="true">
    <div class="floating-card card-left">
      <div class="mini-title" />
      <div class="mini-line wide" />
      <div class="mini-line" />
      <div class="mini-badge">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
          <path d="m9 12 2 2 4-5" />
        </svg>
      </div>
    </div>

    <div class="floating-card card-right">
      <div class="warehouse-title">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 21V9l9-5 9 5v12" />
          <path d="M7 21v-8h10v8" />
          <path d="M9 17h6" />
          <path d="M9 13h6" />
        </svg>
        <span>GBB</span>
      </div>
      <div class="warehouse-grid">
        <span v-for="i in 9" :key="i" />
      </div>
    </div>

    <div class="scan-post">
      <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M7 3H5a2 2 0 0 0-2 2v2" />
        <path d="M17 3h2a2 2 0 0 1 2 2v2" />
        <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
        <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
        <path d="M7 12h10" />
      </svg>
      <span />
      <small />
    </div>

    <div class="road-shadow" />
    <div class="road-line" />

    <div class="moving-forklift">
      <div class="forklift-wrap">
        <div class="fork-body" />
        <div class="fork-cabin" />
        <div class="fork-window" />
        <div class="fork-arm" />
        <div class="fork-mast" />
        <div class="fork-mast small" />
        <div class="fork-blade" />
        <div class="wheel wheel-a" />
        <div class="wheel wheel-b" />
        <div class="box-stack">
          <div />
          <div />
          <div />
          <div />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
@keyframes floatSoft {
  0%, 100% { transform: translateY(0px); }
  50% { transform: translateY(-10px); }
}

@keyframes roadMove {
  from { background-position-x: 0px; }
  to { background-position-x: -180px; }
}

@keyframes forkliftMove {
  0% { transform: translateX(-230px); }
  100% { transform: translateX(760px); }
}

@keyframes boxFloat {
  0%, 100% { transform: translateY(0px); }
  50% { transform: translateY(-5px); }
}

.forklift-scene {
  position: relative;
  height: 390px;
  width: 100%;
  max-width: 780px;
  overflow: hidden;
  border-radius: 42px;
  background:
    radial-gradient(circle at 20% 20%, rgba(219, 234, 254, .9), transparent 32%),
    radial-gradient(circle at 80% 15%, rgba(191, 219, 254, .65), transparent 30%),
    linear-gradient(180deg, #ffffff 0%, #eff6ff 100%);
  border: 1px solid rgba(255,255,255,.95);
  box-shadow: 0 28px 80px rgba(11, 45, 91, .13);
}

.floating-card {
  position: absolute;
  border-radius: 28px;
  background: rgba(255,255,255,.88);
  border: 1px solid rgba(255,255,255,.95);
  box-shadow: 0 18px 42px rgba(11,45,91,.13);
  animation: floatSoft 4s ease-in-out infinite;
}

.card-left {
  top: 36px;
  left: 42px;
  width: 160px;
  height: 122px;
  padding: 22px;
}

.card-right {
  top: 30px;
  right: 38px;
  width: 218px;
  height: 148px;
  padding: 20px;
  background: #0b2d5b;
  color: white;
  animation-delay: .8s;
}

.mini-title {
  width: 82px;
  height: 12px;
  border-radius: 999px;
  background: #0b2d5b;
  margin-bottom: 18px;
}

.mini-line {
  width: 74px;
  height: 8px;
  border-radius: 999px;
  background: #dbeafe;
  margin-bottom: 9px;
}

.mini-line.wide { width: 112px; }

.mini-badge {
  margin-top: 12px;
  height: 34px;
  width: 34px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #dbeafe;
  color: #2563eb;
}

.warehouse-title {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  color: #bfdbfe;
  font-size: 12px;
  font-weight: 900;
}

.warehouse-title span {
  color: white;
  background: rgba(255,255,255,.1);
  border-radius: 999px;
  padding: 5px 10px;
}

.warehouse-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.warehouse-grid span {
  height: 27px;
  border-radius: 10px;
  background: rgba(255,255,255,.11);
  border: 1px solid rgba(255,255,255,.12);
}

.road-shadow {
  position: absolute;
  left: 54px;
  right: 54px;
  bottom: 92px;
  height: 46px;
  border-radius: 999px;
  background: rgba(11,45,91,.12);
  filter: blur(18px);
}

.road-line {
  position: absolute;
  left: 44px;
  right: 44px;
  bottom: 118px;
  height: 4px;
  border-radius: 999px;
  background-image: linear-gradient(90deg, rgba(11,45,91,.22) 0 44px, transparent 44px 88px);
  background-size: 88px 4px;
  animation: roadMove 2.2s linear infinite;
}

.moving-forklift {
  position: absolute;
  left: 0;
  bottom: 112px;
  width: 260px;
  height: 150px;
  animation: forkliftMove 8s linear infinite;
}

.forklift-wrap {
  position: relative;
  width: 320px;
  height: 150px;
}

.fork-body {
  position: absolute;
  left: 14px;
  top: 86px;
  width: 205px;
  height: 45px;
  border-radius: 24px;
  background: #2563eb;
  border: 4px solid #0b2d5b;
  box-shadow: 0 16px 28px rgba(11,45,91,.16);
}

.fork-cabin {
  position: absolute;
  left: 56px;
  top: 46px;
  width: 108px;
  height: 48px;
  border-radius: 18px 22px 12px 12px;
  background: #60a5fa;
  border: 4px solid #0b2d5b;
}

.fork-window {
  position: absolute;
  left: 91px;
  top: 56px;
  width: 44px;
  height: 28px;
  border-radius: 10px;
  background: white;
  border: 4px solid #0b2d5b;
}

.fork-arm {
  position: absolute;
  left: 206px;
  top: 79px;
  width: 58px;
  height: 12px;
  border-radius: 999px;
  background: #0b2d5b;
}

.fork-mast {
  position: absolute;
  left: 256px;
  top: 22px;
  width: 10px;
  height: 108px;
  border-radius: 999px;
  background: #0b2d5b;
}

.fork-mast.small {
  left: 276px;
  top: 30px;
  width: 7px;
  height: 98px;
}

.fork-blade {
  position: absolute;
  left: 230px;
  top: 111px;
  width: 66px;
  height: 15px;
  border-radius: 8px;
  background: #0b2d5b;
}

.wheel {
  position: absolute;
  top: 118px;
  width: 40px;
  height: 40px;
  border-radius: 999px;
  background: #0b2d5b;
  border: 6px solid white;
  box-shadow: inset 0 0 0 4px #93c5fd;
}

.wheel-a { left: 42px; }
.wheel-b { left: 170px; }

.box-stack {
  position: absolute;
  left: 288px;
  top: 28px;
  display: grid;
  grid-template-columns: repeat(2, 54px);
  gap: 7px;
  animation: boxFloat 3s ease-in-out infinite;
}

.box-stack div {
  height: 48px;
  border-radius: 13px;
  background: #dbeafe;
  border: 4px solid #0b2d5b;
  box-shadow: 0 10px 18px rgba(11,45,91,.1);
}

.scan-post {
  position: absolute;
  right: 95px;
  bottom: 66px;
  width: 94px;
  height: 128px;
  border-radius: 34px 34px 20px 20px;
  background: white;
  border: 4px solid #0b2d5b;
  box-shadow: 0 18px 34px rgba(11,45,91,.16);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 11px;
  color: #2563eb;
}

.scan-post span {
  width: 48px;
  height: 8px;
  border-radius: 999px;
  background: #0b2d5b;
}

.scan-post small {
  width: 32px;
  height: 7px;
  border-radius: 999px;
  background: #bfdbfe;
}

@media (max-width: 768px) {
  .forklift-scene { height: 360px; }
  .card-left, .card-right { display: none; }
  .moving-forklift { animation-duration: 7s; }
  .scan-post { right: 30px; }
}
</style>
