<template>
  <div>
    <NuxtRouteAnnouncer />
    <NuxtPage />
  </div>
</template>

<style>
@font-face {
  font-family: 'Kanyon';
  src: url('../assets/fonts/Kanyon-Regular.woff') format('woff'),
       url('../assets/fonts/Kanyon-Regular.ttf') format('truetype');
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}

:root {
  --font-display: 'Kanyon', Georgia, 'Times New Roman', serif;
  --font-body: system-ui, -apple-system, sans-serif;
  --bg-deep: #04030a;
  --bg-card: #0a0406;
  --bg-field: #06050a;
  --bg-line: #0e0a14;
  --bg-board: #04030a;

  --perun: #d4a843;
  --zyvi: #4a9e4a;
  --undead: #8b5fc7;
  --weles: #c44040;

  --attack-color: #fb923c;
  --defense-color: #60a5fa;
  --gold: #c8a84e;
  --gold-dim: rgba(200, 168, 78, 0.3);

  /* Strefy linii — uproszczone (bez Nawia/Jawia/Prawia) */
  --bg-nawia: rgba(88, 28, 135, 0.06);
  --bg-jawia: rgba(180, 130, 60, 0.04);
  --bg-prawia: rgba(99, 102, 241, 0.04);

  /* Kolory linii */
  --line-front: #ef4444;
  --line-distance: #eab308;
  --line-support: #818cf8;

  /* Separator */
  --divider-color: rgba(200, 168, 78, 0.08);

  /* Vignette */
  --vignette-opacity: 0.55;

  --text-primary: #e2e8f0;
  --text-muted: #64748b;
  --border-default: #1e293b;
  --border-highlight: #334155;
}

*, *::before, *::after { box-sizing: border-box; }

html, body, #__nuxt {
  height: 100%;
  margin: 0;
  padding: 0;
  background: var(--bg-deep);
  color: var(--text-primary);
  font-family: 'Inter', system-ui, sans-serif;
  overflow: hidden;
}

::-webkit-scrollbar { width: 4px; }
::-webkit-scrollbar-track { background: var(--bg-deep); }
::-webkit-scrollbar-thumb { background: var(--border-highlight); border-radius: 2px; }

.glow-perun  { box-shadow: 0 0 12px 2px rgba(245,197,66,0.4); }
.glow-zyvi   { box-shadow: 0 0 12px 2px rgba(76,175,80,0.4); }
.glow-undead { box-shadow: 0 0 12px 2px rgba(156,39,176,0.4); }
.glow-weles  { box-shadow: 0 0 12px 2px rgba(198,40,40,0.4); }

@keyframes card-enter {
  from { opacity: 0; transform: translateY(-20px) scale(0.9); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes shake {
  0%, 100% { transform: translateX(0); }
  25%       { transform: translateX(-6px); }
  75%       { transform: translateX(6px); }
}
@keyframes death-fade {
  0%   { opacity: 1; transform: scale(1) rotate(0deg); filter: brightness(1); }
  20%  { opacity: 1; transform: scale(1.25) rotate(-6deg); filter: brightness(2.5) saturate(2); }
  50%  { opacity: 0.7; transform: scale(0.85) rotate(10deg); filter: brightness(1.2); }
  80%  { opacity: 0.2; transform: scale(0.5) rotate(-18deg); filter: brightness(0.4); }
  100% { opacity: 0; transform: scale(0.05) rotate(25deg); filter: brightness(0); }
}
@keyframes pulse-glow {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.6; }
}

.anim-enter   { animation: card-enter 0.3s ease forwards; }
.anim-hit     { animation: shake 0.4s ease; }
.anim-death   { animation: death-fade 0.5s ease forwards; }
.anim-pulse   { animation: pulse-glow 1s ease infinite; }
</style>
