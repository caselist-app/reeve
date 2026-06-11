export const metadata = {
  title: 'Privacy Policy — Reeve',
  description: 'Privacy policy for Reeve, the tour management platform.',
}

export default function PrivacyPage() {
  return (
    <main className="max-w-2xl mx-auto px-6 py-16 text-sm text-gray-700">
      <h1 className="text-2xl font-semibold text-gray-900 mb-2">Privacy Policy</h1>
      <p className="text-gray-500 mb-10">Last updated: 11 June 2026</p>

      <section className="mb-8">
        <h2 className="text-base font-semibold text-gray-900 mb-3">Who we are</h2>
        <p>
          Reeve is a tour management platform operated by Matt Stevenson, United Kingdom
          (contact: matt@ordinaryworld.co). Reeve helps Tour Managers and Production Managers
          organise touring data and deliver operational information to their crew via email and
          WhatsApp.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-base font-semibold text-gray-900 mb-3">What data we collect</h2>
        <p className="mb-3">
          <strong>Account holders (Tour Managers and Production Managers)</strong> provide their
          name, email address, and payment information when signing up. We store tour data you
          enter: shows, venues, travel, hotels, and crew details including names, phone numbers,
          and dietary requirements.
        </p>
        <p>
          <strong>Crew and recipients</strong> do not create accounts. Their contact details
          (name, WhatsApp number, email) are entered by the Tour Manager. When crew interact with
          Reeve via WhatsApp, we log the message content to deliver a response and to provide the
          Tour Manager with operational context.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-base font-semibold text-gray-900 mb-3">How we use your data</h2>
        <p className="mb-3">We use the data you provide to:</p>
        <ul className="list-disc list-inside space-y-1 mb-3">
          <li>Deliver day sheets, travel details, hotel information, and boarding passes to crew via WhatsApp and email</li>
          <li>Send advancing documents to venues and promoters</li>
          <li>Generate alerts and reminders relevant to the tour</li>
          <li>Process subscription payments via Stripe</li>
          <li>Respond to crew questions using AI inference (Anthropic Claude)</li>
        </ul>
        <p>
          We do not sell your data. We do not use your data for advertising. We do not share
          crew or tour data with third parties except as necessary to operate the service
          (see below).
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-base font-semibold text-gray-900 mb-3">Third-party services</h2>
        <p className="mb-3">Reeve uses the following services to operate:</p>
        <ul className="list-disc list-inside space-y-1">
          <li><strong>Supabase</strong> — database and file storage (EU region)</li>
          <li><strong>Vercel</strong> — application hosting</li>
          <li><strong>Meta WhatsApp Cloud API</strong> — WhatsApp message delivery</li>
          <li><strong>Resend</strong> — transactional and operational email delivery</li>
          <li><strong>Stripe</strong> — payment processing</li>
          <li><strong>Anthropic</strong> — AI inference for crew question responses</li>
          <li><strong>Trigger.dev</strong> — background job processing</li>
          <li><strong>Upstash</strong> — caching and rate limiting</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-base font-semibold text-gray-900 mb-3">WhatsApp and Meta</h2>
        <p>
          Reeve uses the Meta WhatsApp Cloud API to send and receive messages. By entering a
          crew member&apos;s WhatsApp number into Reeve, the Tour Manager confirms they have the
          crew member&apos;s consent to receive operational messages via WhatsApp. Message content
          is processed by Meta in accordance with{' '}
          <a
            href="https://www.whatsapp.com/legal/privacy-policy"
            className="underline text-gray-900"
            target="_blank"
            rel="noopener noreferrer"
          >
            WhatsApp&apos;s Privacy Policy
          </a>
          .
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-base font-semibold text-gray-900 mb-3">Data retention</h2>
        <p>
          Tour data is retained for as long as your account is active. You can delete a tour and
          its associated data at any time from within the app. On account deletion, all personal
          data is removed within 30 days.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-base font-semibold text-gray-900 mb-3">Your rights</h2>
        <p>
          Under UK GDPR you have the right to access, correct, or delete the personal data we
          hold about you. To exercise these rights, contact us at matt@ordinaryworld.co. We will
          respond within 30 days.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-base font-semibold text-gray-900 mb-3">Cookies</h2>
        <p>
          Reeve uses a single session cookie to keep you logged in. We do not use tracking or
          advertising cookies.
        </p>
      </section>

      <section>
        <h2 className="text-base font-semibold text-gray-900 mb-3">Contact</h2>
        <p>
          Questions about this policy: matt@ordinaryworld.co
        </p>
      </section>
    </main>
  )
}
