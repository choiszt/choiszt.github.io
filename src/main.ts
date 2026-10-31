import './style.css'

// ── Open all external links in new tab ──
document.querySelectorAll<HTMLAnchorElement>('a[href^="http"]').forEach((a) => {
  a.setAttribute('target', '_blank')
  a.setAttribute('rel', 'noopener noreferrer')
})

// ── Theme Toggle ──
// The stored choice is applied by an inline script in index.html before first paint;
// without one, CSS follows the system preference.

const html = document.documentElement
const toggle = document.getElementById('theme-toggle')!
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)')

function currentTheme(): 'light' | 'dark' {
  const set = html.getAttribute('data-theme')
  if (set === 'light' || set === 'dark') return set
  return prefersDark.matches ? 'dark' : 'light'
}

toggle.addEventListener('click', () => {
  const next = currentTheme() === 'dark' ? 'light' : 'dark'
  html.setAttribute('data-theme', next)
  try {
    localStorage.setItem('theme', next)
  } catch {
    // Storage unavailable (private mode); the choice lasts for this page view only.
  }
})

// ── Header border and active nav link ──

const header = document.querySelector<HTMLElement>('.site-header')
const sections = document.querySelectorAll<HTMLElement>('.section[id]')
const navLinks = document.querySelectorAll<HTMLAnchorElement>('.nav-links a')

function onScroll() {
  header?.classList.toggle('is-scrolled', window.scrollY > 8)

  // The active section is the last one whose top has passed the upper third of the viewport.
  const line = window.innerHeight / 3
  let active = ''
  sections.forEach((section) => {
    if (section.getBoundingClientRect().top <= line) active = section.id
  })
  const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2
  if (atBottom && sections.length) active = sections[sections.length - 1]!.id
  navLinks.forEach((link) => link.classList.toggle('active', link.getAttribute('href') === `#${active}`))
}

window.addEventListener('scroll', onScroll, { passive: true })
onScroll()

// ── Last Updated ──

const lastUpdatedEl = document.getElementById('last-updated')
if (lastUpdatedEl) {
  const date = new Date(__BUILD_TIME__)
  lastUpdatedEl.textContent = date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

// ── Google Scholar Citation Count ──

const citationEl = document.getElementById('citation-count')
if (citationEl) {
  fetch('/scholar-stats.json')
    .then((r) => r.json())
    .then((data: { citations: number }) => {
      if (data.citations > 0) citationEl.textContent = `${data.citations.toLocaleString('en-US')} citations`
    })
    .catch(() => {
      // Keep the "Google Scholar" fallback text from the markup.
    })
}

// ── News panel: expand once the reader scrolls inside it; drop the bottom fade at the end ──

const newsPanel = document.querySelector<HTMLElement>('.news-panel')
if (newsPanel) {
  const updateFade = () => {
    const atEnd = newsPanel.scrollTop + newsPanel.clientHeight >= newsPanel.scrollHeight - 4
    newsPanel.classList.toggle('at-end', atEnd)
  }
  newsPanel.addEventListener('scroll', () => {
    if (newsPanel.scrollTop > 30) newsPanel.classList.add('is-expanded')
    updateFade()
  }, { passive: true })
  newsPanel.addEventListener('transitionend', updateFade)
  window.addEventListener('resize', updateFade)
  updateFade()
}

// ── Link badge icons, chosen by the badge label ──

const STROKE_ICONS: Record<string, string> = {
  paper: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
  database: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/><path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3"/>',
  cube: '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="M3.27 6.96 12 12.01l8.73-5.05"/><path d="M12 22.08V12"/>',
  pen: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  play: '<polygon points="6 3 20 12 6 21 6 3"/>',
  book: '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
}

const GITHUB_PATH = 'M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z'

const BADGE_ICONS: Record<string, string> = {
  Paper: 'paper',
  Project: 'globe',
  Website: 'globe',
  Code: 'github',
  GitHub: 'github',
  Dataset: 'database',
  Model: 'cube',
  Blog: 'pen',
  Video: 'play',
  Thesis: 'book',
  HF: 'hf',
}

function badgeIcon(name: string): string {
  if (name === 'hf') return '<span class="badge-emoji" aria-hidden="true">🤗</span>'
  if (name === 'github') {
    return `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="${GITHUB_PATH}"/></svg>`
  }
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${STROKE_ICONS[name]}</svg>`
}

document.querySelectorAll<HTMLAnchorElement>('.pub-links a').forEach((a) => {
  const name = BADGE_ICONS[a.textContent!.trim()]
  if (name) a.insertAdjacentHTML('afterbegin', badgeIcon(name))
})

// ── Publications: Selected / All ──

const pubList = document.getElementById('pub-list')
const pubTabs = document.querySelectorAll<HTMLButtonElement>('.pub-tabs [data-view]')

pubTabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    if (!pubList) return
    pubList.dataset.view = tab.dataset.view
    pubTabs.forEach((t) => t.setAttribute('aria-selected', String(t === tab)))
  })
})
