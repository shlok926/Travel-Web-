# Phase 5 — Booking Engine Data Model & Database Architecture

**Project:** Young Tours & Travels  
**Phase:** 5 — Booking Engine  
**Document:** Database Schema, Tables, Constraints & Snapshot Schema  
**Status:** **STEP 0 — PLANNING (DOCUMENTATION-ONLY • NO CODE)** [DOCUMENTED]

---

## 1. Relational Schema Architecture

```
                    ┌───────────────────────────┐
                    │      tour_packages        │
                    └─────────────┬─────────────┘
                                  │
                                  v
┌─────────────────┐ 1   * ┌─────────────────────┐ 1   * ┌───────────────────┐
│     users       ├──────►│ departure_schedules ├──────►│  inventory_holds  │
└────────┬────────┘       └──────────┬──────────┘       └───────────────────┘
         │                           │
         │ 1                         │ 1
         │                           │
         │ *                         │ *
         └─────────────►┌────────────▼──────────────┐
                        │         bookings          │
                        └────────────┬──────────────┘
                                     │ 1
                                     │
                                     │ *
                        ┌────────────▼──────────────┐
                        │    booking_passengers     │
                        └───────────────────────────┘
```

---

## 2. Table Specifications

### 2.1 `bookings` Table

```sql
CREATE TYPE booking_status AS ENUM (
    'AWAITING_PAYMENT',
    'CONFIRMED',
    'CANCELLED',
    'EXPIRED'
);

CREATE TABLE bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_reference VARCHAR(20) UNIQUE NOT NULL, -- e.g. BK-20261115-A8F2
    customer_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    departure_id UUID NOT NULL REFERENCES departure_schedules(id) ON DELETE RESTRICT,
    hold_id UUID REFERENCES inventory_holds(id) ON DELETE SET NULL,

    party_size INTEGER NOT NULL CHECK (party_size > 0),
    party_adults INTEGER NOT NULL CHECK (party_adults > 0),
    party_children INTEGER NOT NULL DEFAULT 0 CHECK (party_children >= 0),

    total_price BIGINT NOT NULL CHECK (total_price >= 0), -- Minor units (paise/cents)
    currency VARCHAR(3) NOT NULL DEFAULT 'INR',
    status booking_status NOT NULL DEFAULT 'AWAITING_PAYMENT',

    -- Immutable historical snapshots
    price_breakdown JSONB NOT NULL,
    package_snapshot JSONB NOT NULL,
    itinerary_snapshot JSONB NOT NULL,

    cancellation_reason TEXT,
    cancelled_at TIMESTAMPTZ,
    confirmed_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_party_size_sum CHECK (party_size = party_adults + party_children)
);

CREATE INDEX idx_bookings_customer_created ON bookings (customer_id, created_at DESC);
CREATE INDEX idx_bookings_departure_status ON bookings (departure_id, status);
CREATE INDEX idx_bookings_status_created ON bookings (status, created_at DESC);
```

---

### 2.2 `booking_passengers` Table

```sql
CREATE TYPE passenger_type AS ENUM ('ADULT', 'CHILD');
CREATE TYPE passenger_gender AS ENUM ('MALE', 'FEMALE', 'OTHER');

CREATE TABLE booking_passengers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,

    passenger_type passenger_type NOT NULL,
    full_name VARCHAR(120) NOT NULL,
    age INTEGER NOT NULL CHECK (age >= 0 AND age <= 120),
    gender passenger_gender NOT NULL,

    is_primary_contact BOOLEAN NOT NULL DEFAULT FALSE,
    contact_email VARCHAR(255),
    contact_phone VARCHAR(30),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_passengers_booking ON booking_passengers (booking_id);
```

---

### 2.3 `idempotency_keys` Table (Checkout Safety)

```sql
CREATE TABLE idempotency_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key VARCHAR(255) UNIQUE NOT NULL,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    endpoint VARCHAR(100) NOT NULL,
    request_hash VARCHAR(64) NOT NULL,
    response_code INTEGER,
    response_body JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours')
);

CREATE INDEX idx_idempotency_lookup ON idempotency_keys (key, user_id);
CREATE INDEX idx_idempotency_expires ON idempotency_keys (expires_at);
```

---

## 3. Snapshot Data Schemas

### 3.1 `price_breakdown` (JSONB)

```json
{
  "adultCount": 2,
  "adultUnitPrice": 4500000,
  "adultSubtotal": 9000000,
  "childCount": 1,
  "childUnitPrice": 2250000,
  "childSubtotal": 2250000,
  "baseSubtotal": 11250000,
  "discountAmount": 0,
  "totalPrice": 11250000,
  "currency": "INR",
  "calculatedAt": "2026-09-26T05:45:00.000Z"
}
```

### 3.2 `package_snapshot` (JSONB)

```json
{
  "packageId": "11111111-1111-1111-1111-111111111111",
  "slug": "kashmir-delight-tour",
  "title": "Kashmir Delight Tour",
  "shortDescription": "6 Days in paradise with Shikara ride and Gulmarg Gondola.",
  "durationDays": 6,
  "durationNights": 5,
  "originCity": "Delhi",
  "destinationCity": "Srinagar",
  "destinationCountry": "India",
  "heroImageUrl": "https://images.unsplash.com/photo-kashmir.jpg",
  "inclusions": ["Houseboat Stay", "Daily Breakfast & Dinner", "Shikara Ride"],
  "exclusions": ["Airfare", "Personal Expenses"],
  "accommodationTier": "STANDARD",
  "mealPlan": "FULL_BOARD"
}
```

### 3.3 `itinerary_snapshot` (JSONB)

```json
[
  {
    "dayNumber": 1,
    "title": "Arrival in Srinagar & Dal Lake",
    "activityDescription": "Airport pickup, transfer to Houseboat, sunset Shikara ride on Dal Lake.",
    "mealsIncluded": ["DINNER"],
    "accommodationNotes": "Deluxe Houseboat"
  },
  {
    "dayNumber": 2,
    "title": "Gulmarg Day Trip & Gondola",
    "activityDescription": "Full day excursion to Gulmarg with Gondola cable car phase 1 & 2.",
    "mealsIncluded": ["BREAKFAST", "DINNER"],
    "accommodationNotes": "Deluxe Houseboat"
  }
]
```
