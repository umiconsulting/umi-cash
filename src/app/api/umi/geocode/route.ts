import { NextRequest, NextResponse } from 'next/server';
import { verifyUmiSession } from '@/lib/umi-auth';

/**
 * GET /api/umi/geocode?address=...
 * Geocode an address using Google Maps Geocoding API.
 * Returns { latitude, longitude, formattedAddress }.
 */
export async function GET(req: NextRequest) {
  if (!await verifyUmiSession(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const address = req.nextUrl.searchParams.get('address');
  if (!address || address.length < 3) {
    return NextResponse.json({ error: 'Address is required' }, { status: 400 });
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Google Maps API key not configured' }, { status: 503 });
  }

  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  url.searchParams.set('address', address);
  url.searchParams.set('key', apiKey);
  url.searchParams.set('language', 'es');
  url.searchParams.set('region', 'mx');

  const res = await fetch(url.toString());
  const data = await res.json();

  if (data.status !== 'OK' || !data.results?.length) {
    return NextResponse.json({ error: 'No results found', status: data.status }, { status: 404 });
  }

  const result = data.results[0];
  return NextResponse.json({
    latitude: result.geometry.location.lat,
    longitude: result.geometry.location.lng,
    formattedAddress: result.formatted_address,
  });
}
