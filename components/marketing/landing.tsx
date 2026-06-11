'use client'

import { useEffect, useRef } from 'react'

// Self-contained marketing landing page. Dark, cinematic, motion-rich.
// All styles are namespaced under `.rvl` so nothing leaks into the app UI.
// Uses the app's existing Geist font via the --font-geist CSS variable.

function ReeveWordmark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 545 124" aria-hidden="true">
      <path d="M487.773 123.975C475.158 123.975 464.21 121.22 454.93 115.71C445.65 110.055 438.473 102.515 433.398 93.09C428.323 83.665 425.785 73.225 425.785 61.77C425.785 49.88 428.395 39.295 433.615 30.015C438.98 20.735 446.158 13.4125 455.148 8.0475C464.138 2.6825 474.288 0 485.598 0C495.023 0 503.36 1.5225 510.61 4.5675C517.86 7.4675 523.95 11.6 528.88 16.965C533.955 22.33 537.798 28.565 540.408 35.67C543.018 42.63 544.323 50.2425 544.323 58.5075C544.323 60.8275 544.178 63.1475 543.888 65.4675C543.743 67.6425 543.38 69.5275 542.8 71.1225H453.843V47.1975H524.313L508.87 58.5075C510.32 52.2725 510.248 46.7625 508.653 41.9775C507.058 37.0475 504.23 33.205 500.17 30.45C496.255 27.55 491.398 26.1 485.598 26.1C479.943 26.1 475.085 27.4775 471.025 30.2325C466.965 32.9875 463.92 37.0475 461.89 42.4125C459.86 47.7775 459.063 54.3025 459.498 61.9875C458.918 68.6575 459.715 74.53 461.89 79.605C464.065 84.68 467.4 88.6675 471.895 91.5675C476.39 94.3225 481.828 95.7 488.208 95.7C494.008 95.7 498.938 94.54 502.998 92.22C507.203 89.9 510.465 86.71 512.785 82.65L538.885 95.0475C536.565 100.848 532.868 105.923 527.793 110.273C522.863 114.623 516.99 118.03 510.175 120.495C503.36 122.815 495.893 123.975 487.773 123.975Z" />
      <path d="M358.695 121.365L311.933 2.60999H347.168L379.575 92.4375H366.09L398.498 2.60999H433.733L386.97 121.365H358.695Z" />
      <path d="M262.265 123.975C249.65 123.975 238.703 121.22 229.423 115.71C220.143 110.055 212.965 102.515 207.89 93.09C202.815 83.665 200.278 73.225 200.278 61.77C200.278 49.88 202.888 39.295 208.108 30.015C213.473 20.735 220.65 13.4125 229.64 8.0475C238.63 2.6825 248.78 0 260.09 0C269.515 0 277.853 1.5225 285.103 4.5675C292.353 7.4675 298.443 11.6 303.373 16.965C308.448 22.33 312.29 28.565 314.9 35.67C317.51 42.63 318.815 50.2425 318.815 58.5075C318.815 60.8275 318.67 63.1475 318.38 65.4675C318.235 67.6425 317.873 69.5275 317.293 71.1225H228.335V47.1975H298.805L283.363 58.5075C284.813 52.2725 284.74 46.7625 283.145 41.9775C281.55 37.0475 278.723 33.205 274.663 30.45C270.748 27.55 265.89 26.1 260.09 26.1C254.435 26.1 249.578 27.4775 245.518 30.2325C241.458 32.9875 238.413 37.0475 236.383 42.4125C234.353 47.7775 233.555 54.3025 233.99 61.9875C233.41 68.6575 234.208 74.53 236.383 79.605C238.558 84.68 241.893 88.6675 246.388 91.5675C250.883 94.3225 256.32 95.7 262.7 95.7C268.5 95.7 273.43 94.54 277.49 92.22C281.695 89.9 284.958 86.71 287.278 82.65L313.378 95.0475C311.058 100.848 307.36 105.923 302.285 110.273C297.355 114.623 291.483 118.03 284.668 120.495C277.853 122.815 270.385 123.975 262.265 123.975Z" />
      <path d="M133.701 123.975C121.086 123.975 110.139 121.22 100.859 115.71C91.5789 110.055 84.4014 102.515 79.3264 93.09C74.2514 83.665 71.7139 73.225 71.7139 61.77C71.7139 49.88 74.3239 39.295 79.5439 30.015C84.9089 20.735 92.0864 13.4125 101.076 8.0475C110.066 2.6825 120.216 0 131.526 0C140.951 0 149.289 1.5225 156.539 4.5675C163.789 7.4675 169.879 11.6 174.809 16.965C179.884 22.33 183.726 28.565 186.336 35.67C188.946 42.63 190.251 50.2425 190.251 58.5075C190.251 60.8275 190.106 63.1475 189.816 65.4675C189.671 67.6425 189.309 69.5275 188.729 71.1225H99.7714V47.1975H170.241L154.799 58.5075C156.249 52.2725 156.176 46.7625 154.581 41.9775C152.986 37.0475 150.159 33.205 146.099 30.45C142.184 27.55 137.326 26.1 131.526 26.1C125.871 26.1 121.014 27.4775 116.954 30.2325C112.894 32.9875 109.849 37.0475 107.819 42.4125C105.789 47.7775 104.991 54.3025 105.426 61.9875C104.846 68.6575 105.644 74.53 107.819 79.605C109.994 84.68 113.329 88.6675 117.824 91.5675C122.319 94.3225 127.756 95.7 134.136 95.7C139.936 95.7 144.866 94.54 148.926 92.22C153.131 89.9 156.394 86.71 158.714 82.65L184.814 95.0475C182.494 100.848 178.796 105.923 173.721 110.273C168.791 114.623 162.919 118.03 156.104 120.495C149.289 122.815 141.821 123.975 133.701 123.975Z" />
      <path d="M0 121.365V2.61001H30.45V31.1025L28.275 26.97C30.885 16.965 35.1625 10.2225 41.1075 6.7425C47.1975 3.1175 54.375 1.30499 62.64 1.30499H69.6V29.58H59.3775C51.4025 29.58 44.95 32.045 40.02 36.975C35.09 41.76 32.625 48.575 32.625 57.42V121.365H0Z" />
    </svg>
  )
}

export function Landing({ isAuthed = false }: { isAuthed?: boolean }) {
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const root = rootRef.current
    if (!root) return

    const nav = root.querySelector('.rvl-nav')
    const onScrollNav = () => {
      if (nav) nav.classList.toggle('scrolled', window.scrollY > 8)
    }
    window.addEventListener('scroll', onScrollNav, { passive: true })
    onScrollNav()

    let io: IntersectionObserver | null = null
    if ('IntersectionObserver' in window) {
      io = new IntersectionObserver(
        (entries) => {
          entries.forEach((e) => {
            if (e.isIntersecting) {
              const el = e.target as HTMLElement
              el.style.transitionDelay = (el.dataset.delay || '0') + 'ms'
              el.classList.add('in')
              io?.unobserve(el)
            }
          })
        },
        { threshold: 0.12, rootMargin: '0px 0px -7% 0px' },
      )
      root.querySelectorAll('.reveal').forEach((el) => io?.observe(el))
    } else {
      root.querySelectorAll('.reveal').forEach((el) => el.classList.add('in'))
    }

    const stage = root.querySelector<HTMLElement>('.hero-stage')
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let ticking = false
    const onScrollParallax = () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          const y = Math.min(window.scrollY, 800)
          if (stage) stage.style.transform = `translateY(${y * 0.05}px)`
          ticking = false
        })
        ticking = true
      }
    }
    if (stage && !reduce) {
      window.addEventListener('scroll', onScrollParallax, { passive: true })
    }

    const cards = Array.from(root.querySelectorAll<HTMLElement>('.card'))
    const onMove = (c: HTMLElement) => (e: PointerEvent) => {
      const r = c.getBoundingClientRect()
      c.style.setProperty('--mx', e.clientX - r.left + 'px')
      c.style.setProperty('--my', e.clientY - r.top + 'px')
    }
    const handlers = cards.map((c) => {
      const h = onMove(c)
      c.addEventListener('pointermove', h)
      return [c, h] as const
    })

    return () => {
      window.removeEventListener('scroll', onScrollNav)
      window.removeEventListener('scroll', onScrollParallax)
      io?.disconnect()
      handlers.forEach(([c, h]) => c.removeEventListener('pointermove', h))
    }
  }, [])

  return (
    <div className="rvl" ref={rootRef}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <nav className="rvl-nav">
        <div className="wrap navin">
          <a href="/home" className="brand" aria-label="Reeve, home">
            <ReeveWordmark className="logo" />
          </a>
          <div className="navlinks">
            <a href="#how">How it works</a>
            <a href="#what">What you get</a>
            <a href="#pricing">Pricing</a>
          </div>
          <div className="nav-cta">
            <a href={isAuthed ? '/tours' : '/login'} className="login">
              {isAuthed ? 'Open Reeve' : 'Log in'}
            </a>
            <a href={isAuthed ? '/tours/new' : '/signup'} className="btn btn-accent btn-sm">
              {isAuthed ? 'New tour' : 'Start a tour'}
            </a>
          </div>
        </div>
      </nav>

      <header className="hero">
        <div className="hero-aurora" aria-hidden="true">
          <span className="a1" />
          <span className="a2" />
          <span className="a3" />
        </div>
        <div className="wrap hero-inner">
          <span className="pill-tag reveal">
            <span className="dot" />
            Now in early access for tour managers
          </span>
          <h1 className="reveal gradtext" data-delay="60">
            The operating system for the people who run tours.
          </h1>
          <p className="lede reveal" data-delay="120">
            You put the tour in. Reeve handles the routing, travel, day sheets and crew comms,
            then pushes the right detail to the right person over WhatsApp. No app for the crew.
            Nothing sent without you.
          </p>
          <div className="hero-cta reveal" data-delay="180">
            <a href={isAuthed ? '/tours/new' : '/signup'} className="btn btn-accent">
              Start your first tour <span className="btn-arrow">{'→'}</span>
            </a>
            <a href="#how" className="btn btn-ghost">
              See how it works
            </a>
          </div>
          <p className="heronote reveal" data-delay="240">
            One flat price. Unlimited crew. Less than half of Master Tour.
          </p>
        </div>

        <div className="wrap">
          <div className="hero-stage reveal" data-delay="120">
            <div className="stage-glow" aria-hidden="true" />
            <div className="app">
              <aside className="app-rail">
                <div className="rail-brand">
                  <span className="mk" />
                  Spring UK Run
                </div>
                <div className="rail-i active">
                  <span className="ic" />
                  Attention
                </div>
                <div className="rail-i">
                  <span className="ic" />
                  People
                </div>
                <div className="rail-i">
                  <span className="ic" />
                  Shows
                </div>
                <div className="rail-i">
                  <span className="ic" />
                  Logistics
                </div>
                <div className="rail-i">
                  <span className="ic" />
                  Comms
                </div>
                <div className="rail-sec">Tours</div>
                <div className="rail-i">
                  <span className="ic" />
                  Spring UK Run
                </div>
                <div className="rail-i">
                  <span className="ic" />
                  EU Festivals
                </div>
              </aside>
              <div className="app-main">
                <div className="app-top">
                  <div>
                    <h4>Needs your attention</h4>
                    <div className="sub">3 things before Glasgow, load-in 14:30</div>
                  </div>
                  <span className="chip">Live</span>
                </div>
                <div className="feed">
                  <div className="feed-row">
                    <span className="sev red" />
                    <div>
                      <div className="t">Passport expires inside 6 months</div>
                      <div className="m">Jonny Reed, FOH. Spain leg at risk.</div>
                    </div>
                    <span className="when">now</span>
                  </div>
                  <div className="feed-row">
                    <span className="sev amber" />
                    <div>
                      <div className="t">Flight LHR to BCN no longer connects</div>
                      <div className="m">14:10 inbound misses the load-in buffer.</div>
                    </div>
                    <span className="when">8m</span>
                  </div>
                  <div className="feed-row">
                    <span className="sev amber" />
                    <div>
                      <div className="t">Promoter advance overdue</div>
                      <div className="m">Manchester, O2 Ritz. Tech spec not back.</div>
                    </div>
                    <span className="when">1h</span>
                  </div>
                  <div className="feed-row">
                    <span className="sev green" />
                    <div>
                      <div className="t">Day sheet ready to send</div>
                      <div className="m">Glasgow, SWG3. 9 crew, 2 vans.</div>
                    </div>
                    <span className="when">ready</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="wa" aria-hidden="true">
              <div className="wa-top">
                <div className="av">R</div>
                <div className="who">
                  Reeve<span>pushed to crew</span>
                </div>
              </div>
              <div className="bubbles">
                <div className="bub out">
                  Glasgow. Load-in 14:30 at SWG3. You are in van 2, leaves the hotel 13:15.
                  <small>09:02</small>
                </div>
                <div className="bub in">
                  what time is soundcheck<small>09:04</small>
                </div>
                <div className="bub out">
                  16:00. Doors 19:00. Full day sheet is in your thread.<small>09:04</small>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <hr className="hairline" />

      <section className="job">
        <div className="wrap">
          <div className="reveal">
            <p className="eyebrow">
              <span className="num">01</span> &nbsp;The job
            </p>
            <h2 style={{ marginTop: '18px' }}>You hold a hundred moving parts in your head.</h2>
            <p className="lede">
              Load-in times, visa expiries, who is on which flight, what the promoter still has
              not sent back. Drop one and the day falls over. Reeve is built so you do not have to
              hold it alone.
            </p>
          </div>
        </div>
      </section>

      <section id="how">
        <div className="wrap">
          <div className="sec-head reveal">
            <p className="eyebrow">
              <span className="num">02</span> &nbsp;How it works
            </p>
            <h2>Input. Enrich. Alert. Act.</h2>
            <p>Clean data first. A thin layer of intelligence on top. It never runs off on its own.</p>
          </div>
          <div className="steps">
            <div className="step reveal">
              <div className="n">01 / Input</div>
              <h3>You put the tour in</h3>
              <p>Crew, shows, travel, hotels. Entered the way you trust it, because you entered it.</p>
            </div>
            <div className="step reveal" data-delay="80">
              <div className="n">02 / Enrich</div>
              <h3>Reeve fills the gaps</h3>
              <p>Nearest hub to the venue, drive times, routing that actually makes the load-in. Festivals included.</p>
            </div>
            <div className="step reveal" data-delay="160">
              <div className="n">03 / Alert</div>
              <h3>It watches the tour</h3>
              <p>A passport about to expire. A flight that no longer connects. A clash on a day off. You hear early.</p>
            </div>
            <div className="step reveal" data-delay="240">
              <div className="n">04 / Act</div>
              <h3>It pushes the detail</h3>
              <p>Day sheets, travel, boarding passes, straight to each person. You approve. Reeve sends.</p>
            </div>
          </div>
        </div>
      </section>

      <section id="what">
        <div className="wrap">
          <div className="sec-head reveal">
            <p className="eyebrow">
              <span className="num">03</span> &nbsp;What you get
            </p>
            <h2>Built for the way the road actually works.</h2>
            <p>Not a filing cabinet. A second pair of hands that never sleeps through a 6am lobby call.</p>
          </div>
          <div className="bento">
            <div className="card span7 reveal">
              <p className="tag">Comms</p>
              <h3>The crew never log in</h3>
              <p>
                Everyone gets their day on WhatsApp, in the app they already use. They reply, ask a
                question, type a slash command. No passwords, no onboarding, no chasing.
              </p>
              <div className="visual mini-wa">
                <div className="b in">/travel</div>
                <div className="b out">Tomorrow: train Glasgow to Manchester, 11:10 from Central. Seat 24A.</div>
              </div>
            </div>
            <div className="card span5 reveal" data-delay="80">
              <p className="tag">Routing</p>
              <h3>Knows where the venue is</h3>
              <p>Every show resolves to its real transport hub and ground time. The hard cases just work.</p>
              <div className="visual mini-route">
                <span className="node">
                  Hellfest<small>festival site</small>
                </span>
                <span className="arrow-d">{'→'}</span>
                <span className="node">
                  Clisson<small>nearest town</small>
                </span>
                <span className="arrow-d">{'→'}</span>
                <span className="node hub">
                  NTE<small>Nantes, 40 min</small>
                </span>
              </div>
            </div>
            <div className="card span5 reveal">
              <p className="tag">Travel</p>
              <h3>Books nothing behind your back</h3>
              <p>Reeve ranks the real door-to-door options that make the load-in. You book, you stay in control.</p>
              <div className="visual mini-travel">
                <div className="opt best">
                  <span className="mode">{'✈'}</span>
                  <span>LHR to BCN, 11:05</span>
                  <span className="badge">Makes load-in</span>
                </div>
                <div className="opt">
                  <span className="mode">{'✈'}</span>
                  <span>LGW to BCN, 14:10</span>
                  <span className="badge" style={{ color: 'var(--txt-dim)' }}>
                    Too tight
                  </span>
                </div>
              </div>
            </div>
            <div className="card span7 reveal" data-delay="80">
              <p className="tag">Control</p>
              <h3>One account. Yours.</h3>
              <p>
                You are the only login. The band, the crew, the venues and the promoters never sign
                in. They just get what they need, when they need it. You hold the keys to the whole
                tour.
              </p>
              <div className="visual mini-lock">
                <div className="ring">{'\u{1F512}'}</div>
                <div>
                  <div style={{ fontWeight: 650, fontSize: '0.92rem' }}>1 operator, the whole party</div>
                  <div style={{ color: 'var(--txt-dim)', fontSize: '0.82rem', marginTop: '2px' }}>
                    Solo run or twenty crew. Same price, same control.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="pricing">
        <div className="wrap">
          <div className="sec-head center reveal">
            <p className="eyebrow">
              <span className="num">04</span> &nbsp;Pricing
            </p>
            <h2>One price. The whole party.</h2>
            <p>
              No per-head fees. No tiers to decode. Run a solo club run or a twenty-strong
              production for the same flat price.
            </p>
          </div>
          <div className="price-card reveal" data-delay="80">
            <div className="price-inner">
              <div className="plan-row">
                <h3>Reeve</h3>
                <span className="pill">Everything included</span>
              </div>
              <div className="price">
                <span className="amt">{'£'}22</span>
                <span className="per">/ month</span>
              </div>
              <p className="price-sub">Or {'£'}220 a year, two months free.</p>
              <ul className="incl">
                <li>
                  <span className="tick">{'✓'}</span> Unlimited tours and unlimited crew
                </li>
                <li>
                  <span className="tick">{'✓'}</span> WhatsApp and email comms, on your tour&apos;s own branding
                </li>
                <li>
                  <span className="tick">{'✓'}</span> Travel and routing intelligence, venue hubs resolved
                </li>
                <li>
                  <span className="tick">{'✓'}</span> Conflict and expiry alerts, before they bite
                </li>
                <li>
                  <span className="tick">{'✓'}</span> Day sheets, boarding passes and advancing, pushed on your say-so
                </li>
              </ul>
              <a href={isAuthed ? '/tours/new' : '/signup'} className="btn btn-accent">
                Start your first tour <span className="btn-arrow">{'→'}</span>
              </a>
              <p className="compare">
                Master Tour is around {'£'}51 a month. Reeve is less than half, and the crew get more.
              </p>
            </div>
          </div>
          <p className="soon reveal">
            <b>Coming next:</b> book flights, rail and hotels inside Reeve, straight from the
            options it ranks.
          </p>
        </div>
      </section>

      <section className="closing">
        <div className="glow" aria-hidden="true" />
        <div className="wrap inner">
          <div className="reveal">
            <h2>
              The tour runs on you.
              <br />
              Run it on Reeve.
            </h2>
            <div className="hero-cta">
              <a href={isAuthed ? '/tours/new' : '/signup'} className="btn btn-accent">
                Start your first tour <span className="btn-arrow">{'→'}</span>
              </a>
              <a href="#how" className="btn btn-ghost">
                See how it works
              </a>
            </div>
          </div>
        </div>
      </section>

      <footer>
        <div className="wrap footin">
          <a href="/home" className="brand" aria-label="Reeve, home">
            <ReeveWordmark className="logo" />
          </a>
          <div>Built by people who have done the run.</div>
          <div>{'©'} 2026 Reeve</div>
        </div>
      </footer>
    </div>
  )
}

const CSS = `
.rvl{
  --bg:#08090B;--bg-2:#0B0D11;--panel:#0F1218;--panel-2:#141821;
  --line:rgba(255,255,255,.08);--line-2:rgba(255,255,255,.14);
  --txt:#F4F5F7;--txt-mid:#9BA1AB;--txt-dim:#646A74;
  --accent:#37DD8C;--accent-2:#19A867;--accent-deep:#055935;--glow:rgba(55,221,140,.30);
  --maxw:1216px;--pad:clamp(20px,5vw,40px);
  --font:var(--font-geist),"Inter",-apple-system,BlinkMacSystemFont,"Helvetica Neue",Arial,sans-serif;
  position:relative;background:var(--bg);color:var(--txt);font-family:var(--font);
  line-height:1.5;-webkit-font-smoothing:antialiased;overflow-x:hidden;min-height:100vh;
  scroll-behavior:smooth;
}
.rvl *{box-sizing:border-box;margin:0;padding:0}
.rvl::before{content:"";position:fixed;inset:0;z-index:0;pointer-events:none;
  background:radial-gradient(900px 600px at 78% -5%,rgba(55,221,140,.10),transparent 60%),radial-gradient(700px 520px at 8% 8%,rgba(25,168,103,.08),transparent 60%)}
.rvl::after{content:"";position:fixed;inset:0;z-index:0;pointer-events:none;opacity:.5;mix-blend-mode:overlay;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.35'/%3E%3C/svg%3E")}
.rvl .wrap{max-width:var(--maxw);margin:0 auto;padding-left:var(--pad);padding-right:var(--pad);position:relative;z-index:1}
.rvl a{color:inherit;text-decoration:none}
.rvl h1,.rvl h2,.rvl h3{letter-spacing:-.035em;line-height:1;font-weight:700}
.rvl .eyebrow{display:inline-flex;align-items:center;gap:9px;font-size:.8rem;letter-spacing:.06em;text-transform:uppercase;color:var(--txt-mid);font-weight:600}
.rvl .eyebrow .num{color:var(--accent);font-variant-numeric:tabular-nums}
.rvl .gradtext{background:linear-gradient(180deg,#fff 30%,#A7AEB8);-webkit-background-clip:text;background-clip:text;color:transparent}
.rvl .btn{display:inline-flex;align-items:center;justify-content:center;gap:9px;font-weight:600;border-radius:999px;padding:12px 22px;font-size:.95rem;transition:transform .2s ease,box-shadow .25s ease,background .2s ease,border-color .2s;border:1px solid transparent;cursor:pointer;white-space:nowrap}
.rvl .btn-accent{background:linear-gradient(180deg,#4DE89B,#1FB873);color:#04130B;box-shadow:0 8px 30px -10px var(--glow),inset 0 1px 0 rgba(255,255,255,.25)}
.rvl .btn-accent:hover{transform:translateY(-2px);box-shadow:0 14px 44px -10px var(--glow),inset 0 1px 0 rgba(255,255,255,.3)}
.rvl .btn-ghost{border-color:var(--line-2);color:var(--txt);background:rgba(255,255,255,.02)}
.rvl .btn-ghost:hover{background:rgba(255,255,255,.06);border-color:rgba(255,255,255,.22);transform:translateY(-2px)}
.rvl .btn-arrow{transition:transform .2s ease}
.rvl .btn:hover .btn-arrow{transform:translateX(3px)}
.rvl .rvl-nav{position:sticky;top:0;z-index:60;transition:background .3s,border-color .3s,backdrop-filter .3s;border-bottom:1px solid transparent}
.rvl .rvl-nav.scrolled{background:rgba(8,9,11,.72);backdrop-filter:saturate(160%) blur(14px);border-bottom:1px solid var(--line)}
.rvl .navin{display:flex;align-items:center;justify-content:space-between;height:70px}
.rvl .brand{display:inline-flex;align-items:center;color:#fff}
.rvl .logo{height:22px;width:auto;display:block;fill:currentColor}
.rvl .navlinks{display:flex;align-items:center;gap:30px;font-size:.94rem;color:var(--txt-mid)}
.rvl .navlinks a:not(.btn){transition:color .18s}
.rvl .navlinks a:not(.btn):hover{color:var(--txt)}
.rvl .nav-cta{display:flex;align-items:center;gap:14px}
.rvl .nav-cta .login{color:var(--txt-mid);font-size:.94rem;transition:color .18s}
.rvl .nav-cta .login:hover{color:var(--txt)}
.rvl .btn-sm{padding:9px 18px;font-size:.9rem}
@media(max-width:780px){.rvl .navlinks a:not(.btn){display:none}.rvl .nav-cta .login{display:none}}
.rvl .hero{position:relative;padding:clamp(72px,11vw,150px) 0 0;text-align:center}
.rvl .hero-aurora{position:absolute;inset:-10% -20% 30%;z-index:0;pointer-events:none;filter:blur(60px);opacity:.7}
.rvl .hero-aurora span{position:absolute;border-radius:50%;mix-blend-mode:screen}
.rvl .a1{width:48vw;height:40vw;left:6%;top:-6%;background:radial-gradient(circle,rgba(55,221,140,.5),transparent 62%);animation:rvDrift1 16s ease-in-out infinite alternate}
.rvl .a2{width:42vw;height:38vw;right:4%;top:0;background:radial-gradient(circle,rgba(20,150,95,.45),transparent 62%);animation:rvDrift2 19s ease-in-out infinite alternate}
.rvl .a3{width:34vw;height:30vw;left:34%;top:18%;background:radial-gradient(circle,rgba(80,255,170,.28),transparent 60%);animation:rvDrift1 22s ease-in-out infinite alternate}
@keyframes rvDrift1{from{transform:translate(0,0) scale(1)}to{transform:translate(5%,6%) scale(1.12)}}
@keyframes rvDrift2{from{transform:translate(0,0) scale(1.05)}to{transform:translate(-6%,4%) scale(.92)}}
.rvl .hero-inner{position:relative;z-index:2}
.rvl .pill-tag{display:inline-flex;align-items:center;gap:9px;padding:7px 14px 7px 11px;border:1px solid var(--line-2);border-radius:999px;font-size:.82rem;color:var(--txt-mid);background:rgba(255,255,255,.03);backdrop-filter:blur(6px)}
.rvl .pill-tag .dot{width:7px;height:7px;border-radius:50%;background:var(--accent);box-shadow:0 0 0 4px rgba(55,221,140,.18);animation:rvPulse 2.4s ease-in-out infinite}
@keyframes rvPulse{50%{box-shadow:0 0 0 7px rgba(55,221,140,0)}}
.rvl h1{font-size:clamp(2.7rem,7vw,5.4rem);font-weight:900;letter-spacing:-.045em;margin-top:30px;max-width:17ch;margin-left:auto;margin-right:auto}
.rvl .hero p.lede{margin:28px auto 0;font-size:clamp(1.05rem,1.7vw,1.32rem);color:var(--txt-mid);max-width:52ch;line-height:1.55}
.rvl .hero-cta{margin-top:38px;display:flex;gap:14px;justify-content:center;flex-wrap:wrap}
.rvl .heronote{margin-top:20px;font-size:.85rem;color:var(--txt-dim)}
.rvl .hero-stage{position:relative;z-index:2;margin:clamp(50px,7vw,86px) auto 0;max-width:1040px;will-change:transform}
.rvl .stage-glow{position:absolute;left:50%;top:8%;width:80%;height:70%;transform:translateX(-50%);background:radial-gradient(ellipse at center,var(--glow),transparent 65%);filter:blur(50px);z-index:0}
.rvl .app{position:relative;z-index:1;border:1px solid var(--line-2);border-radius:16px;background:linear-gradient(180deg,#0E1117,#0A0C10);box-shadow:0 50px 120px -40px rgba(0,0,0,.9),0 0 0 1px rgba(255,255,255,.02),inset 0 1px 0 rgba(255,255,255,.05);overflow:hidden;display:grid;grid-template-columns:212px 1fr;text-align:left}
.rvl .app-rail{border-right:1px solid var(--line);padding:16px 14px;background:rgba(255,255,255,.012);display:flex;flex-direction:column;gap:3px}
.rvl .rail-brand{display:flex;align-items:center;gap:9px;padding:4px 8px 14px;font-weight:700;font-size:.92rem;color:#fff}
.rvl .rail-brand .mk{width:18px;height:18px;border-radius:6px;background:linear-gradient(135deg,var(--accent),var(--accent-2));box-shadow:0 0 14px var(--glow)}
.rvl .rail-i{display:flex;align-items:center;gap:10px;padding:7px 9px;border-radius:8px;font-size:.82rem;color:var(--txt-mid)}
.rvl .rail-i .ic{width:14px;height:14px;border-radius:4px;border:1.5px solid currentColor;opacity:.7}
.rvl .rail-i.active{background:rgba(55,221,140,.10);color:#EAFBF2}
.rvl .rail-i.active .ic{background:var(--accent);border-color:var(--accent);opacity:1;box-shadow:0 0 10px var(--glow)}
.rvl .rail-sec{font-size:.66rem;letter-spacing:.1em;text-transform:uppercase;color:var(--txt-dim);padding:14px 9px 6px}
.rvl .app-main{padding:18px 20px;min-width:0}
.rvl .app-top{display:flex;align-items:center;justify-content:space-between;padding-bottom:14px;border-bottom:1px solid var(--line)}
.rvl .app-top h4{font-size:.95rem;font-weight:700}
.rvl .app-top .sub{font-size:.74rem;color:var(--txt-dim);font-weight:500;margin-top:3px}
.rvl .chip{font-size:.68rem;color:var(--accent);background:rgba(55,221,140,.10);border:1px solid rgba(55,221,140,.22);padding:4px 9px;border-radius:999px;font-weight:600}
.rvl .feed{display:flex;flex-direction:column}
.rvl .feed-row{display:flex;align-items:flex-start;gap:12px;padding:13px 4px;border-bottom:1px solid var(--line)}
.rvl .feed-row:last-child{border-bottom:0}
.rvl .sev{width:8px;height:8px;border-radius:50%;margin-top:5px;flex:0 0 auto}
.rvl .sev.red{background:#FF6B6B;box-shadow:0 0 10px rgba(255,107,107,.5)}
.rvl .sev.amber{background:#F5C542;box-shadow:0 0 10px rgba(245,197,66,.4)}
.rvl .sev.green{background:var(--accent);box-shadow:0 0 10px var(--glow)}
.rvl .feed-row .t{font-size:.83rem;color:#E7E9ED;font-weight:550}
.rvl .feed-row .m{font-size:.74rem;color:var(--txt-dim);margin-top:2px}
.rvl .feed-row .when{margin-left:auto;font-size:.7rem;color:var(--txt-dim);white-space:nowrap}
.rvl .wa{position:absolute;z-index:3;right:-14px;bottom:-34px;width:min(294px,74vw);background:#0E1116;border:1px solid var(--line-2);border-radius:18px;padding:13px 12px 16px;box-shadow:0 40px 90px -30px rgba(0,0,0,.85),0 0 0 1px rgba(55,221,140,.08);transform:rotate(-1.4deg)}
.rvl .wa-top{display:flex;align-items:center;gap:9px;padding:2px 4px 11px;border-bottom:1px solid var(--line)}
.rvl .wa-top .av{width:28px;height:28px;border-radius:50%;background:linear-gradient(135deg,var(--accent),var(--accent-2));color:#04130B;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:.78rem}
.rvl .wa-top .who{font-size:.8rem;font-weight:700}
.rvl .wa-top .who span{display:block;font-weight:500;color:var(--accent);font-size:.66rem;margin-top:1px}
.rvl .bubbles{display:flex;flex-direction:column;gap:8px;padding-top:12px}
.rvl .bub{max-width:85%;padding:9px 12px;border-radius:13px;font-size:.78rem;line-height:1.38}
.rvl .bub.in{align-self:flex-start;background:#1B2027;color:#D7DBE0;border-bottom-left-radius:4px}
.rvl .bub.out{align-self:flex-end;background:linear-gradient(180deg,#2FCB7F,#149C5F);color:#04130B;border-bottom-right-radius:4px;font-weight:550}
.rvl .bub small{display:block;opacity:.65;font-size:.62rem;margin-top:3px}
@media(max-width:680px){.rvl .app{grid-template-columns:1fr}.rvl .app-rail{display:none}.rvl .wa{right:-6px;bottom:-26px}}
.rvl section{position:relative;padding:clamp(80px,11vw,150px) 0}
.rvl .sec-head{max-width:62ch}
.rvl .sec-head.center{margin:0 auto;text-align:center}
.rvl .sec-head h2{font-size:clamp(2rem,4.4vw,3.4rem);margin-top:16px;font-weight:800;letter-spacing:-.04em}
.rvl .sec-head p{margin-top:20px;color:var(--txt-mid);font-size:1.12rem;max-width:50ch;line-height:1.6}
.rvl .sec-head.center p{margin-left:auto;margin-right:auto}
.rvl .hairline{height:1px;background:linear-gradient(90deg,transparent,var(--line-2),transparent);border:0;max-width:var(--maxw);margin:0 auto}
.rvl .job h2{font-size:clamp(2.2rem,5.2vw,4rem);font-weight:800;letter-spacing:-.045em;max-width:20ch;line-height:1.04}
.rvl .job .lede{margin-top:26px;color:var(--txt-mid);font-size:1.15rem;max-width:46ch;line-height:1.6}
.rvl .steps{margin-top:64px;display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:var(--line);border:1px solid var(--line);border-radius:18px;overflow:hidden}
@media(max-width:860px){.rvl .steps{grid-template-columns:repeat(2,1fr)}}
@media(max-width:520px){.rvl .steps{grid-template-columns:1fr}}
.rvl .step{background:var(--bg-2);padding:30px 26px 34px;position:relative;transition:background .25s}
.rvl .step:hover{background:#0E1218}
.rvl .step .n{font-size:.78rem;color:var(--accent);font-weight:700;letter-spacing:.05em;font-variant-numeric:tabular-nums}
.rvl .step h3{font-size:1.3rem;margin:16px 0 10px;font-weight:700;letter-spacing:-.03em}
.rvl .step p{color:var(--txt-mid);font-size:.95rem;line-height:1.55}
.rvl .bento{margin-top:64px;display:grid;grid-template-columns:repeat(12,1fr);gap:18px}
.rvl .card{position:relative;border:1px solid var(--line);border-radius:18px;background:linear-gradient(180deg,rgba(255,255,255,.025),rgba(255,255,255,.005));padding:30px;overflow:hidden;transition:border-color .3s,transform .3s,box-shadow .3s}
.rvl .card::before{content:"";position:absolute;inset:0;border-radius:18px;padding:1px;background:radial-gradient(420px 200px at var(--mx,50%) var(--my,0%),rgba(55,221,140,.35),transparent 60%);-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude;opacity:0;transition:opacity .3s;pointer-events:none}
.rvl .card:hover{transform:translateY(-3px);box-shadow:0 30px 70px -40px rgba(0,0,0,.8)}
.rvl .card:hover::before{opacity:1}
.rvl .span7{grid-column:span 7}.rvl .span5{grid-column:span 5}
@media(max-width:860px){.rvl .span7,.rvl .span5{grid-column:span 12}}
.rvl .card .tag{font-size:.72rem;letter-spacing:.06em;text-transform:uppercase;color:var(--accent);font-weight:700}
.rvl .card h3{font-size:1.46rem;margin:14px 0 10px;font-weight:700;letter-spacing:-.03em}
.rvl .card p{color:var(--txt-mid);font-size:1rem;line-height:1.6;max-width:44ch}
.rvl .card .visual{margin-top:24px}
.rvl .mini-route{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.rvl .node{border:1px solid var(--line-2);background:rgba(255,255,255,.03);border-radius:10px;padding:9px 13px;font-size:.8rem;font-weight:600}
.rvl .node small{display:block;color:var(--txt-dim);font-weight:500;font-size:.68rem;margin-top:2px}
.rvl .node.hub{border-color:rgba(55,221,140,.35);box-shadow:0 0 26px -8px var(--glow)}
.rvl .arrow-d{color:var(--accent);font-size:.9rem}
.rvl .mini-travel{display:flex;flex-direction:column;gap:8px}
.rvl .opt{display:flex;align-items:center;gap:12px;border:1px solid var(--line);border-radius:11px;padding:11px 13px;background:rgba(255,255,255,.015);font-size:.82rem}
.rvl .opt.best{border-color:rgba(55,221,140,.3);background:rgba(55,221,140,.06)}
.rvl .opt .badge{margin-left:auto;font-size:.66rem;font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:.04em}
.rvl .opt .mode{width:26px;height:26px;border-radius:7px;background:rgba(255,255,255,.06);display:flex;align-items:center;justify-content:center;font-size:.8rem}
.rvl .mini-lock{display:flex;align-items:center;gap:14px;border:1px solid var(--line);border-radius:12px;padding:14px;background:rgba(255,255,255,.015)}
.rvl .mini-lock .ring{width:40px;height:40px;border-radius:50%;border:2px solid var(--accent);display:flex;align-items:center;justify-content:center;color:var(--accent);box-shadow:0 0 24px -6px var(--glow)}
.rvl .mini-wa{display:flex;flex-direction:column;gap:7px;align-items:flex-start}
.rvl .mini-wa .b{padding:8px 12px;border-radius:12px;font-size:.78rem;max-width:90%}
.rvl .mini-wa .b.in{background:#1B2027;color:#D7DBE0;border-bottom-left-radius:4px}
.rvl .mini-wa .b.out{align-self:flex-end;background:linear-gradient(180deg,#2FCB7F,#149C5F);color:#04130B;border-bottom-right-radius:4px;font-weight:550}
.rvl .price-card{position:relative;margin:60px auto 0;max-width:560px;border-radius:24px;padding:2px;background:linear-gradient(180deg,rgba(55,221,140,.5),rgba(55,221,140,.05) 40%,var(--line));box-shadow:0 50px 120px -50px rgba(55,221,140,.3)}
.rvl .price-inner{background:linear-gradient(180deg,#0E1218,#0A0C10);border-radius:22px;padding:clamp(30px,4vw,46px)}
.rvl .plan-row{display:flex;align-items:center;justify-content:space-between}
.rvl .plan-row h3{font-size:1.4rem;font-weight:700}
.rvl .plan-row .pill{font-size:.72rem;font-weight:700;letter-spacing:.04em;color:var(--accent);background:rgba(55,221,140,.10);border:1px solid rgba(55,221,140,.25);padding:6px 12px;border-radius:999px}
.rvl .price{display:flex;align-items:baseline;gap:9px;margin:26px 0 4px}
.rvl .price .amt{font-size:clamp(3.2rem,7vw,4.2rem);font-weight:800;letter-spacing:-.04em;line-height:1}
.rvl .price .per{color:var(--txt-mid);font-size:1.05rem}
.rvl .price-sub{color:var(--txt-mid);font-size:.98rem}
.rvl .incl{margin:28px 0;display:grid;gap:14px}
.rvl .incl li{list-style:none;display:flex;gap:12px;align-items:flex-start;font-size:1rem;color:#E7E9ED}
.rvl .incl .tick{flex:0 0 auto;width:22px;height:22px;border-radius:50%;background:rgba(55,221,140,.12);color:var(--accent);display:flex;align-items:center;justify-content:center;font-size:.72rem;font-weight:800;margin-top:1px;box-shadow:0 0 16px -4px var(--glow)}
.rvl .price-inner .btn{width:100%;padding:15px}
.rvl .compare{text-align:center;margin-top:20px;color:var(--txt-dim);font-size:.9rem}
.rvl .soon{max-width:560px;margin:22px auto 0;text-align:center;font-size:.9rem;color:var(--txt-dim)}
.rvl .soon b{color:var(--txt)}
.rvl .closing{text-align:center;overflow:hidden}
.rvl .closing .glow{position:absolute;left:50%;top:30%;width:70%;height:60%;transform:translateX(-50%);background:radial-gradient(ellipse at center,var(--glow),transparent 65%);filter:blur(70px);z-index:0}
.rvl .closing .inner{position:relative;z-index:1}
.rvl .closing h2{font-size:clamp(2.2rem,5.4vw,4rem);max-width:18ch;margin:0 auto;font-weight:800;letter-spacing:-.045em;line-height:1.05}
.rvl .closing .hero-cta{margin-top:36px}
.rvl footer{border-top:1px solid var(--line);padding:50px 0;color:var(--txt-dim);font-size:.9rem;position:relative;z-index:1}
.rvl .footin{display:flex;justify-content:space-between;align-items:center;gap:24px;flex-wrap:wrap}
.rvl footer .brand{color:#fff}.rvl footer .logo{height:18px}
.rvl .reveal{opacity:0;transform:translateY(26px);transition:opacity .7s cubic-bezier(.2,.7,.2,1),transform .7s cubic-bezier(.2,.7,.2,1)}
.rvl .reveal.in{opacity:1;transform:none}
@media(prefers-reduced-motion:reduce){.rvl .reveal{opacity:1;transform:none;transition:none}.rvl .a1,.rvl .a2,.rvl .a3,.rvl .pill-tag .dot{animation:none}}
`
