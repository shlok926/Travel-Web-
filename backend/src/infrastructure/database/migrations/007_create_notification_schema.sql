-- Migration: 007_create_notification_schema.sql
-- Description: Create notification_channel, notification_type, notification_status enums, and notification_deliveries table with strict constraints and indexes for Phase 8 Transactional Notifications.

-- 1. Notification Channel Enum (Delivery Channels)
DO $$ BEGIN
    CREATE TYPE notification_channel AS ENUM ('EMAIL', 'SMS');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- 2. Notification Type Enum (Domain Lifecycle Communication Events)
DO $$ BEGIN
    CREATE TYPE notification_type AS ENUM (
        'BOOKING_CONFIRMED',
        'DOCUMENT_READY',
        'REFUND_SETTLED',
        'BOOKING_CANCELLED'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- 3. Notification Status Enum (Delivery Lifecycle State)
DO $$ BEGIN
    CREATE TYPE notification_status AS ENUM ('PENDING', 'SENT', 'FAILED', 'RETRYING');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- 4. Notification Deliveries Table (Transactional Notification Audit & Idempotency)
CREATE TABLE IF NOT EXISTS notification_deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    idempotency_key VARCHAR(128) NOT NULL UNIQUE,
    recipient_email VARCHAR(255) NOT NULL,
    recipient_phone VARCHAR(32),
    channel notification_channel NOT NULL DEFAULT 'EMAIL',
    notification_type notification_type NOT NULL,
    reference_id VARCHAR(64) NOT NULL,
    subject VARCHAR(255) NOT NULL,
    status notification_status NOT NULL DEFAULT 'PENDING',
    provider_name VARCHAR(64) NOT NULL,
    provider_message_id VARCHAR(128),
    retry_count INTEGER NOT NULL DEFAULT 0,
    error_details JSONB,
    sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 5. Indexes for Operational Lookup, Status Filtering, and Timeline Ordering
CREATE INDEX IF NOT EXISTS idx_notification_deliveries_ref ON notification_deliveries (reference_id);
CREATE INDEX IF NOT EXISTS idx_notification_deliveries_status ON notification_deliveries (status);
CREATE INDEX IF NOT EXISTS idx_notification_deliveries_created_at ON notification_deliveries (created_at DESC);
