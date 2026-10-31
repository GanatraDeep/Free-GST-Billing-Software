const ui = (s) => `<span class="ui">${s}</span>`;

export default [
// =============================================================================
{
  slug: 'accounts',
  title: 'Accounts: capital, loans, CC and assets',
  lead: 'Everything on your balance sheet that is not a customer, a supplier, cash or stock: the owner\'s capital, loans taken, the bank CC / OD account with its limit, fixed assets, loans and deposits given. And vouchers, for the money that moves in and out of them.',
  body: `
<section id="add">
<h2>Adding an account</h2>
<p>Open ${ui('Accounts')} in the sidebar and click ${ui('Add account')} (or one of the buttons shown when there are none yet). Pick what kind of account it is, give it a name, and enter its <b>opening balance</b>: the amount on your last balance sheet, or on the day you start using Divtech Hisaab, with its date.</p>
<div class="table-wrap"><table>
  <tr><th>Kind</th><th>Examples</th><th>Opening balance is</th></tr>
  <tr><td><b>Capital</b></td><td>Capital - Ramesh Ganatra; one per partner</td><td>Cr</td></tr>
  <tr><td><b>Loan taken: secured</b></td><td>Bank term loan, vehicle loan, machinery loan</td><td>Cr (what you still owe)</td></tr>
  <tr><td><b>Loan taken: unsecured</b></td><td>Loan from a relative or friend</td><td>Cr</td></tr>
  <tr><td><b>Bank CC / OD account</b></td><td>SBI cash credit, HDFC overdraft. Enter the <b>sanctioned limit</b> and the interest rate.</td><td>Cr when you have drawn on it</td></tr>
  <tr><td><b>Fixed asset</b></td><td>Shop furniture, tempo, computer, weighing scale. Enter the <b>depreciation rate</b> (written-down value).</td><td>Dr (its written-down value)</td></tr>
  <tr><td><b>Investment</b></td><td>Fixed deposit, shares, mutual funds</td><td>Dr</td></tr>
  <tr><td><b>Loan or advance given</b></td><td>Money lent to someone, staff advance</td><td>Dr (what they owe you)</td></tr>
  <tr><td><b>Deposit given</b></td><td>Shop rent deposit, electricity deposit</td><td>Dr</td></tr>
  <tr><td><b>Other asset / liability</b></td><td>Prepaid rent; salary payable, provisions</td><td>Dr / Cr</td></tr>
  <tr><td><b>Other expense / income</b></td><td>Heads you want by name: interest received, commission</td><td>Usually none</td></tr>
</table></div>
<p>Customers and suppliers have their own <a href="clients.html#opening-balances">opening balances</a>; cash and bank start with an <b>Opening balance</b> entry in the <a href="cash-book.html">Cash book</a> and <a href="cash-book.html#bank-book">Bank book</a>; stock starts with the stock in <a href="products.html">Products</a>. Together with these accounts they make up your opening balance sheet. If they do not add up, the difference shows as <b>Difference in opening balances</b> in the <a href="final-accounts.html">trial balance</a>: usually the capital's opening balance needs correcting.</p>
<p>Each account shows its balance now. ${ui('Ledger')} opens its ledger; edit changes the details; delete works only for an account no voucher uses.</p>
</section>

<section id="cc">
<h2>Bank CC / OD account</h2>
<p>A cash credit or overdraft account is a bank account whose balance runs below zero, up to the sanctioned limit. In Divtech Hisaab it is an account of its own, shown under <b>Cash and bank</b> when you pick an account. Its line on the Accounts screen shows the <b>limit</b>, how much is <b>used</b> and how much is <b>available</b>, with a bar; it turns red when you are over the limit. The same figures are on top of its <a href="ledgers.html">ledger</a>.</p>
<ul>
  <li><b>Money deposited into the CC</b> (from cash or the current account): a <a href="#vouchers">Contra voucher</a>, from Cash (or Bank) to the CC account.</li>
  <li><b>Paying a supplier from the CC</b>: a <a href="#vouchers">Payment voucher</a>, paid from the CC account to the supplier.</li>
  <li><b>A customer paying into the CC</b>: a Receipt voucher, received in the CC account from the customer.</li>
  <li><b>Interest charged by the bank</b> (monthly or quarterly): a Journal voucher, Interest Dr, the CC account Cr.</li>
</ul>
<p>Receipts, invoice payments and purchase payments recorded by mode Bank transfer or UPI go to the <b>Bank</b> account (the Bank book). If your main account is the CC itself, move the month's total from Bank to the CC with one Contra voucher, or record those payments as vouchers.</p>
</section>

<section id="loans">
<h2>Loans and advances</h2>
<ul>
  <li><b>Loan taken</b>: the money received is a Receipt voucher, received in Bank (or Cash) from the loan account. Each instalment is a Payment voucher: the principal to the loan account and the interest to <b>Interest</b> (a Journal voucher with three lines if the bank takes both together: Loan Dr, Interest Dr, Bank Cr).</li>
  <li><b>Loan given / advance given</b>: a Payment voucher, paid from Cash or Bank to the loan-given account. When it comes back, a Receipt voucher from that account. Interest you earn on it goes to an <b>Other income</b> account.</li>
  <li><b>Advances from customers or to suppliers</b> do not need an account: a receipt from a customer without an invoice, or a payment to a supplier, already shows in their ledger, and the balance sheet shows it as an advance.</li>
</ul>
</section>

<section id="depreciation">
<h2>Fixed assets and depreciation</h2>
<p>Buying an asset is a Payment voucher (paid from Bank to the asset account). At the year end, the depreciation button on the asset's line works out depreciation for the selected year on the written-down value: the full rate on the value at the start of the year and on additions used 180 days or more, half the rate on additions used less than 180 days (the Income-tax rule). Change the amount if your CA gives another figure, then save: it becomes a Journal voucher on 31 March, Depreciation Dr, the asset Cr.</p>
</section>

<section id="vouchers">
<h2>Vouchers</h2>
<p>${ui('Vouchers')} in the sidebar is for every entry that is not an invoice, a purchase bill, a receipt from a customer, an expense or a Cash / Bank book line. Pick the type at the top, fill it in, and ${ui('Save')}. Numbers are given by type and year: <code>PV/26-27/0001</code> for payments, <code>RV</code> receipts, <code>CV</code> contra, <code>JV</code> journal.</p>
<div class="table-wrap"><table>
  <tr><th>Type</th><th>Fields</th><th>Used for</th></tr>
  <tr><td><b>Payment</b></td><td>Paid from (Cash, Bank or a CC account), Paid to (any account), Amount</td><td>Loan instalment, loan given, asset bought, rent deposit, drawings, GST paid to the government</td></tr>
  <tr><td><b>Receipt</b></td><td>Received in, Received from, Amount</td><td>Loan taken, capital brought in, loan given coming back, interest received</td></tr>
  <tr><td><b>Contra</b></td><td>From, To, Amount</td><td>Cash deposited in the bank or CC, cash withdrawn, Bank to CC</td></tr>
  <tr><td><b>Journal</b></td><td>Lines of account, debit and credit; they must be equal</td><td>Depreciation, interest charged on CC / loans, salary payable, correcting an entry, moving something out of suspense</td></tr>
</table></div>
<p>The account list has everything: cash, bank and CC; capital and loans; assets; expense heads (pick <b>+ New expense head...</b> for a new one); incomes; customers; suppliers; GST, TDS and TCS. The voucher shows in every ledger it touches, in the Cash book and Bank book, and in the <a href="final-accounts.html">final accounts</a>. The list below the form can be searched and filtered, edited and deleted, and saved as PDF or Excel.</p>
<div class="note tip"><strong>GST paid to the government</strong><p>When you pay the month's GST, make a Payment voucher from Bank to CGST and another line to SGST (or a Journal: CGST Dr, SGST Dr, Bank Cr). The GST ledgers then come back to nil, or to the credit carried forward.</p></div>
</section>
`,
},

// =============================================================================
{
  slug: 'final-accounts',
  title: 'Final accounts and the year end',
  lead: 'The trial balance, trading and profit & loss account and balance sheet for any financial year, the year-end checklist, the CA pack in one Excel file, and closing the year.',
  body: `
<section id="how">
<h2>Where the figures come from</h2>
<p>Every invoice, credit note, receipt, purchase bill, payment, expense, Cash / Bank book line, opening balance and voucher is entered in double entry by itself (each has a debit and an equal credit). The ${ui('Final accounts')} screen adds them up for the year you pick at the top. Nothing is typed in here, so it is always up to date, and a change to an entry shows at once.</p>
</section>

<section id="trial-balance">
<h2>Trial balance</h2>
<p>Every account with its debit or credit balance. Balance-sheet accounts show their balance on 31 March; income and expense accounts show the year's total; the profit of earlier years is one line, <b>Profit &amp; loss account (earlier years)</b>; <b>Opening stock</b> is the stock at the start of the year. Closing stock is shown under the table, as in Tally. Debit and credit totals agree; if they do not, a red line says by how much. Click an account to open its <a href="ledgers.html">ledger</a>.</p>
</section>

<section id="profit-loss">
<h2>Trading and profit &amp; loss account</h2>
<p><b>Trading account</b>: opening stock, purchases (without GST; GST on URD purchases is part of the cost) and direct expenses (freight, cartage, loading) on one side; sales (without GST) and closing stock on the other. The difference is the <b>gross profit</b>. <b>Profit and loss account</b>: gross profit, other incomes, and indirect expenses (salary, rent, interest, depreciation, bank charges...). The difference is the <b>net profit</b>. Stock is valued at the average purchase rate, without GST.</p>
</section>

<section id="balance-sheet">
<h2>Balance sheet</h2>
<p><b>Liabilities</b>: capital (with drawings, the difference in opening balances and the profit: earlier years and this year), loans, CC / OD, sundry creditors, duties and taxes (GST, TDS, TCS payable) and other liabilities. <b>Assets</b>: fixed assets, investments, loans and advances given, deposits, sundry debtors, closing stock, cash and bank. A customer who paid in advance shows under liabilities, a supplier paid in advance under assets, and GST credit carried forward under assets.</p>
</section>

<section id="year-end">
<h2>The year end, step by step</h2>
<p>Open the ${ui('Year end')} tab and pick the year. The list checks the books and says what is left:</p>
<ol class="steps">
  <li><strong>Trial balance agrees</strong>It always does unless something is wrong in the data.</li>
  <li><strong>Capital and opening balances</strong>Add the capital account, and make the difference in opening balances nil.</li>
  <li><strong>Suspense</strong>Payments recorded in mode "Other" or only marked paid sit in suspense. Correct them, or move them with a Journal voucher.</li>
  <li><strong>Cash and bank</strong>Count the cash; match the Bank book with the bank statement (add bank charges and interest).</li>
  <li><strong>Stock</strong>Count the godown and correct stock in Products; items below zero are listed.</li>
  <li><strong>Depreciation, CC and loan interest</strong>Enter them (the depreciation button in Accounts; a Journal voucher for interest).</li>
  <li><strong>GST</strong>File the March returns, and enter the GST paid as vouchers.</li>
  <li><strong>CA pack and backup</strong>Download both (see below).</li>
  <li><strong>Close the year</strong>${ui('Close FY ...')}: nothing is deleted or locked, but saving or deleting an entry dated in that year asks first, and the invoice screen shows a note. ${ui('Reopen')} undoes it.</li>
</ol>
<p>There is nothing to carry forward: the next year starts with the closing balances by itself, invoice series restart at 1 if set so (see <a href="settings.html#invoice-series">invoice series</a>), and earlier years stay viewable by picking them at the top.</p>
</section>

<section id="ca-pack">
<h2>The CA pack</h2>
<p>${ui('CA pack (Excel)')} saves one Excel file for the year chosen, with a sheet for each of: <b>Summary</b> (profit, stock, totals and the checks above), <b>Trial balance</b>, <b>Profit and loss</b>, <b>Balance sheet</b>, <b>Day book</b> (every entry), <b>Cash book</b>, <b>Bank book</b>, <b>Customer ledgers</b>, <b>Supplier ledgers</b>, <b>Other ledgers</b> (every other account), <b>Debtors</b>, <b>Creditors</b>, <b>Stock summary</b>, <b>Stock register</b>, <b>Sales register</b>, <b>Purchase register</b>, <b>Expense register</b>, <b>Receipts</b> and <b>Vouchers</b>. Amounts are numbers, so they can be totalled. ${ui('Full backup (JSON)')} saves all your data, to keep or to restore on another computer. For GST, give the CA the <a href="gst-returns.html#excel-workbook">GST Excel</a> for each month too.</p>
</section>
`,
},
];
