import Image from 'next/image'
import { cn } from '@/lib/utils'
import { ThemeToggle } from '@/components/marketing/theme-toggle'

// Public marketing landing page. Deliberately built from the app's own design
// tokens and components, not a separate brand template: bg-background,
// text-foreground, border-border, the same rounded-3xl card token documented
// in CLAUDE.md, the same Geist font the app shell uses (inherited from the
// root layout, nothing loaded here). It follows the app's real light/dark
// theme via next-themes (ThemeToggle in the nav), same as the authenticated
// app, rather than forcing one look. The screenshots below are the real
// FlightCard, ExtractionRowsPanel and ShareLog components, rendered with
// sample data and captured in both themes, not invented mockups.
export function Landing({ isAuthed = false }: { isAuthed?: boolean }) {
  const primaryHref = isAuthed ? '/tours/new' : '/signup'

  return (
    <div className="bg-background text-foreground">
      <nav className="sticky top-0 z-50 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-[72px] max-w-6xl items-center justify-between px-6">
          <a href="/home" aria-label="Reeve, home">
            <ThemeLogo className="h-[22px] w-auto" priority />
          </a>
          <div className="hidden items-center gap-8 text-sm text-muted-foreground md:flex">
            <a href="#how" className="hover:text-foreground">How it works</a>
            <a href="#what" className="hover:text-foreground">What you get</a>
            <a href="#pricing" className="hover:text-foreground">Pricing</a>
          </div>
          <div className="flex items-center gap-3">
            <a href={isAuthed ? '/tours' : '/login'} className="hidden text-sm text-muted-foreground hover:text-foreground sm:block">
              {isAuthed ? 'Open Reeve' : 'Log in'}
            </a>
            <a
              href={primaryHref}
              className="rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-85"
            >
              {isAuthed ? 'New tour' : 'Start a tour'}
            </a>
            <ThemeToggle />
          </div>
        </div>
      </nav>

      <header className="mx-auto max-w-6xl px-6 pt-20 pb-8 sm:pt-28">
        <p className="text-sm text-muted-foreground">Platform overview / Tour operations</p>
        <div className="mt-6 grid gap-10 lg:grid-cols-[1.1fr_1fr] lg:items-end">
          <h1 className="max-w-[13ch] text-[2.6rem] font-semibold leading-[1.05] tracking-tight sm:text-6xl">
            The operating system for the people who run tours
          </h1>
          <div>
            <p className="max-w-[38ch] text-lg text-muted-foreground">
              You put the tour in. Reeve handles the routing, travel, day sheets and crew comms,
              then pushes the right detail to WhatsApp or Telegram, whichever your crew actually use.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <a
                href={primaryHref}
                className="rounded-full bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-85"
              >
                Start your first tour
              </a>
              <a
                href="#how"
                className="rounded-full border border-border px-6 py-3 text-sm font-medium transition-colors hover:bg-secondary"
              >
                See how it works
              </a>
            </div>
          </div>
        </div>

        <div className="relative mt-16 pb-16 sm:pb-24">
          <div className="pointer-events-none absolute right-[6%] top-6 hidden w-[280px] rotate-[4deg] opacity-90 sm:block md:right-[12%] md:w-[320px]">
            <ThemeImage
              lightSrc="/marketing/extraction-rows-light.png"
              darkSrc="/marketing/extraction-rows-dark.png"
              alt=""
              ariaHidden
              width={960}
              height={860}
              className="rounded-2xl border border-border shadow-2xl shadow-black/40"
            />
          </div>
          <div className="relative mx-auto w-full max-w-[420px] rotate-[-2deg]">
            <ThemeImage
              lightSrc="/marketing/flight-card-light.png"
              darkSrc="/marketing/flight-card-dark.png"
              alt="Reeve's flight card, showing VY8830 from London Heathrow to Barcelona, delayed, gate 22, terminal 5, tracked live"
              width={960}
              height={704}
              className="rounded-2xl border border-border shadow-2xl shadow-black/50"
            />
          </div>
        </div>
      </header>

      <section id="how" className="mx-auto max-w-6xl px-6 py-16">
        <p className="max-w-[36ch] text-2xl font-medium leading-snug text-muted-foreground sm:text-3xl">
          Most tour software is a filing cabinet: data in, documents out.{' '}
          <span className="text-foreground">Reeve keeps working on what you put in.</span>
        </p>
      </section>

      <section id="what" className="mx-auto max-w-6xl space-y-24 px-6 pb-24">
        <FeatureRow
          eyebrow="Live tracking"
          title="It watches the tour so you don't have to"
          body="Every flight on the schedule is tracked automatically. A delay, a gate change, a cancellation, you and the crew hear it the moment it changes, on WhatsApp or Telegram, not at the gate. Passport and visa expiries are flagged months out. Venue hub routing and the day's weather sit on the schedule without you looking them up."
          lightSrc="/marketing/flight-card-light.png"
          darkSrc="/marketing/flight-card-dark.png"
          imgAlt="Reeve's flight card showing a live delayed status, gate and terminal for VY8830"
          imgWidth={960}
          imgHeight={704}
        />
        <FeatureRow
          eyebrow="Email extraction"
          reverse
          title="Forward the email, Reeve does the typing"
          body="A promoter's advance, a rail confirmation, a hotel booking, forward it to your tour's Reeve address and Claude reads it, proposes the show times, the transport segment, the hotel stay. You keep or discard each row. Nothing lands until you say so."
          lightSrc="/marketing/extraction-email-light.png"
          darkSrc="/marketing/extraction-email-dark.png"
          imgAlt="A forwarded promoter email in Reeve's inbox, showing show times, a rail segment and a hotel stay found in the text"
          imgWidth={1120}
          imgHeight={940}
        />
        <FeatureRow
          eyebrow="Read receipts"
          title="Know it actually landed"
          body="Every document you send, a rider, an advance, a day sheet, keeps a ledger: sent, opened, acknowledged, per person. No more asking FOH if they got it. If someone hasn't opened it, you'll know before load-in, not after."
          lightSrc="/marketing/share-log-light.png"
          darkSrc="/marketing/share-log-dark.png"
          imgAlt="Reeve's document share log showing sent, opened and acknowledged times for four recipients"
          imgWidth={1720}
          imgHeight={632}
        />
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-24">
        <div className="grid gap-12 border-t border-border pt-16 lg:grid-cols-[1fr_1.2fr]">
          <div>
            <p className="text-sm text-muted-foreground">The crew never log in</p>
            <h2 className="mt-3 max-w-[16ch] text-3xl font-semibold leading-tight">
              Everyone gets their day on the app they already have open
            </h2>
            <p className="mt-4 max-w-[40ch] text-muted-foreground">
              WhatsApp or Telegram, whichever a person actually uses, chosen per contact. They
              reply, ask a question, type a slash command. No passwords, no onboarding, no
              chasing.
            </p>
          </div>
          <div className="space-y-0">
            <FeatureListItem title="Comms" body="WhatsApp and Telegram, both fully real channels, plus branded email for the formal paper trail. Push, not pull." />
            <FeatureListItem title="Answers" body="Crew text a real question, Claude answers from that tour's own data. You opt in per tour, nothing fires until you switch it on." />
            <FeatureListItem title="Travel" body="Reeve ranks real, live flight options against the load-in, not price. You book off-platform, then paste the reference back in." />
            <FeatureListItem title="Control" body="You're the only login. The band, the crew, the venues never sign in." />
          </div>
        </div>

        <div className="mt-10 max-w-lg rounded-3xl border border-border bg-background p-6">
          <p className="text-xs text-muted-foreground">What actually gets sent, on the /travel command</p>
          <pre className="mt-3 whitespace-pre-wrap font-sans text-sm leading-relaxed text-foreground">
{`Next travel: Flight
LHR -> BCN
Departs: Mon 14 Sep 15:10
Arrives: Mon 14 Sep 18:35
Carrier: Vueling
Flight: VY8830
Ref: QX7F2A`}
          </pre>
        </div>
      </section>

      <section id="pricing" className="border-t border-border bg-secondary/40">
        <div className="mx-auto max-w-6xl px-6 py-24">
          <p className="text-sm text-muted-foreground">Pricing</p>
          <h2 className="mt-3 max-w-[20ch] text-3xl font-semibold sm:text-4xl">One price. The whole party.</h2>
          <div className="mt-14 grid grid-cols-1 gap-8 border-t border-border pt-8 sm:grid-cols-3">
            <Stat num="£22" body="a month, or £220 a year. No per-head fees, no tiers." />
            <Stat num="0" body="apps for the crew to install. Everything arrives where they already are." />
            <Stat num="1" body="login. You hold the keys to the whole tour." />
          </div>
          <a
            href={primaryHref}
            className="mt-12 inline-block rounded-full bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-85"
          >
            Start your first tour
          </a>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-28">
        <div className="flex flex-wrap items-end justify-between gap-8">
          <h2 className="max-w-[14ch] text-4xl font-semibold leading-tight sm:text-5xl">
            The tour runs on you. Run it on Reeve.
          </h2>
          <div className="flex flex-wrap gap-3">
            <a
              href={primaryHref}
              className="rounded-full bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-85"
            >
              Start your first tour
            </a>
            <a
              href="#how"
              className="rounded-full border border-border px-6 py-3 text-sm font-medium transition-colors hover:bg-secondary"
            >
              See how it works
            </a>
          </div>
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-[1.4fr_1fr_1fr_1fr]">
            <div>
              <a href="/home" aria-label="Reeve, home">
                <ThemeLogo className="h-[22px] w-auto" />
              </a>
            </div>
            <FooterCol title="Platform" links={[['How it works', '#how'], ['What you get', '#what'], ['Pricing', '#pricing']]} />
            <FooterCol title="Company" links={[['About', '/home']]} />
            <FooterCol title="Legal" links={[['Privacy', '/privacy'], ['Terms', '/terms']]} />
          </div>
          <div className="mt-14 flex flex-wrap justify-between gap-3 border-t border-border pt-6 text-sm text-muted-foreground">
            <span>© 2026 Reeve</span>
            <span>Built by people who&apos;ve done the run.</span>
          </div>
        </div>
      </footer>
    </div>
  )
}

// Renders both light and dark variants and lets Tailwind's `dark:` variant
// (driven by next-themes' `.dark` class on <html>, see globals.css) decide
// which one paints. No hook, no mount-guard, no flash: the browser resolves
// it at paint time the same way every other `dark:` utility in the app does.
function ThemeImage({
  lightSrc,
  darkSrc,
  alt,
  width,
  height,
  className,
  priority,
  ariaHidden,
}: {
  lightSrc: string
  darkSrc: string
  alt: string
  width: number
  height: number
  className?: string
  priority?: boolean
  ariaHidden?: boolean
}) {
  return (
    <>
      <Image
        src={lightSrc}
        alt={alt}
        width={width}
        height={height}
        priority={priority}
        aria-hidden={ariaHidden}
        className={cn('block dark:hidden', className)}
      />
      <Image
        src={darkSrc}
        alt={alt}
        width={width}
        height={height}
        priority={priority}
        aria-hidden={ariaHidden}
        className={cn('hidden dark:block', className)}
      />
    </>
  )
}

function ThemeLogo({ className, priority }: { className?: string; priority?: boolean }) {
  return (
    <ThemeImage
      lightSrc="/logo/reeve-full-light.png"
      darkSrc="/logo/reeve-full-dark.png"
      alt="Reeve"
      width={438}
      height={166}
      priority={priority}
      className={className}
    />
  )
}

function FeatureRow({
  eyebrow,
  title,
  body,
  lightSrc,
  darkSrc,
  imgAlt,
  imgWidth,
  imgHeight,
  reverse = false,
}: {
  eyebrow: string
  title: string
  body: string
  lightSrc: string
  darkSrc: string
  imgAlt: string
  imgWidth: number
  imgHeight: number
  reverse?: boolean
}) {
  return (
    <div className="grid items-center gap-10 border-t border-border pt-16 lg:grid-cols-2">
      <div className={reverse ? 'lg:order-2' : undefined}>
        <p className="text-sm text-muted-foreground">{eyebrow}</p>
        <h3 className="mt-3 max-w-[18ch] text-2xl font-semibold leading-tight sm:text-3xl">{title}</h3>
        <p className="mt-4 max-w-[46ch] text-muted-foreground">{body}</p>
      </div>
      <div className={reverse ? 'lg:order-1' : undefined}>
        <ThemeImage
          lightSrc={lightSrc}
          darkSrc={darkSrc}
          alt={imgAlt}
          width={imgWidth}
          height={imgHeight}
          className="w-full rounded-2xl border border-border shadow-xl shadow-black/30"
        />
      </div>
    </div>
  )
}

function FeatureListItem({ title, body }: { title: string; body: string }) {
  return (
    <div className="border-t border-border py-5 last:border-b">
      <h4 className="text-sm font-medium">{title}</h4>
      <p className="mt-1.5 max-w-[42ch] text-sm text-muted-foreground">{body}</p>
    </div>
  )
}

function Stat({ num, body }: { num: string; body: string }) {
  return (
    <div>
      <div className="text-5xl font-semibold sm:text-6xl">{num}</div>
      <p className="mt-3 max-w-[26ch] text-muted-foreground">{body}</p>
    </div>
  )
}

function FooterCol({ title, links }: { title: string; links: Array<[string, string]> }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{title}</p>
      <div className="mt-3 space-y-2">
        {links.map(([label, href]) => (
          <a key={href} href={href} className="block text-sm text-muted-foreground hover:text-foreground">
            {label}
          </a>
        ))}
      </div>
    </div>
  )
}
