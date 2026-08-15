// Database seed — creates initial data for development

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Create admin user
  const adminPassword = await bcrypt.hash('admin123', 12);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@cmc.io' },
    update: {},
    create: {
      email: 'admin@cmc.io',
      passwordHash: adminPassword,
      name: 'Admin User',
      isSuperAdmin: true,
      isStaff: true,
      status: 'ACTIVE',
      locale: 'en',
      timezone: 'UTC',
    },
  });
  console.log(`  ✓ Admin user created: admin@cmc.io / admin123`);

  // Create roles
  const adminRole = await prisma.role.upsert({
    where: { name: 'Super Admin' },
    update: {},
    create: { name: 'Super Admin', description: 'Full system access', isSystem: true, isSuperAdmin: true },
  });

  const editorRole = await prisma.role.upsert({
    where: { name: 'Editor' },
    update: {},
    create: { name: 'Editor', description: 'Can create and edit content', isSystem: true },
  });

  const authorRole = await prisma.role.upsert({
    where: { name: 'Author' },
    update: {},
    create: { name: 'Author', description: 'Can create content', isSystem: true },
  });

  // Assign admin to role
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: admin.id, roleId: adminRole.id } },
    update: {},
    create: { userId: admin.id, roleId: adminRole.id },
  });

  // Create currencies
  const currencies = [
    { code: 'USD', name: 'US Dollar', symbol: '$', isDefault: true, isActive: true, decimalDigits: 2, rate: 1 },
    { code: 'EUR', name: 'Euro', symbol: '€', isDefault: false, isActive: true, decimalDigits: 2, rate: 0.92 },
    { code: 'GBP', name: 'British Pound', symbol: '£', isDefault: false, isActive: true, decimalDigits: 2, rate: 0.79 },
    { code: 'AED', name: 'UAE Dirham', symbol: 'د.إ', isDefault: false, isActive: true, decimalDigits: 2, rate: 3.67 },
  ];

  for (const currency of currencies) {
    await prisma.currency.upsert({
      where: { code: currency.code },
      update: {},
      create: currency,
    });
  }
  console.log(`  ✓ ${currencies.length} currencies created`);

  // Create default store
  const store = await prisma.store.upsert({
    where: { slug: 'default' },
    update: {},
    create: {
      name: 'Default Store',
      slug: 'default',
      status: 'active',
      defaultCurrencyId: (await prisma.currency.findUnique({ where: { code: 'USD' } }))!.id,
      defaultLocale: 'en',
      supportedLocales: ['en', 'fr', 'de', 'es', 'ar'],
    },
  });
  console.log(`  ✓ Default store created`);

  // Create default region
  const usd = await prisma.currency.findUnique({ where: { code: 'USD' } });
  if (usd) {
    await prisma.region.upsert({
      where: { id: 'us-region' },
      update: {},
      create: {
        id: 'us-region',
        name: 'United States',
        code: 'US',
        countries: ['US'],
        currencyId: usd.id,
        taxRate: 0.08,
        isTaxIncluded: false,
      },
    });
  }

  // Create initial content types
  const articleType = await prisma.contentType.upsert({
    where: { name: 'article' },
    update: {},
    create: {
      name: 'article',
      label: 'Article',
      apiIdentifier: 'article',
      description: 'Blog posts and news articles',
      isVersioned: true,
      hasDraft: true,
    },
  });

  // Add fields to article type
  const articleFields = [
    { name: 'title', label: 'Title', type: 'TEXT' as const, required: true, sortOrder: 0 },
    { name: 'slug', label: 'Slug', type: 'SLUG' as const, required: true, sortOrder: 1 },
    { name: 'content', label: 'Content', type: 'RICH_TEXT' as const, required: true, sortOrder: 2 },
    { name: 'excerpt', label: 'Excerpt', type: 'TEXTAREA' as const, sortOrder: 3 },
    { name: 'featured_image', label: 'Featured Image', type: 'MEDIA' as const, sortOrder: 4 },
    { name: 'category', label: 'Category', type: 'TEXT' as const, sortOrder: 5 },
    { name: 'tags', label: 'Tags', type: 'JSON' as const, sortOrder: 6 },
    { name: 'published_date', label: 'Published Date', type: 'DATETIME' as const, sortOrder: 7 },
  ];

  for (const field of articleFields) {
    await prisma.contentField.upsert({
      where: { id: `${articleType.id}-${field.name}` },
      update: {},
      create: {
        id: `${articleType.id}-${field.name}`,
        contentTypeId: articleType.id,
        ...field,
      },
    });
  }

  // Create page type
  await prisma.contentType.upsert({
    where: { name: 'page' },
    update: {},
    create: {
      name: 'page',
      label: 'Page',
      apiIdentifier: 'page',
      description: 'Static pages',
      isVersioned: true,
      hasDraft: true,
    },
  });

  // Create settings
  const settings = [
    { key: 'site_name', value: 'CMC Platform', group: 'general' },
    { key: 'site_description', value: 'Content, Media & Commerce', group: 'general' },
    { key: 'default_locale', value: 'en', group: 'general' },
    { key: 'default_currency', value: 'USD', group: 'payments' },
    { key: 'storage_driver', value: 'local', group: 'storage' },
  ];

  for (const setting of settings) {
    await prisma.setting.upsert({
      where: { key: setting.key },
      update: {},
      create: setting as any,
    });
  }

  console.log('  ✓ Settings created');
  console.log('✅ Database seeded successfully!');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());