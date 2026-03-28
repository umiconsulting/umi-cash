import Link from 'next/link';
import { getTenant } from '@/lib/tenant';
import { getActiveRewardConfig, rewardConfigDefaults } from '@/lib/prisma-helpers';
import { notFound } from 'next/navigation';

function QRCodeMock({ size = 96 }: { size?: number }) {
  const cells: [number, number][] = [
    [8,8],[9,8],[11,8],[8,9],[10,9],[12,9],[9,10],[11,10],[8,11],[12,11],[10,12],[12,12],
    [14,8],[16,8],[18,8],[15,9],[17,9],[14,10],[18,10],[16,11],[14,12],[17,12],
    [8,14],[10,14],[12,14],[9,15],[11,15],[8,16],[12,16],[10,17],[9,18],[11,18],
    [14,14],[16,15],[18,14],[15,16],[14,17],[17,17],[16,18],[18,19],[14,19],
    [20,14],[19,15],[20,16],[19,17],[20,18],
    [9,3],[11,3],[13,3],[10,4],[12,4],[9,5],[13,5],
  ];
  return (
    <svg width={size} height={size} viewBox="0 0 21 21" style={{ imageRendering: 'pixelated' }}>
      <rect width="21" height="21" fill="white" />
      <rect x="0" y="0" width="7" height="7" fill="var(--color-ink)" />
      <rect x="1" y="1" width="5" height="5" fill="white" />
      <rect x="2" y="2" width="3" height="3" fill="var(--color-ink)" />
      <rect x="14" y="0" width="7" height="7" fill="var(--color-ink)" />
      <rect x="15" y="1" width="5" height="5" fill="white" />
      <rect x="16" y="2" width="3" height="3" fill="var(--color-ink)" />
      <rect x="0" y="14" width="7" height="7" fill="var(--color-ink)" />
      <rect x="1" y="15" width="5" height="5" fill="white" />
      <rect x="2" y="16" width="3" height="3" fill="var(--color-ink)" />
      {[8,10,12].map((x) => <rect key={`ht${x}`} x={x} y="6" width="1" height="1" fill="var(--color-ink)" />)}
      {[8,10,12].map((y) => <rect key={`vt${y}`} x="6" y={y} width="1" height="1" fill="var(--color-ink)" />)}
      {cells.map(([x, y], i) => (
        <rect key={i} x={x} y={y} width="1" height="1" fill="var(--color-ink)" />
      ))}
    </svg>
  );
}

export default async function TenantLandingPage({ params }: { params: { slug: string } }) {
  const tenant = await getTenant(params.slug);
  if (!tenant) notFound();

  const rewardConfig = await getActiveRewardConfig(tenant.id);
  const { visitsRequired, rewardName } = rewardConfigDefaults(rewardConfig);
  const cardNumberExample = `${tenant.cardPrefix}-1234567890`;
  const exampleVisits = 4;
  const filled = '●'.repeat(exampleVisits);
  const empty = '○'.repeat(visitsRequired - exampleVisits);

  const primary = tenant.primaryColor;
  const accent = tenant.secondaryColor || primary;

  return (
    <main
      className="min-h-screen bg-coffee-cream"
      style={{ '--tenant-primary': primary, '--tenant-accent': accent } as React.CSSProperties}
    >
      {/* Hero */}
      <div className="text-white px-6 pt-14 pb-12" style={{ background: `linear-gradient(135deg, ${primary} 0%, ${primary}ee 100%)` }}>
        <div className="max-w-sm mx-auto relative z-10">
          <p className="text-white/50 text-xs font-medium tracking-[0.25em] uppercase mb-4">
            {tenant.name}{tenant.city ? ` · ${tenant.city}` : ''}
          </p>
          <h1 className="font-display text-3xl font-bold leading-tight mb-3">
            Tu cafetería favorita,<br />siempre en tu bolsillo.
          </h1>
          <p className="text-white/70 text-sm leading-relaxed mb-8">
            Acumula visitas, gana recompensas de temporada y lleva tu saldo directo en el teléfono. Sin apps extra, sin contraseñas.
          </p>
          <Link
            href={`/${params.slug}/register`}
            className="inline-block bg-white text-coffee-dark font-semibold px-7 py-3 rounded-xl text-sm hover:bg-coffee-pale transition-colors active:scale-95 transform"
          >
            Crear mi tarjeta gratis →
          </Link>
        </div>
      </div>

      {/* Wallet previews */}
      <section className="px-6 py-12 max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <h2 className="font-display text-2xl font-bold text-coffee-dark">
            Así se ve tu tarjeta
          </h2>
          <p className="text-coffee-medium text-sm mt-2">
            Vive en tu teléfono, se actualiza automáticamente después de cada visita.
          </p>
        </div>

        <div className="flex justify-center">
          <div className="w-full max-w-[320px]">
            <div className="rounded-[18px] overflow-hidden shadow-2xl relative" style={{ backgroundColor: primary }}>
              {/* Header: logo + saldo */}
              <div className="px-4 pt-4 pb-2 flex items-start justify-between">
                {tenant.logoUrl ? (
                  <img src={tenant.logoUrl} alt={tenant.name} className="h-10 w-auto object-contain" />
                ) : (
                  <span className="text-white text-2xl font-black tracking-tight uppercase leading-none">{tenant.name}</span>
                )}
                <div className="text-right flex-shrink-0 ml-3">
                  <p className="text-[10px] uppercase tracking-widest font-medium text-white/50">Saldo</p>
                  <p className="text-white text-xl font-bold leading-tight">$150.00</p>
                </div>
              </div>

              {/* Strip image or spacer */}
              {tenant.stripImageUrl && tenant.passStyle !== 'stamps' ? (
                <img src={tenant.stripImageUrl} alt="" className="w-full h-auto" />
              ) : (
                <div className="h-4" />
              )}

              {/* Fields — style depends on tenant passStyle */}
              <div className="px-4 pt-1 pb-3 flex gap-3">
                {tenant.passStyle === 'stamps' ? (<>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] uppercase tracking-widest font-semibold text-white/50">Sellos faltantes</p>
                    <p className="text-white text-lg font-semibold mt-0.5">{visitsRequired - exampleVisits} sellos</p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] uppercase tracking-widest font-semibold text-white/50">Nº de recompensas</p>
                    <p className="text-white text-lg font-semibold mt-0.5">0 premios</p>
                  </div>
                </>) : (<>
                  <div className="min-w-0" style={{ flex: '0 0 40%' }}>
                    <p className="text-[10px] uppercase tracking-widest font-semibold text-white/50">Miembro</p>
                    <p className="text-white text-[13px] font-semibold mt-0.5 truncate">María García</p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] uppercase tracking-widest font-semibold text-white/50">{rewardName.toUpperCase()}</p>
                    <p className="text-white text-[13px] font-semibold mt-0.5 whitespace-nowrap">{filled}{empty} ({exampleVisits}/{visitsRequired})</p>
                  </div>
                </>)}
              </div>

              {/* Spacer */}
              <div className="h-10" />

              {/* QR code + card number */}
              <div className="bg-white mx-auto mb-5 rounded-xl p-3 flex flex-col items-center gap-1 w-fit">
                <QRCodeMock size={120} />
                <p className="text-[10px] font-mono text-gray-400 tracking-wider">{cardNumberExample}</p>
              </div>
            </div>

            {/* Wallet badges */}
            <div className="flex items-center justify-center gap-4 mt-4">
              <div className="flex items-center gap-1.5 text-gray-400 text-xs">
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
                </svg>
                Apple Wallet
              </div>
              <span className="text-gray-200">·</span>
              <div className="flex items-center gap-1.5 text-gray-400 text-xs">
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Google Wallet
              </div>
            </div>
          </div>
        </div>

        <p className="text-center text-xs text-coffee-light mt-8">
          Vistas previas con datos de ejemplo. Tu nombre y saldo real aparecerán al registrarte.
        </p>
      </section>

      {/* How it works */}
      <section className="px-6 pb-12 max-w-sm mx-auto">
        <h2 className="font-display text-xl font-bold text-coffee-dark mb-6 text-center">
          Así funciona
        </h2>
        <div className="space-y-4">
          {[
            { n: '1', title: 'Regístrate una vez', desc: 'Solo tu nombre y teléfono. En 30 segundos tienes tu tarjeta.' },
            { n: '2', title: 'Guárdala en tu teléfono', desc: 'Un tap y vive en Apple Wallet o Google Wallet. Sin registros, sin contraseñas.' },
            { n: '3', title: 'Muestra el QR al barista', desc: 'Cada visita suma automáticamente. Sin abrir apps, sin contraseñas.' },
            { n: '4', title: 'Gana recompensas', desc: `A las ${visitsRequired} visitas: ${rewardName}.` },
          ].map(({ n, title, desc }) => (
            <div key={n} className="flex gap-4 items-start">
              <div
                className="w-8 h-8 rounded-full text-white flex items-center justify-center text-sm font-bold flex-shrink-0"
                style={{ backgroundColor: accent }}
              >
                {n}
              </div>
              <div className="pt-0.5">
                <p className="font-semibold text-coffee-dark">{title}</p>
                <p className="text-sm text-coffee-medium mt-0.5">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Benefits */}
      <section className="px-6 pb-10 max-w-sm mx-auto">
        <div className="grid grid-cols-2 gap-3">
          {[
            { icon: <svg className="w-5 h-5" style={{ color: primary }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2" /><line x1="1" y1="10" x2="23" y2="10" /></svg>, title: 'Sin apps extra', desc: 'Funciona desde Apple Wallet o Google Wallet' },
            { icon: <svg className="w-5 h-5" style={{ color: primary }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 102.13-9.36L1 10" /></svg>, title: 'Se actualiza solo', desc: 'Tu tarjeta refleja cada visita' },
            { icon: <svg className="w-5 h-5" style={{ color: primary }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" /></svg>, title: 'Saldo que no vence', desc: 'Tu dinero, siempre disponible' },
            { icon: <svg className="w-5 h-5" style={{ color: primary }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>, title: 'Recompensas de temporada', desc: 'Sorpresas cada 10 visitas' },
          ].map(({ icon, title, desc }) => (
            <div key={title} className="card-surface">
              <span className="block mb-2">{icon}</span>
              <p className="font-semibold text-coffee-dark text-sm">{title}</p>
              <p className="text-xs text-coffee-medium mt-1">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 pb-12 max-w-sm mx-auto text-center">
        <Link
          href={`/${params.slug}/register`}
          className="block w-full font-semibold px-7 py-3 rounded-xl text-sm text-white hover:opacity-90 transition-opacity active:scale-95 transform text-center"
          style={{ backgroundColor: primary }}
        >
          Crear mi tarjeta gratis
        </Link>
        <p className="text-xs text-coffee-light mt-4">
          Gratis para siempre · Sin tarjeta de crédito · Sin descargar apps
        </p>
      </section>

      {/* Footer */}
      <footer className="border-t border-coffee-pale px-6 py-6 text-center space-y-1">
        <p className="text-xs text-coffee-light">
          <Link href={`/${params.slug}/admin-login`} className="underline hover:text-coffee-medium">Acceso personal</Link>
          {' · '}
          <Link href="/aviso-privacidad" className="underline hover:text-coffee-medium">Aviso de privacidad</Link>
          {' · '}
          <Link href="/terminos" className="underline hover:text-coffee-medium">Términos</Link>
        </p>
        <p className="text-xs text-coffee-pale">{tenant.name}{tenant.city ? ` · ${tenant.city}` : ''}</p>
      </footer>
    </main>
  );
}
