export const metadata = {
  title: 'Data Deletion — Reeve',
  description: 'How to request deletion of your data from Reeve.',
}

export default function DataDeletionPage() {
  return (
    <main className="max-w-2xl mx-auto px-6 py-16 text-sm text-gray-700">
      <h1 className="text-2xl font-semibold text-gray-900 mb-2">Data Deletion</h1>
      <p className="text-gray-500 mb-10">Last updated: 11 June 2026</p>

      <section className="mb-8">
        <h2 className="text-base font-semibold text-gray-900 mb-3">Delete your account and data</h2>
        <p className="mb-3">
          You can delete your Reeve account and all associated data at any time from within the
          app under Settings. All personal data is permanently removed within 30 days of
          deletion.
        </p>
        <p>
          If you no longer have access to your account, email matt@ordinaryworld.co with the
          subject line &quot;Data deletion request&quot; and we will process it within 30 days.
        </p>
      </section>

      <section>
        <h2 className="text-base font-semibold text-gray-900 mb-3">What gets deleted</h2>
        <p className="mb-3">On account deletion, we remove:</p>
        <ul className="list-disc list-inside space-y-1">
          <li>Your account and login credentials</li>
          <li>All tour data, show data, and crew records you entered</li>
          <li>All documents stored in Reeve</li>
          <li>All message logs and communication history</li>
        </ul>
      </section>
    </main>
  )
}
