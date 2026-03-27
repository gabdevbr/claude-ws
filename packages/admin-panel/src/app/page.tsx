import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-purple-50 via-blue-50 to-pink-50">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">Admin Panel</h1>
        <p className="text-lg text-gray-600 mb-8">Docker Pool Management System</p>
        <div className="space-y-4">
          <Link
            href="/admin"
            className="inline-block px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
          >
            Go to Admin Dashboard
          </Link>
          <div className="mt-8 p-4 bg-white/50 backdrop-blur-sm rounded-lg">
            <p className="text-sm text-gray-600">
              Status: <span className="text-green-600 font-semibold">● Running</span>
            </p>
            <p className="text-sm text-gray-600 mt-2">
              API: <Link href="/api/health" className="text-blue-600 hover:underline">Health Check</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
