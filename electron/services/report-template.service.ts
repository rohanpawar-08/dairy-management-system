export function escapeHtml(unsafe: string | null | undefined): string {
  if (unsafe === null || unsafe === undefined) return '';
  return String(unsafe)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export const reportTemplateService = {
  generateHtml(reportType: string, data: any, dairyProfile: any): string {
    const title = escapeHtml(reportType.replace(/_/g, ' '));
    const centreName = escapeHtml(dairyProfile?.dairy_name_en || 'Dairy Management System');
    
    // We only need a very simple, secure template
    let bodyHtml = '';
    
    if (reportType === 'DAILY_COLLECTION_SUMMARY') {
      bodyHtml = `
        <h2>Daily Collection Summary</h2>
        <p>Date: ${escapeHtml(data.fromDate)} to ${escapeHtml(data.toDate)}</p>
        <table class="data-table">
          <tr><th>Category</th><th>Litres</th><th>Amount (Rs)</th></tr>
          <tr><td>COW</td><td>${escapeHtml(data.cowLitresFormatted)}</td><td>${escapeHtml(data.cowAmountFormatted)}</td></tr>
          <tr><td>BUFFALO</td><td>${escapeHtml(data.buffaloLitresFormatted)}</td><td>${escapeHtml(data.buffaloAmountFormatted)}</td></tr>
          <tr><th>TOTAL</th><th>${escapeHtml(data.totalLitresFormatted)}</th><th>${escapeHtml(data.totalAmountFormatted)}</th></tr>
        </table>
        <p>Total Collections: ${escapeHtml(data.totalCollections)}</p>
        <p>Unique Farmers: ${escapeHtml(data.uniqueFarmers)}</p>
      `;
    } else if (reportType === 'SHIFT_COLLECTION_REPORT') {
      bodyHtml = `
        <h2>Shift Collection Report</h2>
        <p>Date: ${escapeHtml(data.shift.business_date)} | Shift: ${escapeHtml(data.shift.shift_type)}</p>
        <table class="data-table">
          <thead>
            <tr>
              <th>Receipt</th>
              <th>Farmer</th>
              <th>Milk</th>
              <th>Litres</th>
              <th>Fat</th>
              <th>SNF</th>
              <th>Rate</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            ${data.collections.map((c: any) => `
              <tr>
                <td>${escapeHtml(c.receipt_number)}</td>
                <td>${escapeHtml(c.farmer_member_code)} - ${escapeHtml(c.farmer_name_mr)}</td>
                <td>${escapeHtml(c.milk_type)}</td>
                <td>${escapeHtml(c.quantity_litres_formatted)}</td>
                <td>${escapeHtml(c.fat_formatted)}</td>
                <td>${escapeHtml(c.snf_formatted)}</td>
                <td>${escapeHtml(c.rate_rupees_formatted)}</td>
                <td>${escapeHtml(c.amount_rupees_formatted)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    } else if (reportType === 'FARMER_LEDGER_STATEMENT') {
      bodyHtml = `
        <h2>Farmer Ledger Statement</h2>
        <p>Farmer: ${escapeHtml(data.ledger.memberCode)} - ${escapeHtml(data.ledger.farmerNameMr)}</p>
        <table class="data-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Ref</th>
              <th>Description</th>
              <th>Credit</th>
              <th>Debit</th>
              <th>Balance</th>
            </tr>
          </thead>
          <tbody>
            ${data.ledger.items.map((c: any) => `
              <tr>
                <td>${escapeHtml(c.businessDate || '-')}</td>
                <td>${escapeHtml(c.referenceNumber)}</td>
                <td>${escapeHtml(c.description)}</td>
                <td>${c.creditPaise ? escapeHtml((c.creditPaise/100).toFixed(2)) : '-'}</td>
                <td>${c.debitPaise ? escapeHtml((c.debitPaise/100).toFixed(2)) : '-'}</td>
                <td>${escapeHtml((c.runningBalancePaise/100).toFixed(2))}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    } else if (reportType === 'SETTLEMENT_BATCH_REPORT') {
      bodyHtml = `
        <h2>Settlement Batch Report</h2>
        <p>Period: ${escapeHtml(data.period.period_start)} to ${escapeHtml(data.period.period_end)}</p>
        <table class="data-table">
          <thead>
            <tr>
              <th>Farmer</th>
              <th>Milk Litres</th>
              <th>Net Amount</th>
              <th>Allocated</th>
              <th>Outstanding</th>
            </tr>
          </thead>
          <tbody>
            ${data.items.map((c: any) => `
              <tr>
                <td>${escapeHtml(c.member_code_snapshot)} - ${escapeHtml(c.farmer_name_mr_snapshot)}</td>
                <td>${escapeHtml(c.milk_litres_formatted)}</td>
                <td>${escapeHtml(c.net_amount_formatted)}</td>
                <td>${escapeHtml(c.allocated_formatted)}</td>
                <td>${escapeHtml(c.outstanding_formatted)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    } else if (reportType === 'PAYMENT_REGISTER') {
      bodyHtml = `
        <h2>Payment Register</h2>
        <table class="data-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Receipt</th>
              <th>Farmer</th>
              <th>Method</th>
              <th>Amount</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${data.payments.map((c: any) => `
              <tr>
                <td>${escapeHtml(c.business_date)}</td>
                <td>${escapeHtml(c.payment_number)}</td>
                <td>${escapeHtml(c.farmer_member_code)} - ${escapeHtml(c.farmer_name_mr)}</td>
                <td>${escapeHtml(c.payment_method)}</td>
                <td>${escapeHtml(c.amount_formatted)}</td>
                <td>${escapeHtml(c.status)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        <p>Total Active Amount: ${escapeHtml(data.totalAmountFormatted)}</p>
      `;
    } else if (reportType === 'OUTSTANDING_FARMER_REPORT') {
      bodyHtml = `
        <h2>Outstanding Farmer Report</h2>
        <table class="data-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Name</th>
              <th>Total Net</th>
              <th>Total Paid</th>
              <th>Outstanding</th>
            </tr>
          </thead>
          <tbody>
            ${data.items.map((c: any) => `
              <tr>
                <td>${escapeHtml(c.member_code)}</td>
                <td>${escapeHtml(c.name_mr)}</td>
                <td>${escapeHtml(c.total_net_formatted)}</td>
                <td>${escapeHtml(c.total_paid_formatted)}</td>
                <td>${escapeHtml(c.outstanding_formatted)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        <p>Total Payable: ${escapeHtml(data.totalPayableFormatted)}</p>
        <p>Total Debt: ${escapeHtml(data.totalDebtFormatted)}</p>
      `;
    }

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:;">
  <title>${title}</title>
  <style>
    @page { size: A4; margin: 15mm; }
    body { 
      font-family: 'Nirmala UI', 'Mangal', sans-serif; 
      color: #000; 
      background: #fff;
      font-size: 12pt;
    }
    .header { text-align: center; margin-bottom: 20px; border-bottom: 1px solid #000; padding-bottom: 10px; }
    .header h1 { margin: 0 0 5px 0; font-size: 18pt; }
    .data-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    .data-table th, .data-table td { border: 1px solid #000; padding: 4px; text-align: left; }
    .data-table thead { display: table-header-group; }
    .data-table tr { page-break-inside: avoid; }
    .footer { margin-top: 30px; text-align: right; }
  </style>
</head>
<body>
  <div class="header">
    <h1>${centreName}</h1>
    <p>Generated At: ${escapeHtml(data.generatedAt)}</p>
  </div>
  <div class="content">
    ${bodyHtml}
  </div>
  <div class="footer">
    <p>Signature ____________________</p>
  </div>
</body>
</html>`;
  }
};
