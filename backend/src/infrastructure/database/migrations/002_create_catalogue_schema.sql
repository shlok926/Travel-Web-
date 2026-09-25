-- Migration: 002_create_catalogue_schema.sql
-- Description: Create destinations, themes, tour_packages, and itinerary_days tables with constraints and indexes for Phase 3 Travel Catalogue.

-- 1. Destinations Table (DR-002)
CREATE TABLE IF NOT EXISTS destinations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug VARCHAR(100) UNIQUE NOT NULL,
    city_name VARCHAR(100) NOT NULL,
    country VARCHAR(100) NOT NULL,
    description TEXT NOT NULL,
    thumbnail_url TEXT NOT NULL,
    hero_image_url TEXT,
    is_featured BOOLEAN NOT NULL DEFAULT FALSE,
    is_published BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Tour Themes Table (DR-003)
CREATE TABLE IF NOT EXISTS themes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug VARCHAR(100) UNIQUE NOT NULL,
    title VARCHAR(100) NOT NULL,
    description TEXT,
    icon_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Tour Packages Table (DR-004)
CREATE TABLE IF NOT EXISTS tour_packages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    destination_id UUID NOT NULL REFERENCES destinations(id) ON DELETE RESTRICT,
    theme_id UUID REFERENCES themes(id) ON DELETE SET NULL,
    slug VARCHAR(150) UNIQUE NOT NULL,
    title VARCHAR(255) NOT NULL,
    short_description VARCHAR(500) NOT NULL,
    description TEXT NOT NULL,
    duration_days INTEGER NOT NULL CHECK (duration_days > 0),
    duration_nights INTEGER NOT NULL CHECK (duration_nights >= 0),
    origin_city VARCHAR(100) NOT NULL,
    destination_city VARCHAR(100) NOT NULL,
    base_adult_price BIGINT NOT NULL CHECK (base_adult_price >= 0),
    base_child_price BIGINT NOT NULL DEFAULT 0 CHECK (base_child_price >= 0),
    currency VARCHAR(3) NOT NULL DEFAULT 'INR',
    hero_image_url TEXT NOT NULL,
    gallery_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
    inclusions JSONB NOT NULL DEFAULT '[]'::jsonb,
    exclusions JSONB NOT NULL DEFAULT '[]'::jsonb,
    accommodation_tiers JSONB NOT NULL DEFAULT '["BUDGET", "STANDARD", "LUXURY"]'::jsonb,
    meal_plans JSONB NOT NULL DEFAULT '["BREAKFAST", "HALF_BOARD", "FULL_BOARD"]'::jsonb,
    is_published BOOLEAN NOT NULL DEFAULT FALSE,
    is_featured BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Day-by-Day Itineraries Table (DR-005)
CREATE TABLE IF NOT EXISTS itinerary_days (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    package_id UUID NOT NULL REFERENCES tour_packages(id) ON DELETE CASCADE,
    day_number INTEGER NOT NULL CHECK (day_number > 0),
    title VARCHAR(255) NOT NULL,
    activity_description TEXT NOT NULL,
    meals_included JSONB NOT NULL DEFAULT '[]'::jsonb,
    accommodation_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (package_id, day_number)
);

-- 5. Non-unique Performance Indexes
-- Note: UNIQUE columns (slugs and composite unique constraints) automatically have unique B-tree indexes.
CREATE INDEX IF NOT EXISTS idx_destinations_publication ON destinations (is_published, is_featured);
CREATE INDEX IF NOT EXISTS idx_tour_packages_destination_id ON tour_packages (destination_id);
CREATE INDEX IF NOT EXISTS idx_tour_packages_theme_id ON tour_packages (theme_id);
CREATE INDEX IF NOT EXISTS idx_tour_packages_publication ON tour_packages (is_published, is_featured);
CREATE INDEX IF NOT EXISTS idx_tour_packages_price ON tour_packages (base_adult_price);
