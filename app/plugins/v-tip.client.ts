/**
 * v-tip directive — styled tooltip rendered as fixed-position div in <body>.
 * Escapes all overflow:hidden containers.
 * Usage: <span v-tip="'Tooltip text'">...</span>
 */

// Inline SVG icons for v-tip tokens
const S = 'display:inline-block;width:14px;height:14px;vertical-align:-2px;margin:0 1px;'
const TIP_ICONS: Record<string, string> = {
  DEF: `<svg style="${S}color:#60a5fa" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path fill="currentColor" d="M256 16C175 76.38 82.31 96 16 96c0 148.3 71.38 344.7 240 400c168.6-55.31 240-251.7 240-400c-66.31 0-159-19.63-240-80z"/></svg>`,
  POISON: `<svg style="${S}color:#a3e635" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="currentColor" d="M13 4h-2l-1-2h4zm6 9v9H5v-9c0-2.76 2.24-5 5-5V6H9V5h6v1h-1v2c2.76 0 5 2.24 5 5"/></svg>`,
  ATK: `<svg style="${S}color:#fb923c" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path fill="currentColor" d="M440.7 57.3L382.3 115.7L396.3 129.7L454.7 71.3C458.8 67.2 458.8 60.6 454.7 56.5C450.6 52.4 444 52.4 440.7 57.3zM294 166l-25 25l52 52l25-25L294 166zM227 233l-25 25l52 52l25-25L227 233zM160 300l-25 25l52 52l25-25L160 300zM93 367l-25 25l52 52l25-25L93 367z"/></svg>`,
}

let tooltipEl: HTMLDivElement | null = null
let arrowEl: HTMLDivElement | null = null
let currentTarget: HTMLElement | null = null

function createTooltip() {
  if (tooltipEl) return
  tooltipEl = document.createElement('div')
  tooltipEl.className = 'v-tip-popup'
  tooltipEl.style.cssText = `
    position: fixed;
    z-index: 99999;
    background: #0f172a;
    color: #e2e8f0;
    font-size: 14px;
    font-weight: 600;
    line-height: 1.4;
    padding: 6px 10px;
    border-radius: 6px;
    border: 1px solid #475569;
    box-shadow: 0 4px 16px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.06);
    max-width: 240px;
    width: max-content;
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.12s ease;
    white-space: pre-line;
    word-break: break-word;
  `
  arrowEl = document.createElement('div')
  arrowEl.style.cssText = `
    position: fixed;
    z-index: 99999;
    width: 0; height: 0;
    border: 5px solid transparent;
    border-top-color: #475569;
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.12s ease;
  `
  document.body.appendChild(tooltipEl)
  document.body.appendChild(arrowEl)
}

function showTooltip(target: HTMLElement, text: string) {
  createTooltip()
  if (!tooltipEl || !arrowEl || !text) return
  currentTarget = target
  // Support inline icon tokens: {DEF}, {POISON}, {ATK} etc.
  if (text.includes('{')) {
    tooltipEl.innerHTML = text.replace(/\{([A-Z_]+)\}/g, (_m, token) => {
      const icon = TIP_ICONS[token]
      return icon ?? `{${token}}`
    })
  } else {
    tooltipEl.textContent = text
  }
  tooltipEl.style.opacity = '0'
  arrowEl.style.opacity = '0'

  // Position after text is set (need dimensions)
  requestAnimationFrame(() => {
    if (!tooltipEl || !arrowEl || currentTarget !== target) return
    const rect = target.getBoundingClientRect()
    const tipRect = tooltipEl.getBoundingClientRect()

    // Default: above the element
    let top = rect.top - tipRect.height - 8
    let left = rect.left + rect.width / 2 - tipRect.width / 2

    // If it would go off-screen top, show below instead
    let showBelow = false
    if (top < 4) {
      top = rect.bottom + 8
      showBelow = true
    }

    // Clamp horizontal
    if (left < 4) left = 4
    if (left + tipRect.width > window.innerWidth - 4) {
      left = window.innerWidth - tipRect.width - 4
    }

    tooltipEl.style.top = `${top}px`
    tooltipEl.style.left = `${left}px`
    tooltipEl.style.opacity = '1'

    // Arrow
    const arrowTop = showBelow ? rect.bottom + 0 : rect.top - 10
    arrowEl.style.top = `${arrowTop}px`
    arrowEl.style.left = `${rect.left + rect.width / 2 - 5}px`
    arrowEl.style.borderTopColor = showBelow ? 'transparent' : '#475569'
    arrowEl.style.borderBottomColor = showBelow ? '#475569' : 'transparent'
    arrowEl.style.opacity = '1'
  })
}

function hideTooltip() {
  currentTarget = null
  if (tooltipEl) tooltipEl.style.opacity = '0'
  if (arrowEl) arrowEl.style.opacity = '0'
}

export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.vueApp.directive('tip', {
    mounted(el: HTMLElement, binding) {
      el._tipText = binding.value ?? ''
      el._tipShow = () => showTooltip(el, el._tipText)
      el._tipHide = () => hideTooltip()
      el.addEventListener('mouseenter', el._tipShow)
      el.addEventListener('mouseleave', el._tipHide)
    },
    updated(el: HTMLElement, binding) {
      el._tipText = binding.value ?? ''
    },
    unmounted(el: HTMLElement) {
      el.removeEventListener('mouseenter', el._tipShow)
      el.removeEventListener('mouseleave', el._tipHide)
      if (currentTarget === el) hideTooltip()
    },
  })
})

// Type augmentation
declare global {
  interface HTMLElement {
    _tipText: string
    _tipShow: () => void
    _tipHide: () => void
  }
}
