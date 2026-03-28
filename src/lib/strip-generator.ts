/**
 * Dynamic strip image generator for Apple Wallet passes.
 * Generates stamp-card style strips showing visit progress.
 */
import sharp from 'sharp';

const STRIP_W = 1125; // @3x width
const STRIP_H = 369;  // @3x height

function hexToBg(hex?: string): { r: number; g: number; b: number; alpha: number } {
  if (!hex) return { r: 255, g: 182, b: 193, alpha: 1 }; // pink default
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  // Lighten the color for the strip background
  return { r: Math.min(255, r + 40), g: Math.min(255, g + 40), b: Math.min(255, b + 40), alpha: 1 };
}

/**
 * Generate a dynamic stamp-card strip image.
 * Shows filled stamps (with mascot) for completed visits, empty circles for remaining.
 */
export async function generateStampStrip(
  visitsThisCycle: number,
  visitsRequired: number,
  filledStampUrl: string,
  emptyStampUrl: string,
  primaryColor?: string,
): Promise<Buffer> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || '';

  // Fetch stamp images
  const resolveUrl = (url: string) => url.startsWith('/') ? `${appUrl}${url}` : url;
  const [filledRes, emptyRes] = await Promise.all([
    fetch(resolveUrl(filledStampUrl)),
    fetch(resolveUrl(emptyStampUrl)),
  ]);

  const filledBuf = Buffer.from(await filledRes.arrayBuffer());
  const emptyBuf = Buffer.from(await emptyRes.arrayBuffer());

  // Layout: arrange stamps in rows
  // For 10 stamps: 2 rows of 5
  // For other counts: single row if <=6, else 2 rows
  const cols = visitsRequired <= 6 ? visitsRequired : Math.ceil(visitsRequired / 2);
  const rows = visitsRequired <= 6 ? 1 : 2;

  const stampSize = Math.min(
    Math.floor((STRIP_W - 40) / cols) - 10, // horizontal fit
    Math.floor((STRIP_H - 20) / rows) - 10, // vertical fit
    180, // max size
  );

  const totalW = cols * (stampSize + 10) - 10;
  const totalH = rows * (stampSize + 10) - 10;
  const startX = Math.floor((STRIP_W - totalW) / 2);
  const startY = Math.floor((STRIP_H - totalH) / 2);

  // Resize stamp images
  const filledStamp = await sharp(filledBuf).resize(stampSize, stampSize).png().toBuffer();
  const emptyStamp = await sharp(emptyBuf).resize(stampSize, stampSize).png().toBuffer();

  // Build composite operations
  const composites: sharp.OverlayOptions[] = [];
  for (let i = 0; i < visitsRequired; i++) {
    const row = Math.floor(i / cols);
    const col = i % cols;
    const x = startX + col * (stampSize + 10);
    const y = startY + row * (stampSize + 10);
    composites.push({
      input: i < visitsThisCycle ? filledStamp : emptyStamp,
      left: x,
      top: y,
    });
  }

  // Create pink background and composite stamps
  return sharp({
    create: {
      width: STRIP_W,
      height: STRIP_H,
      channels: 4,
      background: hexToBg(primaryColor),
    },
  })
    .composite(composites)
    .png()
    .toBuffer();
}
