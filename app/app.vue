<template>
  <div>
    <NuxtRouteAnnouncer />
    <NuxtPage />
  </div>
</template>

<style>
:root {
  --bg-deep: #0a0a1a;
  --bg-card: #111827;
  --bg-field: #0d1117;
  --bg-line: #161b27;
  --bg-board: #0a0a1a;

  --perun: #f5c542;
  --zyvi: #4caf50;
  --undead: #9c27b0;
  --weles: #c62828;

  /* Strefy kosmologiczne (Nawia / Jawia / Prawia) */
  --bg-nawia: rgba(88, 28, 135, 0.08);    /* L3 — Nawia (zaświaty, duch) */
  --bg-jawia: rgba(180, 130, 60, 0.06);   /* L1 — Jawia (świat śmiertelnych) */
  --bg-prawia: rgba(99, 102, 241, 0.06);  /* L2 — Prawia (boskie) */

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
