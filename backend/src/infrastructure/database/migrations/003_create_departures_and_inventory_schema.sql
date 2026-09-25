-- Migration: 003_create_departures_and_inventory_schema.sql
-- Description: Create departure_schedules and inventory_holds tables with constraints, enums, and performance/trigram indexes for Phase 4.

-- 1. Departure Status Enum (Canonical Lifecycle)
DO $$ BEGIN
    CREATE TYPE departure_status AS ENUM ('OPEN', 'CLOSED', 'CANCELLED', 'COMPLETED');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- 2. Inventory Hold Status Enum (Canonical Hold Lifecycle)
DO $$ BEGIN
    CREATE TYPE inventory_hold_status AS ENUM ('ACTIVE', 'COMMITTED', 'EXPIRED', 'RELEASED');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- 3. Departure Schedules Table (DR-006 + DEC-4-008 Optional Price Overrides)
CREATE TABLE IF NOT EXISTS departure_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    package_id UUID NOT NULL REFERENCES tour_packages(id) ON DELETE CASCADE,
    departure_date DATE NOT NULL,
    return_date DATE NOT NULL,
    total_seat_capacity INTEGER NOT NULL CHECK (total_seat_capacity > 0),
    booked_seats INTEGER NOT NULL DEFAULT 0 CHECK (booked_seats >= 0),
    price_override_adult BIGINT CHECK (price_override_adult IS NULL OR price_override_adult >= 0),
    price_override_child BIGINT CHECK (price_override_child IS NULL OR price_override_child >= 0),
    currency VARCHAR(3) NOT NULL DEFAULT 'INR',
    status departure_status NOT NULL DEFAULT 'OPEN',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_departure_return_dates CHECK (return_date >= departure_date),
    CONSTRAINT chk_departure_capacity_bounds CHECK (booked_seats <= total_seat_capacity),
    UNIQUE (package_id, departure_date)
);

-- 4. Inventory Holds Table (DR-006 Temporary 15-Minute Locks)
CREATE TABLE IF NOT EXISTS inventory_holds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    departure_id UUID NOT NULL REFERENCES departure_schedules(id) ON DELETE CASCADE,
    checkout_session_token VARCHAR(100) UNIQUE NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    held_seats INTEGER NOT NULL CHECK (held_seats > 0),
    status inventory_hold_status NOT NULL DEFAULT 'ACTIVE',
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_departures_pkg_date ON departure_schedules (package_id, departure_date);
CREATE INDEX IF NOT EXISTS idx_departures_status_date ON departure_schedules (status, departure_date);
CREATE INDEX IF NOT EXISTS idx_inventory_holds_active ON inventory_holds (departure_id, status, expires_at);

-- 6. Search Trigram Indexes (pg_trgm extension)
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_tour_packages_title_trgm ON tour_packages USING gin (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_destinations_city_trgm ON destinations USING gin (city_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_destinations_country_trgm ON destinations USING gin (country gin_trgm_ops);
