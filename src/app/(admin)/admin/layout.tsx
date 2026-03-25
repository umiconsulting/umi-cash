'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

function IconHome({ active }: { active: boolean }) {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2 : 1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

function IconCamera({ active }: { active: boolean }) {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2 : 1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}

function IconCard({ active }: { active: boolean }) {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2 : 1.5} strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
      <line x1="1" y1="10" x2="23" y2="10" />
    </svg>
  );
}

function IconUsers({ active }: { active: boolean }) {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2 : 1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 00-3-3.87" />
      <path d="M16 3.13a4 4 0 010 7.75" />
    </svg>
  );
}

function IconStar({ active }: { active: boolean }) {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2 : 1.5} strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

const NAV_ITEMS = [
  { href: '/admin', label: 'Inicio', exact: true, Icon: IconHome },
  { href: '/admin/scan', label: 'Escanear', exact: false, Icon: IconCamera },
  { href: '/admin/topup', label: 'Recargar', exact: false, Icon: IconCard },
  { href: '/admin/customers', label: 'Clientes', exact: false, Icon: IconUsers },
  { href: '/admin/rewards', label: 'Recompensas', exact: false, Icon: IconStar },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    const storedRole = localStorage.getItem('userRole');
    if (!token || !['STAFF', 'ADMIN'].includes(storedRole || '')) {
      window.location.href = '/admin-login';
      return;
    }
    setRole(storedRole);
  }, []);

  function handleLogout() {
    fetch('/api/auth/logout', { method: 'POST' }).finally(() => {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('userRole');
      window.location.href = '/admin-login';
    });
  }

  if (!role) {
    return (
      <div className="min-h-screen bg-coffee-cream flex items-center justify-center">
        <div className="text-coffee-medium">Verificando acceso...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-coffee-cream">
      <header className="bg-coffee-dark text-white px-4 py-3 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <span className="font-semibold tracking-tight">El Gran Ribera</span>
          <span className="text-coffee-light text-xs">
            {role === 'ADMIN' ? '· Admin' : '· Personal'}
          </span>
        </div>
        <button onClick={handleLogout} className="text-coffee-light text-sm hover:text-white">
          Salir
        </button>
      </header>

      <main className="pb-20 min-h-[calc(100vh-120px)]">{children}</main>

      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-coffee-pale z-50">
        <div className="flex">
          {NAV_ITEMS.map((item) => {
            const isActive = item.exact
              ? pathname === item.href
              : pathname.startsWith(item.href) && item.href !== '/admin';

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex-1 flex flex-col items-center py-2.5 px-1 text-xs transition-colors ${
                  isActive ? 'text-coffee-dark' : 'text-coffee-light hover:text-coffee-medium'
                }`}
              >
                <item.Icon active={isActive} />
                <span className={`mt-1 ${isActive ? 'font-semibold' : ''}`}>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
