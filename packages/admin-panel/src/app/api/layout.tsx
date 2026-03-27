import './globals.css';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50 to-blue-50">
      {/* Navigation */}
      <nav className="backdrop-blur-xl bg-white/70 border-b border-white/20 shadow-sm sticky top-0 z-50">
        <div className="container mx-auto px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-white font-bold shadow-lg">
                C
              </div>
              <div>
                <h1 className="font-bold text-gray-900">Claude WS Admin</h1>
                <p className="text-xs text-gray-600">Multi-Project Management</p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <button className="px-4 py-2 rounded-lg backdrop-blur-sm bg-white/50 border border-white/30 hover:bg-white/70 transition-all text-sm font-medium text-gray-700">
                Dashboard
              </button>
              <button className="px-4 py-2 rounded-lg backdrop-blur-sm bg-white/50 border border-white/30 hover:bg-white/70 transition-all text-sm font-medium text-gray-700">
                Projects
              </button>
              <button className="px-4 py-2 rounded-lg backdrop-blur-sm bg-white/50 border border-white/30 hover:bg-white/70 transition-all text-sm font-medium text-gray-700">
                Logs
              </button>
              <button className="px-4 py-2 rounded-lg bg-gradient-to-r from-purple-500 to-blue-500 text-white text-sm font-medium shadow-lg hover:shadow-xl transition-all">
                Quick Actions
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="container mx-auto py-8">
        {children}
      </main>

      {/* Footer */}
      <footer className="backdrop-blur-xl bg-white/30 border-t border-white/20 mt-12">
        <div className="container mx-auto px-8 py-6 text-center text-sm text-gray-600">
          <p>Claude Workspace Admin Dashboard • Pool Management System</p>
          <p className="mt-1 text-xs">Container isolation for secure project execution</p>
        </div>
      </footer>
    </div>
  );
}
