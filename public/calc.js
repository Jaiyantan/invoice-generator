(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Calc = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const ones = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
    'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
  const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

  function twoDigits(n) {
    if (n < 20) return ones[n];
    return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
  }

  // Indian numbering: thousand, lakh, crore
  function wholeToWords(n) {
    if (n === 0) return 'zero';
    const parts = [];
    const crore = Math.floor(n / 1e7);
    const lakh = Math.floor((n % 1e7) / 1e5);
    const thousand = Math.floor((n % 1e5) / 1e3);
    const hundred = Math.floor((n % 1e3) / 100);
    const rest = n % 100;
    if (crore) parts.push(wholeToWords(crore) + ' crore');
    if (lakh) parts.push(twoDigits(lakh) + ' lakh');
    if (thousand) parts.push(twoDigits(thousand) + ' thousand');
    if (hundred) parts.push(ones[hundred] + ' hundred');
    if (rest) parts.push((parts.length ? 'and ' : '') + twoDigits(rest));
    return parts.join(' ');
  }

  // amount is an integer number of paise
  function amountInWords(paise) {
    const rupees = Math.floor(paise / 100);
    const ps = paise % 100;
    let text;
    if (ps === 0) text = wholeToWords(rupees);
    else if (rupees === 0) text = twoDigits(ps) + ' paise';
    else text = wholeToWords(rupees) + ' rupees and ' + twoDigits(ps) + ' paise';
    return text.charAt(0).toUpperCase() + text.slice(1) + ' only';
  }

  const round = (x) => Math.round(x + 1e-9);

  // All money is kept in integer paise to avoid floating point drift.
  function compute(inv) {
    const items = inv.items.map((it) => {
      const qtyNum = parseFloat(it.qty) || 0;
      const rateNum = parseFloat(it.rate) || 0;
      return { ...it, qtyNum, rateNum, amount: round(qtyNum * rateNum * 100) };
    });
    const taxable = items.reduce((sum, i) => sum + i.amount, 0);
    const rate = parseFloat(inv.tax.rate) || 0;
    const roundTax = (paise) => (inv.tax.roundTax ? round(paise / 100) * 100 : round(paise));

    let cgst = 0, sgst = 0, igst = 0;
    if (inv.tax.type === 'inter') {
      igst = roundTax((taxable * rate) / 100);
    } else {
      cgst = roundTax((taxable * rate) / 200);
      sgst = roundTax((taxable * rate) / 200);
    }
    const tax = cgst + sgst + igst;
    return { items, taxable, cgst, sgst, igst, tax, total: taxable + tax, rate, halfRate: rate / 2 };
  }

  const fmtMoney = (paise) =>
    (paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtRate = (n) =>
    'Rs ' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  const fmtQty = (n) =>
    n.toLocaleString('en-IN', { useGrouping: false, maximumFractionDigits: 3 });
  const fmtPercent = (n) => String(Number(n.toFixed(2))) + '%';
  const fmtDate = (iso) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    return m ? `${m[3]}.${m[2]}.${m[1]}` : iso || '';
  };

  return { compute, amountInWords, fmtMoney, fmtRate, fmtQty, fmtPercent, fmtDate };
});
