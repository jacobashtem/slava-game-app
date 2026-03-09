/**
 * v-tip directive — styled tooltip rendered as fixed-position div in <body>.
 * Escapes all overflow:hidden containers.
 * Usage: <span v-tip="'Tooltip text'">...</span>
 */

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
    font-size: 11px;
    font-weight: 500;
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
  tooltipEl.textContent = text
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
