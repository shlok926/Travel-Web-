-- Migration: 006_create_admin_and_cms_schema.sql
-- Description: Create hero_sliders, cms_pages, and admin_audit_logs tables with strict constraints, indexes, and audit preservation for Phase 7 Admin & Operations.

-- 1. Hero Sliders Table (Homepage Banners & Call-to-Action Sliders)
CREATE TABLE IF NOT EXISTS hero_sliders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(128) NOT NULL,
    subtitle VARCHAR(256),
    image_url VARCHAR(512) NOT NULL,
    cta_label VARCHAR(64),
    cta_url VARCHAR(256),
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. CMS Pages Table (Static Informational & Legal Pages)
CREATE TABLE IF NOT EXISTS cms_pages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug VARCHAR(64) UNIQUE NOT NULL,
    title VARCHAR(128) NOT NULL,
    content_html TEXT NOT NULL,
    meta_description VARCHAR(256),
    is_published BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Admin Audit Logs Table (Append-Only Operational Audit Trail)
CREATE TABLE IF NOT EXISTS admin_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    action VARCHAR(64) NOT NULL,
    entity_type VARCHAR(32) NOT NULL,
    entity_id VARCHAR(64) NOT NULL,
    details JSONB,
    ip_address VARCHAR(45),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Indexes for Performance and Query Optimization
CREATE INDEX IF NOT EXISTS idx_hero_sliders_sort ON hero_sliders (sort_order);
CREATE INDEX IF NOT EXISTS idx_hero_sliders_active ON hero_sliders (is_active);
CREATE INDEX IF NOT EXISTS idx_cms_pages_is_published ON cms_pages (is_published);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_admin_id ON admin_audit_logs (admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_entity ON admin_audit_logs (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created_at ON admin_audit_logs (created_at);
