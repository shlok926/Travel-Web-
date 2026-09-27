import { escapeHtml } from './escapeHtml.js';
import { BookingEntity } from '../../booking/repositories/booking.repository.js';
import { TicketVoucherEntity } from '../repositories/ticketVoucher.repository.js';
import { PassengerDto } from '../../../../../shared/src/index.js';

export interface VoucherTemplateData {
  voucher: TicketVoucherEntity;
  booking: BookingEntity;
  passengers: PassengerDto[];
  companyName?: string;
  companyPhone?: string;
  companyEmail?: string;
}

export function renderVoucherHtml(data: VoucherTemplateData): string {
  const { voucher, booking, passengers } = data;
  const companyName = escapeHtml(data.companyName ?? 'Young Tours & Travels');
  const companyPhone = escapeHtml(data.companyPhone ?? '+91 11 2345 6789');
  const companyEmail = escapeHtml(data.companyEmail ?? 'support@youngtoursandtravels.com');

  const voucherCode = escapeHtml(voucher.voucherCode);
  const bookingReference = escapeHtml(booking.bookingReference);
  const issuedDate = escapeHtml(
    new Date(voucher.createdAt).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }),
  );

  const customerName = escapeHtml(
    (booking.primaryContact as any)?.fullName ??
      (booking.primaryContact as any)?.name ??
      'Lead Passenger',
  );
  const customerEmail = escapeHtml(booking.primaryContact?.email ?? 'N/A');
  const customerPhone = escapeHtml(booking.primaryContact?.phone ?? 'N/A');

  const pkg = booking.packageSnapshot;
  const packageTitle = escapeHtml(pkg?.title ?? 'Tour Package');
  const originCity = escapeHtml(pkg?.originCity ?? 'Origin');
  const destinationCity = escapeHtml(pkg?.destinationCity ?? 'Destination');
  const duration = escapeHtml(
    `${pkg?.durationDays ?? 1} Days / ${pkg?.durationNights ?? 0} Nights`,
  );
  const departureDate = escapeHtml(booking.departureSnapshot?.departureDate ?? 'N/A');
  const returnDate = escapeHtml(booking.departureSnapshot?.returnDate ?? 'N/A');

  const partySize = escapeHtml(booking.partySize);

  // Passenger roster
  const passengerRows = passengers
    .map(
      (p, idx) => `<tr>
        <td style="text-align: center;">${idx + 1}</td>
        <td><strong>${escapeHtml(p.fullName)}</strong></td>
        <td>${escapeHtml(p.passengerType)}</td>
        <td>${escapeHtml(p.ageAtBooking)} yrs</td>
        <td>${escapeHtml(p.gender)}</td>
        <td>${escapeHtml(p.specialRequests ?? 'None')}</td>
      </tr>`,
    )
    .join('');

  // Itinerary days
  const itineraryDays = Array.isArray(booking.itinerarySnapshot)
    ? booking.itinerarySnapshot
    : Array.isArray((booking.itinerarySnapshot as any)?.days)
      ? (booking.itinerarySnapshot as any).days
      : [];

  const itineraryItems = itineraryDays
    .map(
      (day: any) => `<div class="itinerary-day">
        <div class="day-badge">Day ${escapeHtml(day.dayNumber)}: ${escapeHtml(day.title)}</div>
        <div class="day-desc">${escapeHtml(day.activityDescription ?? day.activity ?? '')}</div>
        ${
          day.mealsIncluded && day.mealsIncluded.length > 0
            ? `<div class="day-meals"><strong>Meals:</strong> ${escapeHtml(day.mealsIncluded.join(', '))}</div>`
            : ''
        }
      </div>`,
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Travel Voucher - ${voucherCode}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
      color: #1a202c;
      background: #ffffff;
      padding: 30px;
      font-size: 13px;
      line-height: 1.5;
    }
    .voucher-container {
      max-width: 800px;
      margin: 0 auto;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 30px;
      background: #ffffff;
    }
    .header-table {
      width: 100%;
      border-bottom: 2px solid #2b6cb0;
      padding-bottom: 15px;
      margin-bottom: 20px;
    }
    .brand-title {
      font-size: 24px;
      font-weight: 800;
      color: #2b6cb0;
      letter-spacing: -0.5px;
    }
    .voucher-heading {
      text-align: right;
    }
    .voucher-title {
      font-size: 20px;
      font-weight: 800;
      color: #2d3748;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .status-confirmed {
      display: inline-block;
      background: #38a169;
      color: #ffffff;
      font-size: 11px;
      font-weight: 700;
      padding: 3px 10px;
      border-radius: 4px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-top: 4px;
    }
    .grid-table {
      width: 100%;
      margin-bottom: 20px;
      border-collapse: collapse;
    }
    .grid-cell {
      vertical-align: top;
      width: 50%;
      padding: 10px;
      background: #f7fafc;
      border: 1px solid #edf2f7;
      border-radius: 4px;
    }
    .section-header {
      font-size: 14px;
      font-weight: 700;
      color: #2b6cb0;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin: 20px 0 10px 0;
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 4px;
    }
    .roster-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 15px;
    }
    .roster-table th {
      background: #edf2f7;
      color: #4a5568;
      text-align: left;
      padding: 8px 10px;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      border-top: 1px solid #cbd5e0;
      border-bottom: 1px solid #cbd5e0;
    }
    .roster-table td {
      padding: 8px 10px;
      border-bottom: 1px solid #e2e8f0;
      font-size: 12px;
    }
    .itinerary-day {
      margin-bottom: 12px;
      padding: 8px 12px;
      background: #f7fafc;
      border-left: 3px solid #3182ce;
      border-radius: 0 4px 4px 0;
    }
    .day-badge {
      font-weight: 700;
      color: #2b6cb0;
      font-size: 13px;
    }
    .day-desc {
      color: #4a5568;
      font-size: 12px;
      margin-top: 2px;
    }
    .day-meals {
      color: #718096;
      font-size: 11px;
      margin-top: 3px;
    }
    .notice-box {
      background: #ebf8ff;
      border: 1px solid #bee3f8;
      border-radius: 4px;
      padding: 12px;
      margin-top: 20px;
      font-size: 11px;
      color: #2b6cb0;
    }
    .footer {
      border-top: 1px solid #e2e8f0;
      padding-top: 12px;
      margin-top: 20px;
      font-size: 11px;
      color: #718096;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="voucher-container">
    <table class="header-table">
      <tr>
        <td>
          <div class="brand-title">${companyName}</div>
          <div style="color: #718096; font-size: 12px;">Official Tour Booking E-Ticket & Voucher</div>
          <div style="color: #718096; font-size: 11px;">Support: ${companyPhone} | ${companyEmail}</div>
        </td>
        <td class="voucher-heading">
          <div class="voucher-title">E-TICKET / TRAVEL VOUCHER</div>
          <div style="font-size: 13px; font-weight: 700; color: #2b6cb0;">${voucherCode}</div>
          <div style="font-size: 11px; color: #718096;">Issued: ${issuedDate}</div>
          <div class="status-confirmed">&#10004; CONFIRMED & PAID</div>
        </td>
      </tr>
    </table>

    <table class="grid-table">
      <tr>
        <td class="grid-cell" style="margin-right: 10px;">
          <div style="font-weight: 700; color: #4a5568; font-size: 12px; margin-bottom: 4px;">TOUR DETAILS</div>
          <div style="font-size: 14px; font-weight: 700; color: #1a202c;">${packageTitle}</div>
          <div style="color: #4a5568; font-size: 12px;"><strong>Route:</strong> ${originCity} &rarr; ${destinationCity}</div>
          <div style="color: #4a5568; font-size: 12px;"><strong>Duration:</strong> ${duration}</div>
          <div style="color: #4a5568; font-size: 12px;"><strong>Departure:</strong> ${departureDate}</div>
          <div style="color: #4a5568; font-size: 12px;"><strong>Return:</strong> ${returnDate}</div>
        </td>
        <td class="grid-cell" style="padding-left: 15px;">
          <div style="font-weight: 700; color: #4a5568; font-size: 12px; margin-bottom: 4px;">BOOKING SUMMARY</div>
          <div style="color: #4a5568; font-size: 12px;"><strong>Booking Reference:</strong> ${bookingReference}</div>
          <div style="color: #4a5568; font-size: 12px;"><strong>Lead Guest:</strong> ${customerName}</div>
          <div style="color: #4a5568; font-size: 12px;"><strong>Contact Email:</strong> ${customerEmail}</div>
          <div style="color: #4a5568; font-size: 12px;"><strong>Contact Phone:</strong> ${customerPhone}</div>
          <div style="color: #4a5568; font-size: 12px;"><strong>Party Size:</strong> ${partySize} Persons</div>
        </td>
      </tr>
    </table>

    <div class="section-header">Passenger Roster (${passengers.length} Travellers)</div>
    <table class="roster-table">
      <thead>
        <tr>
          <th style="width: 35px; text-align: center;">#</th>
          <th>Full Name</th>
          <th>Type</th>
          <th>Age</th>
          <th>Gender</th>
          <th>Special Requests</th>
        </tr>
      </thead>
      <tbody>
        ${passengerRows}
      </tbody>
    </table>

    ${
      itineraryItems
        ? `
      <div class="section-header">Itinerary Schedule</div>
      ${itineraryItems}
    `
        : ''
    }

    <div class="notice-box">
      <strong>Important Travel Instructions:</strong>
      <ul style="margin-left: 18px; margin-top: 4px;">
        <li>Please present this voucher along with a valid government-issued photo ID at check-in.</li>
        <li>Reach the reporting point at least 30 minutes prior to the scheduled departure time.</li>
        <li>For any on-ground support, contact our 24x7 helpline: ${companyPhone}.</li>
      </ul>
    </div>

    <div class="footer">
      Thank you for choosing ${companyName}. Have a safe and memorable journey!
    </div>
  </div>
</body>
</html>`;
}
