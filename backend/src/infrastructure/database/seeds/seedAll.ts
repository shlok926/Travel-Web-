import { DatabaseService } from '../index.js';
import { loadEnv } from '../../../config/env.js';
import { seedAdmin } from './seedAdmin.js';
import { seedCatalogue } from './seedCatalogue.js';

/**
 * Unified database seed orchestrator running both admin provisioning and catalogue seeding.
 */
export async function seedAll(): Promise<void> {
  const config = loadEnv();
  const db = new DatabaseService(config);

  try {
    console.info('🚀 Starting complete database seeding...\n');

    // 1. Seed Admin
    console.info('--- 1. Provisioning Admin User ---');
    const adminResult = await seedAdmin(db, config);
    if (adminResult.status === 'created') {
      console.info(`✅ Admin user created: ${adminResult.email} (ID: ${adminResult.userId})`);
    } else {
      console.info(
        `ℹ️ Admin user already exists: ${adminResult.email} (ID: ${adminResult.userId})`,
      );
    }

    // 2. Seed Catalogue
    console.info('\n--- 2. Seeding Travel Catalogue ---');
    const catalogueResult = await seedCatalogue(db, {
      isProduction: config.NODE_ENV === 'production',
      allowProductionSeed: process.env.ALLOW_SEED === 'true',
    });

    console.info(
      `✅ Themes: ${catalogueResult.themes.inserted} inserted, ${catalogueResult.themes.updated} updated`,
    );
    console.info(
      `✅ Destinations: ${catalogueResult.destinations.inserted} inserted, ${catalogueResult.destinations.updated} updated`,
    );
    console.info(
      `✅ Packages: ${catalogueResult.packages.inserted} inserted, ${catalogueResult.packages.updated} updated`,
    );
    console.info(
      `✅ Itineraries: ${catalogueResult.itineraries.inserted} inserted, ${catalogueResult.itineraries.updated} updated`,
    );

    console.info('\n🎉 All database seeds completed successfully!');
  } catch (err) {
    console.error('\n❌ Seed execution failed:', err instanceof Error ? err.message : err);
    process.exit(1);
  } finally {
    await db.close();
  }
}

if (
  process.argv[1] &&
  (process.argv[1].endsWith('seedAll.ts') || process.argv[1].endsWith('seedAll.js'))
) {
  void seedAll();
}
