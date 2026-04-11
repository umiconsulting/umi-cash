'use client';

import { useParams } from 'next/navigation';

export default function GiftCardsPage() {
  const { slug } = useParams<{ slug: string }>();

  return (
    <div className="p-4 max-w-lg mx-auto">
      <div className="flex items-center justify-between mt-4 mb-6">
        <h1 className="font-display text-2xl font-bold text-coffee-dark">Tarjetas de Regalo</h1>
      </div>

      <div className="card-surface border-2 border-amber-300 bg-amber-50 mb-6">
        <div className="text-center py-4">
          <p className="text-2xl mb-2">🚧</p>
          <p className="font-semibold text-amber-800">Próximamente</p>
          <p className="text-sm text-amber-700 mt-1">Esta función estará disponible pronto. Te notificaremos cuando esté lista.</p>
        </div>
      </div>

      {/* Feature content will be restored when gift cards are ready */}
    </div>
  );
}
