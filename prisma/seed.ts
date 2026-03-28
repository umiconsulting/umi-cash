import { PrismaClient } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';

const prisma = new PrismaClient();

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = createHash('sha256').update(password + salt).digest('hex');
  return `${salt}:${hash}`;
}

function generateCardNumber(prefix: string): string {
  const num = Math.floor(Math.random() * 9_000_000_000) + 1_000_000_000;
  return `${prefix}-${num}`;
}

async function seedTenant({
  slug,
  name,
  city,
  cardPrefix,
  primaryColor,
  secondaryColor,
  logoUrl,
  stripImageUrl,
  passStyle,
  locations,
  rewardConfig,
  admin,
  staff,
  demoCustomer,
}: {
  slug: string;
  name: string;
  city: string;
  cardPrefix: string;
  primaryColor: string;
  secondaryColor: string;
  logoUrl?: string;
  stripImageUrl?: string;
  passStyle?: string;
  locations: { name: string; address: string }[];
  rewardConfig: { visitsRequired: number; rewardName: string; rewardDescription: string };
  admin: { email: string; password: string };
  staff: { email: string; name: string; password: string };
  demoCustomer: { name: string; phone: string };
}) {
  const tenant = await prisma.tenant.upsert({
    where: { slug },
    update: { name, city, primaryColor, secondaryColor, logoUrl, stripImageUrl, passStyle },
    create: { slug, name, city, cardPrefix, primaryColor, secondaryColor, logoUrl, stripImageUrl, passStyle: passStyle ?? 'default', selfRegistration: true },
  });

  console.log(`Tenant: ${tenant.name} (${tenant.slug})`);

  // Locations
  for (const loc of locations) {
    await prisma.location.upsert({
      where: { id: `${slug}-${loc.name.toLowerCase().replace(/\s+/g, '-')}` },
      update: {},
      create: {
        id: `${slug}-${loc.name.toLowerCase().replace(/\s+/g, '-')}`,
        tenantId: tenant.id,
        name: loc.name,
        address: loc.address,
        isActive: true,
      },
    });
  }

  // Reward config
  await prisma.rewardConfig.upsert({
    where: { id: `${slug}-default` },
    update: {},
    create: {
      id: `${slug}-default`,
      tenantId: tenant.id,
      visitsRequired: rewardConfig.visitsRequired,
      rewardName: rewardConfig.rewardName,
      rewardDescription: rewardConfig.rewardDescription,
      isActive: true,
    },
  });

  // Admin user
  const adminUser = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: admin.email } },
    update: {},
    create: {
      tenantId: tenant.id,
      email: admin.email,
      name: 'Admin',
      role: 'ADMIN',
      passwordHash: hashPassword(admin.password),
    },
  });
  console.log(`  Admin: ${admin.email}`);

  // Staff user
  const staffUser = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: staff.email } },
    update: {},
    create: {
      tenantId: tenant.id,
      email: staff.email,
      name: staff.name,
      role: 'STAFF',
      passwordHash: hashPassword(staff.password),
    },
  });
  console.log(`  Staff: ${staff.email}`);

  // Demo customer
  const customer = await prisma.user.upsert({
    where: { tenantId_phone: { tenantId: tenant.id, phone: demoCustomer.phone } },
    update: {},
    create: {
      tenantId: tenant.id,
      phone: demoCustomer.phone,
      name: demoCustomer.name,
      role: 'CUSTOMER',
    },
  });

  const existingCard = await prisma.loyaltyCard.findUnique({ where: { userId: customer.id } });

  if (!existingCard) {
    const card = await prisma.loyaltyCard.create({
      data: {
        tenantId: tenant.id,
        userId: customer.id,
        cardNumber: generateCardNumber(cardPrefix),
        balanceCentavos: 15000,
        totalVisits: 7,
        visitsThisCycle: 7,
        qrToken: randomBytes(16).toString('hex'),
      },
    });

    const now = new Date();
    for (let i = 7; i >= 1; i--) {
      await prisma.visit.create({
        data: {
          cardId: card.id,
          staffId: staffUser.id,
          scannedAt: new Date(now.getTime() - i * 2 * 24 * 60 * 60 * 1000),
        },
      });
    }

    await prisma.transaction.create({
      data: {
        cardId: card.id,
        staffId: staffUser.id,
        type: 'TOPUP',
        amountCentavos: 15000,
        description: 'Recarga inicial en tienda',
      },
    });

    console.log(`  Demo customer card: ${card.cardNumber}`);
  }

  return { tenant, adminUser, staffUser };
}

async function main() {
  console.log('Seeding database...');

  await seedTenant({
    slug: 'elgranribera',
    name: 'El Gran Ribera',
    city: 'Culiacán, Sinaloa',
    cardPrefix: 'EGR',
    primaryColor: '#B5605A',
    secondaryColor: '#F5E6D3',
    logoUrl: '/logos/ribera-white.png',
    stripImageUrl: '/logos/ribera-strip.png',
    passStyle: 'stamps',
    locations: [
      { name: 'Sucursal Principal', address: 'Culiacán, Sinaloa' },
    ],
    rewardConfig: {
      visitsRequired: 10,
      rewardName: 'Bebida gratis',
      rewardDescription: 'Elige cualquier bebida del menú. ¡Te lo has ganado!',
    },
    admin: {
      email: process.env.EGR_ADMIN_EMAIL || 'admin@elgranribera.mx',
      password: process.env.EGR_ADMIN_PASSWORD || 'ElGranRibera2024!',
    },
    staff: { email: 'barista@elgranribera.mx', name: 'Barista', password: 'Barista2024!' },
    demoCustomer: { name: 'María García', phone: '+5215512345678' },
  });

  await seedTenant({
    slug: 'kalalacafe',
    name: 'Kalala Café',
    city: 'Culiacán, Sinaloa',
    cardPrefix: 'KLC',
    primaryColor: '#2D5A3D',
    secondaryColor: '#F06080',
    logoUrl: '/logos/kalala-logo.png',
    passStyle: 'stamps',
    locations: [
      { name: 'Sucursal Centro', address: 'Centro, Culiacán, Sinaloa' },
      { name: 'Sucursal Norte', address: 'Norte, Culiacán, Sinaloa' },
    ],
    rewardConfig: {
      visitsRequired: 8,
      rewardName: 'Bebida gratis',
      rewardDescription: 'Elige cualquier bebida del menú. ¡Te lo has ganado!',
    },
    admin: {
      email: process.env.KLC_ADMIN_EMAIL || 'admin@kalalacafe.mx',
      password: process.env.KLC_ADMIN_PASSWORD || 'KalalaCafe2024!',
    },
    staff: { email: 'barista@kalalacafe.mx', name: 'Barista Kalala', password: 'Barista2024!' },
    demoCustomer: { name: 'Carlos López', phone: '+5216871234567' },
  });

  console.log('Seeding complete!');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
