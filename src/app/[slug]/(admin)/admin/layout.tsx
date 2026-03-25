'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useParams } from 'next/navigation';
import { useTenant } from '@/context/TenantContext';

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

function IconSettings({ active }: { active: boolean }) {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2 : 1.5} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  );
}

function IconGift({ active }: { active: boolean }) {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2 : 1.5} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 12 20 22 4 22 4 12" />
      <rect x="2" y="7" width="20" height="5" />
      <line x1="12" y1="22" x2="12" y2="7" />
      <path d="M12 7H7.5a2.5 2.5 0 010-5C11 2 12 7 12 7z" />
      <path d="M12 7h4.5a2.5 2.5 0 000-5C13 2 12 7 12 7z" />
    </svg>
  );
}

function IconChart({ active }: { active: boolean }) {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2 : 1.5} strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10"/>
      <line x1="12" y1="20" x2="12" y2="4"/>
      <line x1="6" y1="20" x2="6" y2="14"/>
      <line x1="2" y1="20" x2="22" y2="20"/>
    </svg>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { slug } = useParams<{ slug: string }>();
  const pathname = usePathname();
  const tenant = useTenant();
  const [role, setRole] = useState<string | null>(null);
  const [suspended, setSuspended] = useState(false);

  const NAV_ITEMS = [
    { href: `/${slug}/admin`, label: 'Inicio', exact: true, Icon: IconHome, roles: ['STAFF', 'ADMIN'] },
    { href: `/${slug}/admin/scan`, label: 'Escanear', exact: false, Icon: IconCamera, roles: ['STAFF', 'ADMIN'] },
    { href: `/${slug}/admin/topup`, label: 'Recargar', exact: false, Icon: IconCard, roles: ['STAFF', 'ADMIN'] },
    { href: `/${slug}/admin/customers`, label: 'Clientes', exact: false, Icon: IconUsers, roles: ['STAFF', 'ADMIN'] },
    { href: `/${slug}/admin/gift-cards`, label: 'Regalos', exact: false, Icon: IconGift, roles: ['STAFF', 'ADMIN'] },
    { href: `/${slug}/admin/rewards`, label: 'Recompensas', exact: false, Icon: IconStar, roles: ['ADMIN'] },
    { href: `/${slug}/admin/analytics`, label: 'Analíticas', exact: false, Icon: IconChart, roles: ['ADMIN'] },
    { href: `/${slug}/admin/settings`, label: 'Config', exact: false, Icon: IconSettings, roles: ['ADMIN'] },
  ].filter((item) => item.roles.includes(role ?? ''));

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    const storedRole = localStorage.getItem('userRole');
    if (!token || !['STAFF', 'ADMIN'].includes(storedRole || '')) {
      window.location.href = `/${slug}/admin-login`;
      return;
    }
    setRole(storedRole);
    fetch(`/api/${slug}/admin/stats`, {
      headers: { Authorization: `Bearer ${token}` }
    }).then(r => { if (r.status === 402) setSuspended(true); }).catch(() => {});
  }, [slug]);

  function handleLogout() {
    fetch(`/api/${slug}/auth/logout`, { method: 'POST' }).finally(() => {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('userRole');
      window.location.href = `/${slug}/admin-login`;
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
          <span className="font-semibold tracking-tight">{tenant.name}</span>
          <span className="text-coffee-light text-xs">
            {role === 'ADMIN' ? '· Admin' : '· Personal'}
          </span>
        </div>
        <button onClick={handleLogout} className="text-coffee-light text-sm hover:text-white">
          Salir
        </button>
      </header>

      {suspended && (
        <div className="bg-red-600 text-white px-4 py-3 text-sm text-center">
          <strong>Cuenta suspendida.</strong> Contacta a Umi Cash para reactivar tu acceso: <a href="mailto:hola@umiconsulting.co" className="underline">hola@umiconsulting.co</a>
        </div>
      )}

      <main className="pb-20 min-h-[calc(100vh-120px)]">{children}</main>

      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-coffee-pale z-50">
        <div className="flex">
          {NAV_ITEMS.map((item) => {
            const isActive = item.exact
              ? pathname === item.href
              : pathname.startsWith(item.href) && item.href !== `/${slug}/admin`;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex-1 flex flex-col items-center py-2.5 px-1 text-xs transition-colors ${
                  isActive ? 'nav-active font-semibold' : 'text-coffee-light hover:text-coffee-medium'
                }`}
              >
                <item.Icon active={isActive} />
                <span className="mt-1">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
