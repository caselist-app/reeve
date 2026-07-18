'use client'

import { useEffect, useRef } from 'react'
import { Newsreader, Inter, Kaushan_Script } from 'next/font/google'

// Self-contained marketing landing page. Editorial, black-on-off-white, hairline-rule
// driven layout (reference: harvey.ai). Styles are namespaced under `.rvl` so nothing
// leaks into the app UI. Fonts are loaded locally to this page, not the app shell.

const newsreader = Newsreader({
  subsets: ['latin'],
  style: ['normal', 'italic'],
  variable: '--font-newsreader',
})

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-inter',
})

const kaushan = Kaushan_Script({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-script',
})

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

    return () => {
      window.removeEventListener('scroll', onScrollNav)
    }
  }, [])

  return (
    <div className={`rvl ${newsreader.variable} ${inter.variable} ${kaushan.variable}`} ref={rootRef}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <nav className="rvl-nav">
        <div className="wrap nav-in">
          <a href="/home" className="brand" aria-label="Reeve, home">
            Reeve
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
            <a href={isAuthed ? '/tours/new' : '/signup'} className="btn btn-solid btn-sm">
              {isAuthed ? 'New tour' : 'Start a tour'}
            </a>
          </div>
        </div>
      </nav>

      <header className="hero">
        <div className="wrap">
          <p className="eyebrow">Platform overview / Tour operations</p>
          <div className="hero-grid">
            <h1>The operating system for the people who run tours</h1>
            <div className="hero-side">
              <p>
                You put the tour in. Reeve handles the routing, travel, day sheets and crew
                comms, then pushes the right detail to the right person over WhatsApp.
              </p>
              <div className="hero-cta">
                <a href={isAuthed ? '/tours/new' : '/signup'} className="btn btn-solid">
                  Start your first tour
                </a>
                <a href="#how" className="btn btn-outline">
                  See how it works
                </a>
              </div>
            </div>
          </div>

          <div className="stage">
            <div className="stage-inner">
              <div className="appcard">
                <aside className="app-rail">
                  <div className="rail-brand">Spring UK Run</div>
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
                </aside>
                <div className="app-main">
                  <div className="app-top">
                    <div>
                      <h4>Needs your attention</h4>
                      <div className="sub">3 things before Glasgow, load-in 14:30</div>
                    </div>
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
            </div>
          </div>
        </div>
      </header>

      <section id="how">
        <div className="wrap">
          <p className="intro-line">
            Input. Enrich. Alert. Act.{' '}
            <span className="dim">
              Clean data first. A thin layer of intelligence on top. It never runs off on its
              own.
            </span>
          </p>

          <div className="block">
            <div className="block-left">
              <h3>You hold a hundred moving parts in your head</h3>
              <div className="block-visual">
                <div className="mv-route">
                  <span className="mv-node">
                    Hellfest<small>festival site</small>
                  </span>
                  <span className="mv-node">
                    Clisson<small>nearest town</small>
                  </span>
                  <span className="mv-node hub">
                    NTE<small>Nantes, 40 min</small>
                  </span>
                </div>
              </div>
            </div>
            <div className="block-right">
              <p>
                Load-in times, visa expiries, who&apos;s on which flight, what the promoter still
                hasn&apos;t sent back. Drop one and the day falls over. Reeve is built so you
                don&apos;t have to hold it alone.
              </p>
              <div className="feat-list">
                <div className="feat">
                  <h4>You put the tour in</h4>
                  <p>Crew, shows, travel, hotels. Entered the way you trust it, because you entered it.</p>
                </div>
                <div className="feat">
                  <h4>Reeve fills the gaps</h4>
                  <p>Nearest hub to the venue, drive times, routing that actually makes the load-in.</p>
                </div>
                <div className="feat">
                  <h4>It watches the tour</h4>
                  <p>A passport about to expire. A flight that no longer connects. You hear early.</p>
                </div>
                <div className="feat">
                  <h4>It pushes the detail</h4>
                  <p>Day sheets, travel, boarding passes, straight to each person. You approve. Reeve sends.</p>
                </div>
              </div>
            </div>
          </div>

          <div className="block" id="what">
            <div className="block-left">
              <h3>The crew never log in</h3>
              <div className="block-visual">
                <div className="mv-wa">
                  <div className="b in">/travel</div>
                  <div className="b out">
                    Tomorrow: train Glasgow to Manchester, 11:10 from Central. Seat 24A.
                  </div>
                </div>
              </div>
            </div>
            <div className="block-right">
              <p>
                Everyone gets their day on WhatsApp, in the app they already use. They reply, ask
                a question, type a slash command. No passwords, no onboarding, no chasing.
              </p>
              <div className="feat-list">
                <div className="feat">
                  <h4>Comms</h4>
                  <p>WhatsApp and email, on your tour&apos;s own branding. Push, not pull.</p>
                </div>
                <div className="feat">
                  <h4>Travel</h4>
                  <p>Reeve ranks the real door-to-door options that make the load-in. You book, you stay in control.</p>
                </div>
                <div className="feat">
                  <h4>Control</h4>
                  <p>You&apos;re the only login. The band, the crew, the venues and the promoters never sign in.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="pricing" className="stats">
        <div className="wrap">
          <div className="stats-head">
            <p className="eyebrow">Pricing</p>
            <h2>One price. The whole party.</h2>
          </div>
          <div className="stat-grid">
            <div className="stat">
              <div className="num">{'£'}22</div>
              <p>a month, or {'£'}220 a year. No per-head fees, no tiers.</p>
            </div>
            <div className="stat">
              <div className="num">0</div>
              <p>apps for the crew to install. Everything arrives on WhatsApp.</p>
            </div>
            <div className="stat">
              <div className="num">1</div>
              <p>login. You hold the keys to the whole tour.</p>
            </div>
          </div>
          <div className="stats-cta">
            <a href={isAuthed ? '/tours/new' : '/signup'} className="btn btn-solid">
              Start your first tour
            </a>
          </div>
        </div>
      </section>

      <section className="dark">
        <div className="wrap">
          <p className="eyebrow">How tour managers use Reeve</p>
          <h2>Built for the way the road actually works</h2>
          <div className="dark-grid">
            <div className="dark-list">
              <div className="item">
                <h4>Passport and visa watch</h4>
                <p>Every crew document checked against the route. Flagged months out, not at the airport.</p>
              </div>
              <div className="item">
                <h4>Venue hub resolution</h4>
                <p>Festivals with no address still resolve to a real airport and a real drive time.</p>
              </div>
              <div className="item">
                <h4>Day sheet delivery</h4>
                <p>One tap sends the day to everyone, personalised, on WhatsApp.</p>
              </div>
              <div className="item">
                <h4>Promoter advancing</h4>
                <p>Track what&apos;s been sent, opened and signed off, without a spreadsheet.</p>
              </div>
            </div>
            <div className="dark-visual">
              <div className="dark-mock">
                <div className="card">
                  <div className="who">Reeve {'→'} pushed to crew</div>
                  <div className="msg">
                    Glasgow. Load-in 14:30 at SWG3. You&apos;re in van 2, leaves the hotel 13:15.
                  </div>
                  <div className="foot">Delivered {'·'} read by 8 of 9</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="closing">
        <div className="wrap closing-grid">
          <h2>The tour runs on you. Run it on Reeve.</h2>
          <div className="hero-cta">
            <a href={isAuthed ? '/tours/new' : '/signup'} className="btn btn-solid">
              Start your first tour
            </a>
            <a href="#how" className="btn btn-outline">
              See how it works
            </a>
          </div>
        </div>
      </section>

      <footer>
        <div className="wrap">
          <div className="foot-grid">
            <div>
              <a href="/home" className="foot-brand" aria-label="Reeve, home">
                Reeve
              </a>
            </div>
            <div className="foot-col">
              <p className="h">Platform</p>
              <a href="#how">How it works</a>
              <a href="#what">What you get</a>
              <a href="#pricing">Pricing</a>
            </div>
            <div className="foot-col">
              <p className="h">Company</p>
              <a href="/home">About</a>
            </div>
            <div className="foot-col">
              <p className="h">Legal</p>
              <a href="/privacy">Privacy</a>
              <a href="/terms">Terms</a>
            </div>
          </div>
          <div className="foot-bottom">
            <span>{'©'} 2026 Reeve</span>
            <span>Built by people who&apos;ve done the run.</span>
          </div>
        </div>
      </footer>
    </div>
  )
}

const CSS = `
.rvl{
  --paper:#F7F6F2; --paper-2:#EFEDE6;
  --ink:#141310; --ink-soft:#63615A; --ink-faint:#8B8980;
  --line: rgba(20,19,16,.12); --line-soft: rgba(20,19,16,.08);
  --dark:#141310; --dark-2:#1D1B17;
  --dark-line: rgba(247,246,242,.14); --dark-text-soft: rgba(247,246,242,.6);
  --font-serif: var(--font-newsreader), Georgia, serif;
  --font-sans: var(--font-inter), -apple-system, BlinkMacSystemFont, sans-serif;
  --font-script: var(--font-script), cursive;
  position:relative; background:var(--paper); color:var(--ink); font-family:var(--font-sans);
  line-height:1.6; -webkit-font-smoothing:antialiased; scroll-behavior:smooth;
}
.rvl *{box-sizing:border-box;margin:0;padding:0}
.rvl .wrap{max-width:1240px; margin:0 auto; padding:0 40px}
.rvl a{color:inherit; text-decoration:none}

.rvl .rvl-nav{position:sticky; top:0; z-index:50; background:rgba(247,246,242,.9); backdrop-filter:blur(8px); border-bottom:1px solid transparent; transition:border-color .2s}
.rvl .rvl-nav.scrolled{border-bottom-color:var(--line)}
.rvl .nav-in{display:flex; align-items:center; justify-content:space-between; height:78px}
.rvl .brand{font-family:var(--font-script); font-size:1.7rem; color:var(--ink)}
.rvl .navlinks{display:flex; align-items:center; gap:36px; font-size:.92rem; color:var(--ink-soft)}
.rvl .navlinks a:hover{color:var(--ink)}
.rvl .nav-cta{display:flex; align-items:center; gap:20px}
.rvl .nav-cta .login{font-size:.92rem; color:var(--ink-soft)}
.rvl .nav-cta .login:hover{color:var(--ink)}
@media(max-width:860px){.rvl .navlinks{display:none}.rvl .nav-cta .login{display:none}}

.rvl .btn{display:inline-flex; align-items:center; gap:8px; font-family:var(--font-sans); font-weight:500; font-size:.92rem; padding:13px 24px; border-radius:999px; transition:opacity .15s ease}
.rvl .btn-solid{background:var(--ink); color:var(--paper)}
.rvl .btn-solid:hover{opacity:.82}
.rvl .btn-outline{border:1px solid var(--line); color:var(--ink)}
.rvl .btn-outline:hover{background:var(--line-soft)}
.rvl .btn-sm{padding:10px 20px; font-size:.86rem}

.rvl .hero{padding:88px 0 0}
.rvl .eyebrow{font-size:.82rem; color:var(--ink-faint)}
.rvl .hero-grid{display:grid; grid-template-columns:1.15fr 1fr; gap:60px; margin-top:26px; align-items:end}
.rvl .hero h1{font-family:var(--font-serif); font-weight:500; font-size:clamp(2.6rem,4.6vw,4.3rem); line-height:1.06; letter-spacing:-.01em; max-width:11ch}
.rvl .hero-side{padding-bottom:8px}
.rvl .hero-side p{font-size:1.12rem; color:var(--ink-soft); max-width:36ch}
.rvl .hero-cta{margin-top:26px; display:flex; gap:14px; flex-wrap:wrap}
@media(max-width:860px){.rvl .hero-grid{grid-template-columns:1fr; align-items:start}}

.rvl .stage{margin-top:64px; border-radius:20px; background:linear-gradient(160deg,#2A2823,#141310); padding:3px}
.rvl .stage-inner{border-radius:18px; overflow:hidden; background:var(--paper)}
.rvl .appcard{display:grid; grid-template-columns:220px 1fr; min-height:420px}
.rvl .app-rail{border-right:1px solid var(--line); padding:22px 18px; background:var(--paper-2)}
.rvl .rail-brand{font-family:var(--font-serif); font-size:1.15rem; padding-bottom:18px; margin-bottom:14px; border-bottom:1px solid var(--line)}
.rvl .rail-i{display:flex; align-items:center; gap:10px; padding:9px 10px; border-radius:8px; font-size:.86rem; color:var(--ink-soft)}
.rvl .rail-i .ic{width:6px; height:6px; border-radius:50%; background:currentColor; opacity:.5}
.rvl .rail-i.active{background:var(--ink); color:var(--paper)}
.rvl .rail-i.active .ic{background:var(--paper); opacity:1}
.rvl .app-main{padding:28px 32px}
.rvl .app-top{display:flex; align-items:baseline; justify-content:space-between; padding-bottom:16px; border-bottom:1px solid var(--line)}
.rvl .app-top h4{font-family:var(--font-serif); font-weight:500; font-size:1.2rem}
.rvl .app-top .sub{font-size:.82rem; color:var(--ink-faint); margin-top:4px}
.rvl .feed-row{display:flex; gap:14px; align-items:flex-start; padding:16px 2px; border-bottom:1px solid var(--line-soft)}
.rvl .feed-row:last-child{border-bottom:0}
.rvl .sev{width:6px; height:6px; border-radius:50%; margin-top:7px; flex:0 0 auto}
.rvl .sev.red{background:#B4483C} .rvl .sev.amber{background:#B4884C} .rvl .sev.green{background:#4C7A5C}
.rvl .feed-row .t{font-size:.92rem; font-weight:500}
.rvl .feed-row .m{font-size:.82rem; color:var(--ink-faint); margin-top:2px}
.rvl .feed-row .when{margin-left:auto; font-size:.76rem; color:var(--ink-faint); white-space:nowrap}
@media(max-width:760px){.rvl .appcard{grid-template-columns:1fr}.rvl .app-rail{display:none}}

.rvl section{padding:120px 0}
.rvl .intro-line{font-family:var(--font-serif); font-weight:500; font-size:clamp(1.5rem,2.6vw,2.1rem); line-height:1.35; max-width:30ch}
.rvl .intro-line .dim{color:var(--ink-faint)}

.rvl .block{display:grid; grid-template-columns:1fr 1fr; gap:64px; padding-top:64px; margin-top:64px; border-top:1px solid var(--line)}
.rvl .block:first-of-type{margin-top:56px}
.rvl .block-left h3{font-family:var(--font-serif); font-weight:500; font-size:clamp(1.6rem,2.6vw,2.1rem); max-width:16ch; line-height:1.2}
.rvl .block-visual{margin-top:32px; border-radius:16px; overflow:hidden; background:var(--paper-2); border:1px solid var(--line); aspect-ratio:4/3; display:flex; align-items:center; justify-content:center}
.rvl .block-right{padding-top:6px}
.rvl .block-right > p{font-size:1.06rem; color:var(--ink-soft); max-width:38ch}
.rvl .feat-list{margin-top:40px}
.rvl .feat{padding:20px 0; border-top:1px solid var(--line)}
.rvl .feat:last-child{border-bottom:1px solid var(--line)}
.rvl .feat h4{font-size:.98rem; font-weight:500}
.rvl .feat p{margin-top:6px; font-size:.92rem; color:var(--ink-faint); max-width:40ch}
@media(max-width:860px){.rvl .block{grid-template-columns:1fr}}

.rvl .mv-route{display:flex; align-items:center; gap:8px; flex-wrap:wrap; padding:24px}
.rvl .mv-node{border:1px solid var(--line); background:var(--paper); border-radius:10px; padding:9px 12px; font-size:.78rem; font-weight:500}
.rvl .mv-node small{display:block; color:var(--ink-faint); font-weight:400; font-size:.68rem; margin-top:2px}
.rvl .mv-node.hub{border-color:var(--ink)}
.rvl .mv-wa{padding:20px; width:100%}
.rvl .mv-wa .b{padding:9px 13px; border-radius:12px; font-size:.82rem; max-width:80%; margin-bottom:8px}
.rvl .mv-wa .b.in{background:var(--paper); border:1px solid var(--line)}
.rvl .mv-wa .b.out{background:var(--ink); color:var(--paper); margin-left:auto}

.rvl .stats{background:var(--paper-2)}
.rvl .stats-head{max-width:44ch}
.rvl .stats-head h2{font-family:var(--font-serif); font-weight:500; font-size:clamp(2rem,3.6vw,2.8rem); margin-top:14px}
.rvl .stat-grid{margin-top:56px; display:grid; grid-template-columns:repeat(3,1fr); border-top:1px solid var(--line)}
.rvl .stat{padding:32px 28px 0; border-right:1px solid var(--line)}
.rvl .stat:last-child{border-right:0}
.rvl .stat .num{font-family:var(--font-serif); font-weight:500; font-size:clamp(2.6rem,4.6vw,3.6rem)}
.rvl .stat p{margin-top:10px; color:var(--ink-soft); font-size:.94rem; max-width:28ch}
.rvl .stats-cta{margin-top:48px}
@media(max-width:760px){.rvl .stat-grid{grid-template-columns:1fr}.rvl .stat{border-right:0; border-top:1px solid var(--line); padding-top:28px}}

.rvl .dark{background:var(--dark); color:var(--paper)}
.rvl .dark .eyebrow{color:var(--dark-text-soft)}
.rvl .dark h2{font-family:var(--font-serif); font-weight:500; font-size:clamp(2rem,3.6vw,2.8rem); margin-top:14px}
.rvl .dark-grid{display:grid; grid-template-columns:1fr 1.15fr; gap:56px; margin-top:60px}
.rvl .dark-list .item{padding:22px 0; border-top:1px solid var(--dark-line)}
.rvl .dark-list .item:last-child{border-bottom:1px solid var(--dark-line)}
.rvl .dark-list .item h4{font-size:1.02rem; font-weight:500}
.rvl .dark-list .item p{margin-top:8px; font-size:.9rem; color:var(--dark-text-soft); max-width:36ch}
.rvl .dark-visual{border-radius:16px; overflow:hidden; background:var(--dark-2); border:1px solid var(--dark-line); min-height:360px; display:flex; align-items:center}
.rvl .dark-mock{padding:24px; width:100%}
.rvl .dark-mock .card{background:var(--paper); color:var(--ink); border-radius:12px; padding:20px}
.rvl .dark-mock .card .who{font-size:.8rem; color:var(--ink-faint); margin-bottom:10px}
.rvl .dark-mock .card .msg{font-size:.94rem; line-height:1.5}
.rvl .dark-mock .card .foot{margin-top:16px; padding-top:14px; border-top:1px solid var(--line); font-size:.8rem; color:var(--ink-faint)}
@media(max-width:860px){.rvl .dark-grid{grid-template-columns:1fr}}

.rvl .closing{padding:130px 0}
.rvl .closing-grid{display:flex; align-items:flex-end; justify-content:space-between; gap:40px; flex-wrap:wrap}
.rvl .closing h2{font-family:var(--font-serif); font-weight:500; font-size:clamp(2.2rem,4.6vw,3.6rem); max-width:14ch; line-height:1.1}

.rvl footer{background:var(--dark); color:var(--dark-text-soft); padding:64px 0 40px; border-top:1px solid var(--dark-line)}
.rvl .foot-grid{display:grid; grid-template-columns:1.4fr repeat(3,1fr); gap:32px}
.rvl .foot-brand{font-family:var(--font-script); font-size:1.7rem; color:var(--paper)}
.rvl .foot-col p.h{font-size:.8rem; color:var(--paper); margin-bottom:14px}
.rvl .foot-col a{display:block; font-size:.88rem; padding:5px 0; color:var(--dark-text-soft)}
.rvl .foot-col a:hover{color:var(--paper)}
.rvl .foot-bottom{margin-top:56px; padding-top:24px; border-top:1px solid var(--dark-line); font-size:.82rem; display:flex; justify-content:space-between; flex-wrap:wrap; gap:10px}
@media(max-width:760px){.rvl .foot-grid{grid-template-columns:1fr 1fr}}
`
