import { escapeHtml, formatCurrency } from './escapeHtml.js';
import { BookingEntity } from '../../booking/repositories/booking.repository.js';
import { TaxInvoiceEntity } from '../repositories/taxInvoice.repository.js';

export interface InvoiceTemplateData {
  invoice: TaxInvoiceEntity;
  booking: BookingEntity;
  companyName?: string;
  companyAddress?: string;
  companyGstin?: string;
}

export function renderInvoiceHtml(data: InvoiceTemplateData): string {
  const { invoice, booking } = data;
  const companyName = escapeHtml(data.companyName ?? 'Young Tours & Travels Pvt. Ltd.');
  const companyAddress = escapeHtml(
    data.companyAddress ?? '124 Connaught Place, New Delhi, Delhi 110001, India',
  );
  const companyGstin = escapeHtml(data.companyGstin ?? '07AABCY1234F1Z5');

  const invoiceNumber = escapeHtml(invoice.invoiceNumber);
  const invoiceDate = escapeHtml(
    new Date(invoice.createdAt).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }),
  );
  const bookingReference = escapeHtml(booking.bookingReference);

  const customerName = escapeHtml(
    (booking.primaryContact as any)?.fullName ??
      (booking.primaryContact as any)?.name ??
      'Valued Customer',
  );
  const customerEmail = escapeHtml(booking.primaryContact?.email ?? 'N/A');
  const customerPhone = escapeHtml(booking.primaryContact?.phone ?? 'N/A');

  const packageTitle = escapeHtml(booking.packageSnapshot?.title ?? 'Tour Package');
  const originCity = escapeHtml(booking.packageSnapshot?.originCity ?? 'Origin');
  const destinationCity = escapeHtml(booking.packageSnapshot?.destinationCity ?? 'Destination');
  const departureDate = escapeHtml(booking.departureSnapshot?.departureDate ?? 'N/A');
  const returnDate = escapeHtml(booking.departureSnapshot?.returnDate ?? 'N/A');

  const partySize = escapeHtml(booking.partySize);
  const adultCount = escapeHtml(booking.adultCount);
  const childCount = escapeHtml(booking.childCount);

  const currency = invoice.currency ?? 'INR';
  const taxableStr = formatCurrency(invoice.taxableAmount, currency);
  const gstStr = formatCurrency(invoice.gstAmount, currency);
  const totalStr = formatCurrency(invoice.totalAmount, currency);

  // Split GST 5% into CGST 2.5% and SGST 2.5%
  const cgstAmount = Math.floor(invoice.gstAmount / 2);
  const sgstAmount = invoice.gstAmount - cgstAmount;
  const cgstStr = formatCurrency(cgstAmount, currency);
  const sgstStr = formatCurrency(sgstAmount, currency);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Tax Invoice - ${invoiceNumber}</title>
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
    .invoice-container {
      max-width: 800px;
      margin: 0 auto;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 30px;
      background: #ffffff;
    }
    .header-table {
      width: 100%;
      border-bottom: 2px solid #3182ce;
      padding-bottom: 20px;
      margin-bottom: 25px;
    }
    .company-title {
      font-size: 22px;
      font-weight: 700;
      color: #2b6cb0;
      letter-spacing: -0.5px;
    }
    .company-sub {
      color: #718096;
      font-size: 12px;
    }
    .invoice-badge {
      text-align: right;
    }
    .invoice-heading {
      font-size: 24px;
      font-weight: 800;
      color: #1a202c;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    .meta-table {
      width: 100%;
      margin-bottom: 25px;
    }
    .meta-box {
      vertical-align: top;
      width: 50%;
    }
    .section-title {
      font-size: 12px;
      font-weight: 700;
      color: #4a5568;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 6px;
    }
    .meta-content {
      color: #2d3748;
      font-size: 13px;
    }
    .items-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 25px;
    }
    .items-table th {
      background: #edf2f7;
      color: #2d3748;
      text-align: left;
      padding: 10px 12px;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      border-top: 1px solid #cbd5e0;
      border-bottom: 1px solid #cbd5e0;
    }
    .items-table td {
      padding: 12px;
      border-bottom: 1px solid #e2e8f0;
    }
    .text-right { text-align: right; }
    .text-center { text-align: center; }
    .summary-table {
      width: 100%;
      margin-bottom: 25px;
    }
    .summary-left {
      width: 55%;
      vertical-align: top;
    }
    .summary-right {
      width: 45%;
      vertical-align: top;
    }
    .summary-row {
      display: flex;
      justify-content: space-between;
      padding: 6px 0;
      font-size: 13px;
    }
    .total-row {
      display: flex;
      justify-content: space-between;
      padding: 10px 0;
      font-size: 16px;
      font-weight: 700;
      color: #2b6cb0;
      border-top: 2px solid #2b6cb0;
      border-bottom: 2px solid #2b6cb0;
      margin-top: 6px;
    }
    .paid-stamp {
      display: inline-block;
      border: 2px solid #38a169;
      color: #38a169;
      font-weight: 800;
      padding: 6px 16px;
      border-radius: 4px;
      text-transform: uppercase;
      letter-spacing: 1px;
      font-size: 13px;
      margin-top: 10px;
    }
    .footer {
      border-top: 1px solid #e2e8f0;
      padding-top: 15px;
      margin-top: 20px;
      font-size: 11px;
      color: #718096;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="invoice-container">
    <table class="header-table">
      <tr>
        <td>
          <div class="company-title">${companyName}</div>
          <div class="company-sub">${companyAddress}</div>
          <div class="company-sub"><strong>GSTIN:</strong> ${companyGstin} | <strong>SAC Code:</strong> 998555</div>
        </td>
        <td class="invoice-badge">
          <div class="invoice-heading">TAX INVOICE</div>
          <div style="font-size: 13px; font-weight: 600; color: #4a5568;">${invoiceNumber}</div>
          <div style="font-size: 12px; color: #718096;">Date: ${invoiceDate}</div>
        </td>
      </tr>
    </table>

    <table class="meta-table">
      <tr>
        <td class="meta-box">
          <div class="section-title">Billed To</div>
          <div class="meta-content"><strong>${customerName}</strong></div>
          <div class="meta-content">Email: ${customerEmail}</div>
          <div class="meta-content">Phone: ${customerPhone}</div>
          ${invoice.gstinNumber ? `<div class="meta-content">Customer GSTIN: ${escapeHtml(invoice.gstinNumber)}</div>` : ''}
        </td>
        <td class="meta-box" style="padding-left: 20px;">
          <div class="section-title">Booking Details</div>
          <div class="meta-content"><strong>Reference:</strong> ${bookingReference}</div>
          <div class="meta-content"><strong>Package:</strong> ${packageTitle}</div>
          <div class="meta-content"><strong>Route:</strong> ${originCity} &rarr; ${destinationCity}</div>
          <div class="meta-content"><strong>Travel Dates:</strong> ${departureDate} to ${returnDate}</div>
          <div class="meta-content"><strong>Travellers:</strong> ${partySize} Persons (${adultCount} Adults, ${childCount} Children)</div>
        </td>
      </tr>
    </table>

    <table class="items-table">
      <thead>
        <tr>
          <th>Description & SAC</th>
          <th class="text-center">Qty / Travellers</th>
          <th class="text-right">Taxable Value</th>
          <th class="text-right">GST Rate</th>
          <th class="text-right">Total Amount</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>
            <strong>${packageTitle}</strong><br>
            <span style="font-size: 11px; color: #718096;">Tour Operator Services (SAC 998555)</span>
          </td>
          <td class="text-center">${partySize}</td>
          <td class="text-right">${taxableStr}</td>
          <td class="text-right">5.00%</td>
          <td class="text-right"><strong>${totalStr}</strong></td>
        </tr>
      </tbody>
    </table>

    <table class="summary-table">
      <tr>
        <td class="summary-left">
          <div class="paid-stamp">&#10004; PAID IN FULL</div>
          <div style="font-size: 11px; color: #718096; margin-top: 8px;">
            Payment Method: Verified Electronic Payment (100% Pre-paid)<br>
            Statutory Document for 7-Year Accounting & Tax Audit
          </div>
        </td>
        <td class="summary-right">
          <div class="summary-row">
            <span>Taxable Subtotal:</span>
            <span><strong>${taxableStr}</strong></span>
          </div>
          <div class="summary-row">
            <span>CGST (2.5%):</span>
            <span>${cgstStr}</span>
          </div>
          <div class="summary-row">
            <span>SGST (2.5%):</span>
            <span>${sgstStr}</span>
          </div>
          <div class="summary-row" style="color: #718096; font-size: 12px;">
            <span>Total GST (5.0%):</span>
            <span>${gstStr}</span>
          </div>
          <div class="total-row">
            <span>Total Payable (${currency}):</span>
            <span>${totalStr}</span>
          </div>
        </td>
      </tr>
    </table>

    <div class="footer">
      This is a computer-generated statutory Tax Invoice issued in compliance with the Central Goods and Services Tax (CGST) Act, 2017. No physical signature is required.
    </div>
  </div>
</body>
</html>`;
}
