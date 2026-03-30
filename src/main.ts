import './style.css'
import { prepare, layout, type PreparedText } from '@chenglou/pretext'

// ── Theme Toggle ──

const html = document.documentElement
const toggle = document.getElementById('theme-toggle')!

// Initialize theme from system preference or localStorage
const stored = localStorage.getItem('theme')
if (stored) {
  html.setAttribute('data-theme', stored)
} else if (window.matchMedia('(prefers-color-scheme: light)').matches) {
  html.setAttribute('data-theme', 'light')
}

toggle.addEventListener('click', () => {
  const current = html.getAttribute('data-theme')
  const next = current === 'dark' ? 'light' : 'dark'
  html.setAttribute('data-theme', next)
  localStorage.setItem('theme', next)
})

// ── Time-based Accent Color ──

interface AccentTheme {
  accent: string
  accentHover: string
  teal: string
  accentDim: string
  gradient: string
}

const accents: Record<string, AccentTheme> = {
  dawn: {
    accent: '#f59e0b',
    accentHover: '#fbbf24',
    teal: '#fb923c',
    accentDim: 'rgba(245, 158, 11, 0.2)',
    gradient: 'linear-gradient(90deg, #f59e0b, #fb923c, #f59e0b)',
  },
  day: {
    accent: '#10b981',
    accentHover: '#34d399',
    teal: '#06b6d4',
    accentDim: 'rgba(16, 185, 129, 0.2)',
    gradient: 'linear-gradient(90deg, #10b981, #06b6d4, #10b981)',
  },
  dusk: {
    accent: '#8b5cf6',
    accentHover: '#a78bfa',
    teal: '#c084fc',
    accentDim: 'rgba(139, 92, 246, 0.2)',
    gradient: 'linear-gradient(90deg, #8b5cf6, #c084fc, #8b5cf6)',
  },
  night: {
    accent: '#6c8aff',
    accentHover: '#8aa3ff',
    teal: '#4ecdc4',
    accentDim: 'rgba(108, 138, 255, 0.2)',
    gradient: 'linear-gradient(90deg, #6c8aff, #4ecdc4, #6c8aff)',
  },
}

function getTimeAccent(): AccentTheme {
  const hour = new Date().getHours()
  if (hour >= 6 && hour < 11) return accents.dawn
  if (hour >= 11 && hour < 16) return accents.day
  if (hour >= 16 && hour < 21) return accents.dusk
  return accents.night
}

function applyAccent(theme: AccentTheme) {
  const s = html.style
  s.setProperty('--accent', theme.accent)
  s.setProperty('--accent-hover', theme.accentHover)
  s.setProperty('--teal', theme.teal)
  s.setProperty('--accent-dim', theme.accentDim)
  s.setProperty('--gradient-bar', theme.gradient)
}

applyAccent(getTimeAccent())

// Re-check every 10 minutes
setInterval(() => applyAccent(getTimeAccent()), 10 * 60 * 1000)

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

// ── Scroll Progress Bar ──

const scrollProgress = document.getElementById('scroll-progress')
window.addEventListener('scroll', () => {
  if (!scrollProgress) return
  const scrollTop = window.scrollY
  const docHeight = document.documentElement.scrollHeight - window.innerHeight
  const pct = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0
  scrollProgress.style.width = `${pct}%`
}, { passive: true })

// ── Google Scholar Citation Count ──

const citationEl = document.getElementById('citation-count')
if (citationEl) {
  fetch('/scholar-stats.json')
    .then((r) => r.json())
    .then((data: { citations: number }) => {
      if (data.citations > 0) {
        citationEl.textContent = `${data.citations} citations`
      } else {
        citationEl.textContent = 'Google Scholar'
      }
    })
    .catch(() => {
      citationEl.textContent = 'Google Scholar'
    })
}

// ── Fade-in Animations ──

const fadeObserver = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible')
        fadeObserver.unobserve(entry.target)
      }
    }
  },
  { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
)

document.querySelectorAll('.fade-in').forEach((el) => fadeObserver.observe(el))

// ── Active Nav Link ──

const sections = document.querySelectorAll<HTMLElement>('.section[id]')
const navLinks = document.querySelectorAll<HTMLAnchorElement>('.nav-links a')

const navObserver = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        const id = entry.target.id
        navLinks.forEach((link) => {
          link.classList.toggle('active', link.getAttribute('href') === `#${id}`)
        })
      }
    }
  },
  { threshold: 0.2, rootMargin: `-${getComputedStyle(html).getPropertyValue('--nav-height')} 0px -50% 0px` }
)

sections.forEach((section) => navObserver.observe(section))

// ── Pretext Masonry for Publications ──

interface PubCardData {
  element: HTMLElement
  titlePrepared: PreparedText
  authorsPrepared: PreparedText
  hasLinks: boolean
}

const THUMB_HEIGHT = 120
const INFO_PADDING = 12
const TITLE_AUTHORS_GAP = 6
const AUTHORS_LINKS_GAP = 8
const LINKS_HEIGHT = 24
const GAP = 20
const MIN_COL_WIDTH = 280
const MAX_COLS = 3

// Compute font strings matching CSS
const titleFont = '600 13.6px Inter, -apple-system, BlinkMacSystemFont, sans-serif'
const titleLineHeight = 18.4
const authorsFont = '12.16px Inter, -apple-system, BlinkMacSystemFont, sans-serif'
const authorsLineHeight = 17

const pubContainer = document.getElementById('pub-masonry')
let pubCards: PubCardData[] = []

function initMasonry() {
  if (!pubContainer) return

  const cards = pubContainer.querySelectorAll<HTMLElement>('.pub-card')
  pubCards = Array.from(cards).map((card) => {
    const titleEl = card.querySelector('.pub-title')!
    const authorsEl = card.querySelector('.pub-authors')!
    const linksEl = card.querySelector('.pub-links')!
    return {
      element: card,
      titlePrepared: prepare(titleEl.textContent!, titleFont),
      authorsPrepared: prepare(authorsEl.textContent!, authorsFont),
      hasLinks: linksEl.children.length > 0,
    }
  })

  pubContainer.classList.add('masonry-active')
  computeMasonry()
}

function computeMasonry() {
  if (!pubContainer || pubCards.length === 0) return

  const containerWidth = pubContainer.clientWidth
  if (containerWidth === 0) return

  // Determine columns
  let colCount = Math.max(1, Math.min(MAX_COLS, Math.floor((containerWidth + GAP) / (MIN_COL_WIDTH + GAP))))
  const colWidth = (containerWidth - (colCount - 1) * GAP) / colCount
  const textWidth = colWidth - INFO_PADDING * 2

  const colHeights = new Array(colCount).fill(0)

  for (const pub of pubCards) {
    // Find shortest column
    let minCol = 0
    for (let i = 1; i < colCount; i++) {
      if (colHeights[i]! < colHeights[minCol]!) minCol = i
    }

    // Measure text heights with Pretext
    const titleHeight = layout(pub.titlePrepared, textWidth, titleLineHeight).height
    const authorsHeight = layout(pub.authorsPrepared, textWidth, authorsLineHeight).height
    const linksHeight = pub.hasLinks ? LINKS_HEIGHT : 0
    const linksGap = pub.hasLinks ? AUTHORS_LINKS_GAP : 0

    const cardHeight =
      THUMB_HEIGHT +
      INFO_PADDING +
      titleHeight +
      TITLE_AUTHORS_GAP +
      authorsHeight +
      linksGap +
      linksHeight +
      INFO_PADDING

    const x = minCol * (colWidth + GAP)
    const y = colHeights[minCol]!

    const el = pub.element
    el.style.left = `${x}px`
    el.style.top = `${y}px`
    el.style.width = `${colWidth}px`

    colHeights[minCol]! += cardHeight + GAP
  }

  // Set container height
  let maxHeight = 0
  for (const h of colHeights) {
    if (h > maxHeight) maxHeight = h
  }
  pubContainer.style.height = `${maxHeight}px`
}

// ── Resize Handler ──

let resizeRaf: number | null = null
window.addEventListener('resize', () => {
  if (resizeRaf != null) return
  resizeRaf = requestAnimationFrame(() => {
    resizeRaf = null
    computeMasonry()
  })
})

// ── Init ──

document.fonts.ready.then(() => {
  initMasonry()
})

// ── Card Spotlight Glow ──

function initCardGlow(selector: string) {
  document.querySelectorAll<HTMLElement>(selector).forEach((card) => {
    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect()
      card.style.setProperty('--glow-x', `${e.clientX - rect.left}px`)
      card.style.setProperty('--glow-y', `${e.clientY - rect.top}px`)
      card.style.setProperty('--glow-opacity', '1')
    })
    card.addEventListener('mouseleave', () => {
      card.style.setProperty('--glow-opacity', '0')
    })
  })
}

initCardGlow('.pub-card')
initCardGlow('.project-card')
initCardGlow('.news-frame')

// ── Animated Gradient Border Angle ──

let gradientAngle = 0
function animateGradientAngles() {
  gradientAngle = (gradientAngle + 0.3) % 360
  document.querySelectorAll<HTMLElement>('.pub-card').forEach((card, i) => {
    card.style.setProperty('--card-gradient-angle', `${(gradientAngle + i * 40) % 360}deg`)
  })
  requestAnimationFrame(animateGradientAngles)
}
animateGradientAngles()

// ── Staggered Pub Card Reveal ──

const pubCardObserver = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible')
        pubCardObserver.unobserve(entry.target)
      }
    }
  },
  { threshold: 0.05 }
)

document.querySelectorAll('.pub-card').forEach((card) => {
  card.classList.add('card-reveal')
  pubCardObserver.observe(card)
})

// ── Pixel Pet (walks along news frame edge, click to switch) ──

const dogEl = document.getElementById('cyber-dog')
const newsFrame = document.querySelector<HTMLElement>('.news-frame')

if (dogEl && newsFrame) {
  const allPets = [
    { name: 'dog', map: [
      '..#.....#.T', '.##.....##T', '.#########.',
      '.#WW###WW#.', '.#WL###PW#.', '.##..N..##.',
      '..##Q##Q##.', '..#######..', '..#######..',
      '..##...##..', '.###...###.',
    ]},
    { name: 'cat', map: [
      '.#.......#.', '.##.....##.', '.#########.',
      '.#WW###WW#.', '.#WL###PW#.', '.##..N..##.',
      '..#.Q#Q.#..', '..#######..', '..#######..',
      '..##...##.T', '..##...##T.',
    ]},
    { name: 'bunny', map: [
      '..##...##..', '..##...##..', '.#########.',
      '.#WW###WW#.', '.#WL###PW#.', '.####N####.',
      '..##Q#Q##..', '..#######..', '..#######..',
      '..##...##..', '.###...###.',
    ]},
    { name: 'bird', map: [
      '...#####...', '..#######..', '.#WW###WW#.',
      '.#WL###PW#.', '.####N####.', '..##Q#Q##..',
      '.#########.', '##.#####.##', '...#####...',
      '...##.##...', '..##...##..',
    ]},
    { name: 'fox', map: [
      '#.........#', '##.......##', '.#########.',
      '.#WW###WW#.', '.#WL###PW#.', '.##..N..##.',
      '..##Q#Q##..', '..#######..', '..######.TT',
      '..##...#.TT', '.###...###.',
    ]},
    { name: 'owl', map: [
      '..##...##..', '.####.####.', '.##WW#WW##.',
      '.##WL#PW##.', '.###NNN###.', '..########.',
      '..#.####.#.', '..#.Q##Q.#.', '..########.',
      '...##..##..', '...##..##..',
    ]},
    { name: 'snake', map: [
      '...........',  '.####......', '.#WL##.....',
      '.#WPN#.....', '.##QN#.....', '..####.....',
      '...######..', '....######.', '.....######',
      '......####.', '.......##..',
    ]},
    { name: 'penguin', map: [
      '...#####...', '..#######..', '.##WW#WW##.',
      '.##WL#PW##.', '.###NNN###.', '.##.###.##.',
      '.#..###..#.', '.#..Q#Q..#.', '.##.###.##.',
      '..##...##..', '..###.###..',
    ]},
    { name: 'panda', map: [
      '.##.....##.', '.##.....##.', '.#########.',
      '.##WW#WW##.', '.##WL#PW##.', '.####N####.',
      '..##Q#Q##..', '..#######..', '..#######..',
      '..##...##..', '.###...###.',
    ]},
    { name: 'frog', map: [
      '.WW.....WW.', '.WL.....PW.', '.#########.',
      '.#########.', '.####N####.', '.#QQQQQQQ#.',
      '..#######..', '..#######..', '..#######..',
      '.##.....##.', '.##.....##.',
    ]},
    { name: 'octopus', map: [
      '...#####...', '..#######..', '.#WW###WW#.',
      '.#WL###PW#.', '.####N####.', '..##Q#Q##..',
      '.#########.', '#.#.#.#.#.#', '#.#.#.#.#.#',
      '.#.#.#.#.#.', '...........',
    ]},
    { name: 'robot', map: [
      '.T##.####T.', '..########.', '.##WW#WW##.',
      '.##WL#PW##.', '.##NNNNN##.', '.##Q###Q##.',
      '..########.', '..########.', '..########.',
      '..##...##..', '.###...###.',
    ]},
    { name: 'hamster', map: [
      '.###...###.', '.###...###.', '.#########.',
      '.#WW###WW#.', '.#WL###PW#.', '.##..N..##.',
      '..#Q###Q#..', '..#######..', '...#####...',
      '...##.##...', '..##...##..',
    ]},
    { name: 'dragon', map: [
      'T.##...##..', 'T.##...##..', '..#########',
      '..#WW###WW#', '..#WL###PW#', '..####N####',
      '...##Q#Q##.', '...########', '...######..',
      '...##..##..', '..###..###.',
    ]},
  ]

  const P = 4
  const ns = 'http://www.w3.org/2000/svg'
  const bodyColor = 'var(--accent)'
  const dark = '#1a1a2e'

  let currentPetIdx = Math.floor(Math.random() * allPets.length)
  let pL: SVGRectElement | null = null
  let pR: SVGRectElement | null = null
  let pLHome = { x: 0, y: 0 }
  let pRHome = { x: 0, y: 0 }
  let eyeEls: SVGRectElement[] = []
  let blinkEls: SVGRectElement[] = []
  let tongueEls: SVGRectElement[] = []

  function buildPet(petData: typeof allPets[0]) {
    dogEl.innerHTML = ''
    pL = null; pR = null
    eyeEls = []; blinkEls = []; tongueEls = []

    const map = petData.map
    const W = map[0]!.length
    const H = map.length
    const svg = document.createElementNS(ns, 'svg')
    svg.setAttribute('viewBox', `0 0 ${W * P} ${H * P}`)
    svg.setAttribute('width', `${W * P}`)
    svg.setAttribute('height', `${H * P}`)

    const tailG = document.createElementNS(ns, 'g')
    tailG.setAttribute('class', 'dog-tail-group')
    svg.appendChild(tailG)

    function px(c: number, r: number, fill: string, parent: SVGElement, op = '0.85') {
      const rect = document.createElementNS(ns, 'rect')
      rect.setAttribute('x', `${c * P}`)
      rect.setAttribute('y', `${r * P}`)
      rect.setAttribute('width', `${P}`)
      rect.setAttribute('height', `${P}`)
      rect.setAttribute('fill', fill)
      rect.setAttribute('opacity', op)
      parent.appendChild(rect)
      return rect
    }

    for (let r = 0; r < H; r++) {
      for (let c = 0; c < W; c++) {
        const ch = map[r]![c]
        if (ch === '.') continue
        if (ch === '#') { px(c, r, bodyColor, svg) }
        else if (ch === 'N') { px(c, r, dark, svg, '1') }
        else if (ch === 'T') { px(c, r, bodyColor, tailG, '0.75') }
        else if (ch === 'Q') {
          // Tongue pixel (hidden by default)
          const t = px(c, r, '#f87171', svg, '0')
          t.classList.add('dog-tongue-px')
          tongueEls.push(t)
        } else if (ch === 'W') {
          const w = px(c, r, '#fff', svg, '1')
          eyeEls.push(w)
          const b = px(c, r, bodyColor, svg)
          b.style.display = 'none'
          blinkEls.push(b)
        } else if (ch === 'L' || ch === 'P') {
          const w = px(c, r, '#fff', svg, '1')
          eyeEls.push(w)
          const pupil = px(c, r, dark, svg, '1')
          if (ch === 'L') { pL = pupil; pLHome = { x: c * P, y: r * P } }
          else { pR = pupil; pRHome = { x: c * P, y: r * P } }
          const b = px(c, r, bodyColor, svg)
          b.style.display = 'none'
          blinkEls.push(b)
        }
      }
    }

    dogEl.appendChild(svg)
  }

  buildPet(allPets[currentPetIdx]!)

  // ── Click to switch pet ──
  dogEl.addEventListener('click', () => {
    currentPetIdx = (currentPetIdx + 1) % allPets.length
    buildPet(allPets[currentPetIdx]!)
  })

  // ── Eye tracking ──
  document.addEventListener('mousemove', (e) => {
    if (!pL || !pR) return
    const rect = dogEl.getBoundingClientRect()
    const dx = e.clientX - (rect.left + rect.width / 2)
    const dy = e.clientY - (rect.top + rect.height * 0.4)
    const dist = Math.sqrt(dx * dx + dy * dy)
    let ox = 0, oy = 0
    if (dist > 50) {
      ox = Math.sign(dx) * P
      oy = dy < 0 ? -P : 0
    }
    pL.setAttribute('x', `${pLHome.x + ox}`)
    pL.setAttribute('y', `${pLHome.y + oy}`)
    pR.setAttribute('x', `${pRHome.x + ox}`)
    pR.setAttribute('y', `${pRHome.y + oy}`)
  })

  // ── Blink ──
  setInterval(() => {
    if (Math.random() > 0.35) return
    blinkEls.forEach((b) => (b.style.display = ''))
    eyeEls.forEach((w) => (w.style.display = 'none'))
    if (pL) pL.style.display = 'none'
    if (pR) pR.style.display = 'none'
    setTimeout(() => {
      blinkEls.forEach((b) => (b.style.display = 'none'))
      eyeEls.forEach((w) => (w.style.display = ''))
      if (pL) pL.style.display = ''
      if (pR) pR.style.display = ''
    }, 100)
  }, 2800)

  // ── Speech Bubble (bash-style typing) ──
  const bubble = document.getElementById('pet-bubble')
  const bubbleText = document.getElementById('pet-bubble-text')

  function getStatusMessage(): string {
    const h = new Date().getHours()
    const day = new Date().getDay()
    const isWeekend = day === 0 || day === 6

    const pick = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)]!

    if (isWeekend) {
      if (h < 8) return pick([
        'Choiszt is probably sleeping in...',
        'Choiszt is dreaming about AGI',
        'zzZ... still weekend mode',
      ])
      if (h < 12) return pick([
        'Choiszt might be reading papers in bed',
        'Choiszt is scrolling arXiv casually',
        'weekend vibes + morning coffee ☕',
      ])
      if (h < 14) return pick([
        'Choiszt is probably having brunch',
        'Choiszt might be cooking something',
        'lunch break — recharging 🍜',
      ])
      if (h < 18) return pick([
        'Choiszt might be exploring the city',
        'Choiszt is probably at a café coding',
        'weekend side project time',
        'touching grass... briefly 🌿',
      ])
      if (h < 22) return pick([
        'Choiszt is probably watching anime',
        'Choiszt might be gaming',
        'movie night mode 🎬',
        'Choiszt is cooking dinner',
      ])
      return pick([
        'Choiszt might be gaming late...',
        'late night rabbit hole on YouTube',
        'one more episode... 🌙',
      ])
    }

    if (h < 7) return pick([
      'Choiszt is sleeping... hopefully',
      'zzZ... do not disturb',
      'dreaming in latent space',
      'Choiszt is recharging 🔋',
    ])
    if (h < 9) return pick([
      'Choiszt is grabbing coffee ☕',
      'morning standup + coffee',
      'Choiszt is checking Slack messages',
      'booting up... please wait',
    ])
    if (h < 12) return pick([
      'Choiszt is deep in research papers',
      'Choiszt might be writing a paper',
      'reading arXiv submissions...',
      'Choiszt is in a brainstorm session',
      'focus mode: do not disturb 🎯',
    ])
    if (h < 13) return pick([
      'Choiszt is probably having lunch',
      'lunch break — back soon 🍱',
      'Choiszt is grabbing boba 🧋',
    ])
    if (h < 17) return pick([
      'Choiszt might be writing code',
      'Choiszt is training a model 🏋️',
      'debugging... as always',
      'Choiszt is in a meeting',
      'pushing commits to main 🚀',
      'Choiszt is reviewing experiments',
    ])
    if (h < 19) return pick([
      'Choiszt is reviewing PRs',
      'Choiszt might be mentoring interns',
      'wrapping up today\'s tasks',
      'Choiszt is writing documentation',
    ])
    if (h < 21) return pick([
      'Choiszt might be running experiments',
      'Choiszt is monitoring GPU clusters',
      'evening coding session 🌆',
      'Choiszt is reading a new paper',
    ])
    if (h < 23) return pick([
      'Choiszt is still coding... as usual',
      'one more commit before bed',
      'Choiszt is refactoring old code',
      'late night productivity spike ⚡',
    ])
    return pick([
      'Choiszt is debugging at midnight 🌙',
      'still awake... send help',
      'midnight oil burning bright 🕯️',
      'Choiszt is in the zone',
    ])
  }

  let typeTimer: ReturnType<typeof setTimeout> | null = null
  let cycling = true

  function typeMessage(msg: string) {
    if (!bubble || !bubbleText) return
    if (typeTimer) clearTimeout(typeTimer)
    bubbleText.textContent = ''
    bubble.classList.add('visible')

    let i = 0
    function typeChar() {
      if (i < msg.length) {
        bubbleText.textContent = msg.slice(0, i + 1)
        i++
        typeTimer = setTimeout(typeChar, 55 + Math.random() * 40)
      } else {
        // Stay 4s, then delete char by char, then re-show
        typeTimer = setTimeout(() => deleteMessage(), 6000)
      }
    }
    typeChar()
  }

  function deleteMessage() {
    if (!bubble || !bubbleText) return
    const text = bubbleText.textContent || ''
    if (text.length > 0) {
      bubbleText.textContent = text.slice(0, -1)
      typeTimer = setTimeout(deleteMessage, 30)
    } else {
      bubble.classList.remove('visible')
      if (cycling) {
        typeTimer = setTimeout(() => typeMessage(getStatusMessage()), 4000)
      }
    }
  }

  // Start the loop after 1.5s
  setTimeout(() => typeMessage(getStatusMessage()), 1500)

  // ── Tongue ──
  setInterval(() => {
    if (Math.random() > 0.25 || tongueEls.length === 0) return
    tongueEls.forEach((t) => t.setAttribute('opacity', '1'))
    setTimeout(() => tongueEls.forEach((t) => t.setAttribute('opacity', '0')), 1200)
  }, 4000)

}

// ── ClusterMaps ──

const clustrmapsContainer = document.getElementById('clustrmaps-container')
if (clustrmapsContainer) {
  const script = document.createElement('script')
  script.type = 'text/javascript'
  script.id = 'clustrmaps'
  script.src = '//clustrmaps.com/map_v2.js?d=yeMfAokBZdWpAQi14PW166Qrsiw-GSecTikyJ6xpNtc'
  clustrmapsContainer.appendChild(script)
}
