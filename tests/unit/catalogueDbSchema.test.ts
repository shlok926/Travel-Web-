import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Catalogue Database Schema & Migration DDL Constraints Verification (Phase 3 Step 1)', () => {
  const migrationPath = path.resolve(
    __dirname,
    '../../backend/src/infrastructure/database/migrations/002_create_catalogue_schema.sql',
  );

  let sqlContent: string;

  beforeEach(async () => {
    sqlContent = await fs.readFile(migrationPath, 'utf-8');
  });

  describe('1. Destinations Table Definition', () => {
    it('should define destinations table with all required columns, constraints, and defaults', () => {
      expect(sqlContent).toMatch(/CREATE TABLE IF NOT EXISTS destinations/i);

      // Primary Key
      expect(sqlContent).toMatch(/id\s+UUID\s+PRIMARY\s+KEY\s+DEFAULT\s+gen_random_uuid\(\)/i);

      // Slug: VARCHAR(100) UNIQUE NOT NULL
      expect(sqlContent).toMatch(/slug\s+VARCHAR\(100\)\s+UNIQUE\s+NOT\s+NULL/i);

      // City Name & Country
      expect(sqlContent).toMatch(/city_name\s+VARCHAR\(100\)\s+NOT\s+NULL/i);
      expect(sqlContent).toMatch(/country\s+VARCHAR\(100\)\s+NOT\s+NULL/i);

      // Description & Thumbnail URL
      expect(sqlContent).toMatch(/description\s+TEXT\s+NOT\s+NULL/i);
      expect(sqlContent).toMatch(/thumbnail_url\s+TEXT\s+NOT\s+NULL/i);

      // Hero Image URL (Nullable)
      expect(sqlContent).toMatch(/hero_image_url\s+TEXT/i);

      // Boolean Flags
      expect(sqlContent).toMatch(/is_featured\s+BOOLEAN\s+NOT\s+NULL\s+DEFAULT\s+FALSE/i);
      expect(sqlContent).toMatch(/is_published\s+BOOLEAN\s+NOT\s+NULL\s+DEFAULT\s+FALSE/i);

      // Timestamps
      expect(sqlContent).toMatch(
        /created_at\s+TIMESTAMPTZ\s+NOT\s+NULL\s+DEFAULT\s+(NOW\(\)|CURRENT_TIMESTAMP)/i,
      );
      expect(sqlContent).toMatch(
        /updated_at\s+TIMESTAMPTZ\s+NOT\s+NULL\s+DEFAULT\s+(NOW\(\)|CURRENT_TIMESTAMP)/i,
      );
    });
  });

  describe('2. Themes Table Definition', () => {
    it('should define themes table with all required columns and constraints', () => {
      expect(sqlContent).toMatch(/CREATE TABLE IF NOT EXISTS themes/i);

      // Primary Key
      expect(sqlContent).toMatch(/id\s+UUID\s+PRIMARY\s+KEY\s+DEFAULT\s+gen_random_uuid\(\)/i);

      // Slug: VARCHAR(100) UNIQUE NOT NULL
      expect(sqlContent).toMatch(/slug\s+VARCHAR\(100\)\s+UNIQUE\s+NOT\s+NULL/i);

      // Title: VARCHAR(100) NOT NULL
      expect(sqlContent).toMatch(/title\s+VARCHAR\(100\)\s+NOT\s+NULL/i);

      // Description & Icon URL
      expect(sqlContent).toMatch(/description\s+TEXT/i);
      expect(sqlContent).toMatch(/icon_url\s+TEXT/i);

      // Created At
      expect(sqlContent).toMatch(
        /created_at\s+TIMESTAMPTZ\s+NOT\s+NULL\s+DEFAULT\s+(NOW\(\)|CURRENT_TIMESTAMP)/i,
      );
    });
  });

  describe('3. Tour Packages Table Definition', () => {
    it('should define tour_packages table with foreign keys, checks, minor-unit prices, and JSONB defaults', () => {
      expect(sqlContent).toMatch(/CREATE TABLE IF NOT EXISTS tour_packages/i);

      // Primary Key
      expect(sqlContent).toMatch(/id\s+UUID\s+PRIMARY\s+KEY\s+DEFAULT\s+gen_random_uuid\(\)/i);

      // Foreign Key -> destinations with ON DELETE RESTRICT
      expect(sqlContent).toMatch(
        /destination_id\s+UUID\s+NOT\s+NULL\s+REFERENCES\s+destinations\s*\(\s*id\s*\)\s+ON\s+DELETE\s+RESTRICT/i,
      );

      // Foreign Key -> themes with ON DELETE SET NULL
      expect(sqlContent).toMatch(
        /theme_id\s+UUID\s+REFERENCES\s+themes\s*\(\s*id\s*\)\s+ON\s+DELETE\s+SET\s+NULL/i,
      );

      // Slug: VARCHAR(150) UNIQUE NOT NULL
      expect(sqlContent).toMatch(/slug\s+VARCHAR\(150\)\s+UNIQUE\s+NOT\s+NULL/i);

      // Title & Descriptions
      expect(sqlContent).toMatch(/title\s+VARCHAR\(255\)\s+NOT\s+NULL/i);
      expect(sqlContent).toMatch(/short_description\s+VARCHAR\(500\)\s+NOT\s+NULL/i);
      expect(sqlContent).toMatch(/description\s+TEXT\s+NOT\s+NULL/i);

      // Durations with CHECK constraints
      expect(sqlContent).toMatch(
        /duration_days\s+INTEGER\s+NOT\s+NULL\s+CHECK\s*\(\s*duration_days\s*>\s*0\s*\)/i,
      );
      expect(sqlContent).toMatch(
        /duration_nights\s+INTEGER\s+NOT\s+NULL\s+CHECK\s*\(\s*duration_nights\s*>=\s*0\s*\)/i,
      );

      // Origin & Destination Cities
      expect(sqlContent).toMatch(/origin_city\s+VARCHAR\(100\)\s+NOT\s+NULL/i);
      expect(sqlContent).toMatch(/destination_city\s+VARCHAR\(100\)\s+NOT\s+NULL/i);

      // Minor Unit Monetary Fields (BIGINT in paise) with CHECK constraints
      expect(sqlContent).toMatch(
        /base_adult_price\s+BIGINT\s+NOT\s+NULL\s+CHECK\s*\(\s*base_adult_price\s*>=\s*0\s*\)/i,
      );
      expect(sqlContent).toMatch(
        /base_child_price\s+BIGINT\s+NOT\s+NULL\s+DEFAULT\s+0\s+CHECK\s*\(\s*base_child_price\s*>=\s*0\s*\)/i,
      );
      expect(sqlContent).toMatch(/currency\s+VARCHAR\(3\)\s+NOT\s+NULL\s+DEFAULT\s+['"]INR['"]/i);

      // Media
      expect(sqlContent).toMatch(/hero_image_url\s+TEXT\s+NOT\s+NULL/i);
      expect(sqlContent).toMatch(
        /gallery_urls\s+JSONB\s+NOT\s+NULL\s+DEFAULT\s+['"]\[\]['"]::jsonb/i,
      );

      // Inclusions & Exclusions JSONB
      expect(sqlContent).toMatch(
        /inclusions\s+JSONB\s+NOT\s+NULL\s+DEFAULT\s+['"]\[\]['"]::jsonb/i,
      );
      expect(sqlContent).toMatch(
        /exclusions\s+JSONB\s+NOT\s+NULL\s+DEFAULT\s+['"]\[\]['"]::jsonb/i,
      );

      // Tiers & Meal Plans JSONB
      expect(sqlContent).toMatch(/accommodation_tiers\s+JSONB\s+NOT\s+NULL/i);
      expect(sqlContent).toMatch(/meal_plans\s+JSONB\s+NOT\s+NULL/i);

      // Publication Flags
      expect(sqlContent).toMatch(/is_published\s+BOOLEAN\s+NOT\s+NULL\s+DEFAULT\s+FALSE/i);
      expect(sqlContent).toMatch(/is_featured\s+BOOLEAN\s+NOT\s+NULL\s+DEFAULT\s+FALSE/i);

      // Timestamps
      expect(sqlContent).toMatch(/created_at\s+TIMESTAMPTZ\s+NOT\s+NULL/i);
      expect(sqlContent).toMatch(/updated_at\s+TIMESTAMPTZ\s+NOT\s+NULL/i);
    });
  });

  describe('4. Itinerary Days Table Definition', () => {
    it('should define itinerary_days table with cascade FK, positive day_number check, and composite unique constraint', () => {
      expect(sqlContent).toMatch(/CREATE TABLE IF NOT EXISTS itinerary_days/i);

      // Primary Key
      expect(sqlContent).toMatch(/id\s+UUID\s+PRIMARY\s+KEY\s+DEFAULT\s+gen_random_uuid\(\)/i);

      // Foreign Key -> tour_packages with ON DELETE CASCADE
      expect(sqlContent).toMatch(
        /package_id\s+UUID\s+NOT\s+NULL\s+REFERENCES\s+tour_packages\s*\(\s*id\s*\)\s+ON\s+DELETE\s+CASCADE/i,
      );

      // Day Number with positive check
      expect(sqlContent).toMatch(
        /day_number\s+INTEGER\s+NOT\s+NULL\s+CHECK\s*\(\s*day_number\s*>\s*0\s*\)/i,
      );

      // Title & Activity Description
      expect(sqlContent).toMatch(/title\s+VARCHAR\(255\)\s+NOT\s+NULL/i);
      expect(sqlContent).toMatch(/activity_description\s+TEXT\s+NOT\s+NULL/i);

      // Meals Included JSONB
      expect(sqlContent).toMatch(
        /meals_included\s+JSONB\s+NOT\s+NULL\s+DEFAULT\s+['"]\[\]['"]::jsonb/i,
      );

      // Accommodation Notes
      expect(sqlContent).toMatch(/accommodation_notes\s+TEXT/i);

      // Composite Unique Constraint: UNIQUE (package_id, day_number)
      expect(sqlContent).toMatch(/UNIQUE\s*\(\s*package_id\s*,\s*day_number\s*\)/i);

      // Timestamps
      expect(sqlContent).toMatch(/created_at\s+TIMESTAMPTZ\s+NOT\s+NULL/i);
      expect(sqlContent).toMatch(/updated_at\s+TIMESTAMPTZ\s+NOT\s+NULL/i);
    });
  });

  describe('5. Non-redundant Secondary Performance Indexes', () => {
    it('should create necessary foreign key, publication, and price query indexes', () => {
      // Destination publication filter index
      expect(sqlContent).toMatch(
        /CREATE INDEX IF NOT EXISTS idx_destinations_publication ON destinations\s*\(\s*is_published\s*,\s*is_featured\s*\)/i,
      );

      // Tour package foreign key indexes
      expect(sqlContent).toMatch(
        /CREATE INDEX IF NOT EXISTS idx_tour_packages_destination_id ON tour_packages\s*\(\s*destination_id\s*\)/i,
      );
      expect(sqlContent).toMatch(
        /CREATE INDEX IF NOT EXISTS idx_tour_packages_theme_id ON tour_packages\s*\(\s*theme_id\s*\)/i,
      );

      // Tour package publication filter index
      expect(sqlContent).toMatch(
        /CREATE INDEX IF NOT EXISTS idx_tour_packages_publication ON tour_packages\s*\(\s*is_published\s*,\s*is_featured\s*\)/i,
      );

      // Tour package base price range filter index
      expect(sqlContent).toMatch(
        /CREATE INDEX IF NOT EXISTS idx_tour_packages_price ON tour_packages\s*\(\s*base_adult_price\s*\)/i,
      );

      // Must NOT contain redundant manual indexes on UNIQUE constraint columns
      expect(sqlContent).not.toMatch(/CREATE INDEX.*idx_destinations_slug/i);
      expect(sqlContent).not.toMatch(/CREATE INDEX.*idx_themes_slug/i);
      expect(sqlContent).not.toMatch(/CREATE INDEX.*idx_tour_packages_slug/i);
    });
  });
});
