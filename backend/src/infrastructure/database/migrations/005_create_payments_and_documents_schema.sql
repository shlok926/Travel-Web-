-- Migration: 005_create_payments_and_documents_schema.sql
-- Description: Create payment_transactions, payment_events, tax_invoices, ticket_vouchers, cancellation_requests, and refund_settlements tables with strict constraints, enums, indexes, and statutory financial retention for Phase 6.

-- 1. Payment Status Enum (Payment Lifecycle)
DO $$ BEGIN
    CREATE TYPE payment_status AS ENUM ('INITIATED', 'PENDING', 'SUCCESS', 'FAILED', 'REFUNDED');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- 2. Cancellation Request Status Enum (Cancellation & Refund Workflow)
DO $$ BEGIN
    CREATE TYPE cancellation_status AS ENUM ('PENDING_APPROVAL', 'AUTHORIZED', 'REJECTED', 'COMPLETED');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- 3. Refund Settlement Status Enum (Financial Refund Settlement Audit)
DO $$ BEGIN
    CREATE TYPE refund_settlement_status AS ENUM ('PROCESSING', 'SETTLED', 'FAILED');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- 4. Payment Transactions Table (DR-008 Payment Gateway Transactions)
CREATE TABLE IF NOT EXISTS payment_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE RESTRICT,
    provider VARCHAR(32) NOT NULL, -- e.g. 'RAZORPAY', 'STRIPE', 'MOCK'
    gateway_order_id VARCHAR(128),
    gateway_payment_id VARCHAR(128),
    amount BIGINT NOT NULL CHECK (amount >= 0), -- Stored in minor units (e.g. paise / cents)
    currency VARCHAR(3) NOT NULL DEFAULT 'INR',
    status payment_status NOT NULL DEFAULT 'INITIATED',
    idempotency_key VARCHAR(128) UNIQUE,
    gateway_response_payload JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Payment Events Table (Idempotent Webhook Log & Replay Guard)
CREATE TABLE IF NOT EXISTS payment_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider VARCHAR(32) NOT NULL,
    event_id VARCHAR(128) NOT NULL,
    event_type VARCHAR(128) NOT NULL,
    payload JSONB NOT NULL,
    processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_payment_events_provider_event UNIQUE (provider, event_id)
);

-- 6. Tax Invoices Table (DR-009 Statutory Tax Invoices & 7-Year Retention)
CREATE TABLE IF NOT EXISTS tax_invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_number VARCHAR(64) UNIQUE NOT NULL, -- e.g. INV-YYYYMM-XXXX
    booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE RESTRICT,
    customer_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    gstin_number VARCHAR(32),
    taxable_amount BIGINT NOT NULL CHECK (taxable_amount >= 0), -- Minor units
    gst_amount BIGINT NOT NULL CHECK (gst_amount >= 0), -- Minor units
    total_amount BIGINT NOT NULL CHECK (total_amount >= 0), -- Minor units
    currency VARCHAR(3) NOT NULL DEFAULT 'INR',
    pdf_storage_key VARCHAR(512), -- Private S3 storage key only (no binary or public URLs)
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Ticket Vouchers Table (DR-010 E-Ticket / Travel Vouchers)
CREATE TABLE IF NOT EXISTS ticket_vouchers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    voucher_code VARCHAR(64) UNIQUE NOT NULL, -- e.g. VCH-YYYYMMDD-XXXX
    booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE RESTRICT,
    pdf_storage_key VARCHAR(512), -- Private S3 storage key only
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. Cancellation Requests Table (DR-011 Operational Cancellation & Refund Audit)
CREATE TABLE IF NOT EXISTS cancellation_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE RESTRICT,
    requested_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    cancellation_reason TEXT NOT NULL,
    calculated_refund_amount BIGINT NOT NULL DEFAULT 0 CHECK (calculated_refund_amount >= 0), -- Minor units
    calculated_penalty_amount BIGINT NOT NULL DEFAULT 0 CHECK (calculated_penalty_amount >= 0), -- Minor units
    status cancellation_status NOT NULL DEFAULT 'PENDING_APPROVAL',
    admin_notes TEXT,
    authorized_by UUID REFERENCES users(id) ON DELETE RESTRICT,
    authorized_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. Refund Settlements Table (DR-012 Financial Refund Settlement Audit)
CREATE TABLE IF NOT EXISTS refund_settlements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cancellation_request_id UUID REFERENCES cancellation_requests(id) ON DELETE RESTRICT,
    payment_transaction_id UUID NOT NULL REFERENCES payment_transactions(id) ON DELETE RESTRICT,
    gateway_refund_id VARCHAR(128),
    refund_amount BIGINT NOT NULL CHECK (refund_amount >= 0), -- Minor units
    currency VARCHAR(3) NOT NULL DEFAULT 'INR',
    settlement_status refund_settlement_status NOT NULL DEFAULT 'PROCESSING',
    error_message TEXT,
    processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 10. Indexes for Fast Lookups and Event Deduplication
CREATE INDEX IF NOT EXISTS idx_payment_tx_booking ON payment_transactions (booking_id);
CREATE INDEX IF NOT EXISTS idx_payment_tx_provider_order ON payment_transactions (provider, gateway_order_id);
CREATE INDEX IF NOT EXISTS idx_payment_tx_provider_payment ON payment_transactions (provider, gateway_payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_tx_status ON payment_transactions (status);
CREATE INDEX IF NOT EXISTS idx_payment_events_processed ON payment_events (processed_at);
CREATE INDEX IF NOT EXISTS idx_tax_invoices_booking ON tax_invoices (booking_id);
CREATE INDEX IF NOT EXISTS idx_tax_invoices_customer ON tax_invoices (customer_id);
CREATE INDEX IF NOT EXISTS idx_tax_invoices_created ON tax_invoices (created_at);
CREATE INDEX IF NOT EXISTS idx_ticket_vouchers_booking ON ticket_vouchers (booking_id);
CREATE INDEX IF NOT EXISTS idx_cancellation_requests_booking ON cancellation_requests (booking_id);
CREATE INDEX IF NOT EXISTS idx_cancellation_requests_status ON cancellation_requests (status);
CREATE INDEX IF NOT EXISTS idx_refund_settlements_cancellation ON refund_settlements (cancellation_request_id);
CREATE INDEX IF NOT EXISTS idx_refund_settlements_payment ON refund_settlements (payment_transaction_id);
CREATE INDEX IF NOT EXISTS idx_refund_settlements_gateway_refund ON refund_settlements (gateway_refund_id);
