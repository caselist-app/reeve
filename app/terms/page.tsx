export const metadata = {
  title: 'Terms of Service — Reeve',
  description: 'Terms of service for Reeve, the tour management platform.',
}

export default function TermsPage() {
  return (
    <main className="max-w-2xl mx-auto px-6 py-16 text-sm text-gray-700">
      <h1 className="text-2xl font-semibold text-gray-900 mb-2">Terms of Service</h1>
      <p className="text-gray-500 mb-10">Last updated: 11 June 2026</p>

      <section className="mb-8">
        <h2 className="text-base font-semibold text-gray-900 mb-3">Who operates Reeve</h2>
        <p>
          Reeve is operated by Matt Stevenson, United Kingdom (contact: matt@ordinaryworld.co).
          By creating an account and using Reeve, you agree to these terms.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-base font-semibold text-gray-900 mb-3">What Reeve is</h2>
        <p>
          Reeve is a tour management platform for Tour Managers and Production Managers. It
          provides tools for organising tour data and delivering operational information to crew
          via WhatsApp and email. Reeve is a professional tool intended for use by touring
          industry professionals.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-base font-semibold text-gray-900 mb-3">Your account</h2>
        <p className="mb-3">
          One account per Tour Manager or Production Manager. You are responsible for keeping
          your login credentials secure and for all activity that occurs under your account.
        </p>
        <p>
          You must provide accurate information when signing up. You must be at least 18 years
          old to use Reeve.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-base font-semibold text-gray-900 mb-3">Your data and your crew</h2>
        <p className="mb-3">
          You own the tour data you enter into Reeve. By entering crew contact details, you
          confirm you have their consent to receive operational messages from Reeve on your
          behalf via WhatsApp and email.
        </p>
        <p>
          You are responsible for the accuracy of the data you enter and for ensuring that
          messages sent to crew are appropriate and relevant to the tour.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-base font-semibold text-gray-900 mb-3">Acceptable use</h2>
        <p className="mb-3">You agree not to use Reeve to:</p>
        <ul className="list-disc list-inside space-y-1">
          <li>Send unsolicited or irrelevant messages to crew or contacts</li>
          <li>Store or transmit data you do not have the right to use</li>
          <li>Attempt to access another user&apos;s account or data</li>
          <li>Interfere with or disrupt the service</li>
          <li>Use the service for any unlawful purpose</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-base font-semibold text-gray-900 mb-3">Payments and billing</h2>
        <p className="mb-3">
          Reeve is a paid subscription service billed monthly. Payments are processed by Stripe.
          Your subscription renews automatically unless cancelled before the renewal date.
        </p>
        <p>
          Refunds are handled on a case-by-case basis. Contact matt@ordinaryworld.co if you have
          a billing issue.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-base font-semibold text-gray-900 mb-3">Service availability</h2>
        <p>
          We aim to keep Reeve available at all times but cannot guarantee uninterrupted access.
          We are not liable for any loss resulting from downtime, data loss, or service
          interruptions. We will communicate planned maintenance in advance where possible.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-base font-semibold text-gray-900 mb-3">Limitation of liability</h2>
        <p>
          Reeve is provided as a tool to assist with tour management. It does not replace
          professional judgement. We are not liable for decisions made based on information
          provided by Reeve, including travel options, schedules, or AI-generated responses.
          Our total liability to you in any circumstances is limited to the amount you paid for
          the service in the preceding 3 months.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-base font-semibold text-gray-900 mb-3">Changes to these terms</h2>
        <p>
          We may update these terms from time to time. We will notify you by email before any
          material changes take effect. Continued use of Reeve after that point constitutes
          acceptance of the updated terms.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-base font-semibold text-gray-900 mb-3">Termination</h2>
        <p>
          You can cancel your account at any time from within the app. We reserve the right to
          suspend or terminate accounts that breach these terms. On termination, your data is
          deleted in accordance with our Privacy Policy.
        </p>
      </section>

      <section>
        <h2 className="text-base font-semibold text-gray-900 mb-3">Governing law</h2>
        <p>
          These terms are governed by the laws of England and Wales. Any disputes will be
          subject to the exclusive jurisdiction of the courts of England and Wales.
        </p>
      </section>
    </main>
  )
}
