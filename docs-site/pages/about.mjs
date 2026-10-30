// Support & Subscription - the help-page twin of the app's Support &
// Subscription page (src/components/SupportView.jsx). Keep the two in step.
import { SITE } from '../site.mjs';

const ui = (s) => `<span class="ui">${s}</span>`;
const PHONE = '+91 94299 11067';
const WA = 'https://wa.me/919429911067';
const EMAIL = 'hello@divtech.in';

const SERVICES = [
  ['Customising Divtech Hisaab', 'Your own invoice layout, reports or features for your trade.'],
  ['Setup &amp; data migration', 'Installation, moving your data from other software or Excel, and training.'],
  ['Support on call', 'Help over phone or WhatsApp when something is not working.'],
  ['Custom software &amp; websites', 'Websites, web apps and business tools built for how you work.'],
  ['Mobile apps', 'Android and iPhone apps for your business or customers.'],
  ['Automation', 'Automate the repetitive work in the software you already use.'],
];

export default [
{
  slug: 'support',
  title: 'Support & Subscription',
  nav: 'Support & Subscription',
  lead: 'Your Divtech Hisaab subscription, entering a license key, and how to reach Divtech.',
  body: `
<section id="subscription">
<h2>What the subscription does</h2>
<p>Divtech Hisaab always works on your computer: invoices, stock, payments, accounts, reports and GST returns, with or without a subscription. Nothing is ever locked and your data is never touched.</p>
<p>The subscription gives you <b>updates</b>: new features, changes in GST rules and forms, and fixes. A subscription covers every update Divtech releases up to its end date. After it ends, the app keeps working exactly as it is; only newer updates need a renewal.</p>
<div class="table-wrap"><table>
  <tr><th>Status in the app</th><th>What it means</th></tr>
  <tr><td><b>Subscription active</b></td><td>Updates are included until the date shown.</td></tr>
  <tr><td><b>Subscription ends in N days</b></td><td>Fewer than 15 days left. Renew so updates keep coming.</td></tr>
  <tr><td><b>Subscription expired</b></td><td>The end date has passed. The app works as before; updates released after that date need a renewal.</td></tr>
  <tr><td><b>No subscription yet</b></td><td>No license key has been entered on this computer.</td></tr>
  <tr><td><b>License key not valid</b></td><td>The saved key was cut off or changed. Paste the full key again, or ask Divtech for a new one.</td></tr>
</table></div>
</section>

<section id="license-key">
<h2>Entering your license key</h2>
<p>Divtech sends your license key on WhatsApp or email. It starts with <code>DH1-</code> and is one long line.</p>
<ol class="steps">
  <li><strong>Open Support &amp; Subscription</strong>Near the bottom of the sidebar.</li>
  <li><strong>Paste the key</strong>Copy the whole key from WhatsApp or email and paste it in the box. Spaces and line breaks are ignored.</li>
  <li><strong>Click ${ui('Save license key')}</strong>The card turns green and shows the shop name and the end date.</li>
</ol>
<p>To enter a renewed key later, click ${ui('Enter a new license key')}. The key is saved in the app's <code>data</code> folder, so it stays through updates and is part of every backup.</p>
<div class="note tip"><strong>Reminder</strong>
<p>When there is no key, the plan has ended, or fewer than 15 days are left, the app shows a short reminder once a day a few seconds after it opens. Close it with ${ui('Continue to the app')} and carry on working.</p>
</div>
</section>

<section id="renew">
<h2>Getting or renewing a subscription</h2>
<p>${ui('Renew on WhatsApp')} opens WhatsApp with a message to Divtech already written, including your shop name and end date. You can also email <a href="mailto:${EMAIL}">${EMAIL}</a> or call ${PHONE}. Divtech sends the new key, which you enter as above.</p>
</section>

<section id="contact">
<h2>Contact Divtech</h2>
<ul>
  <li><strong>WhatsApp</strong>: <a href="${WA}">${PHONE}</a></li>
  <li><strong>Call</strong>: ${PHONE}</li>
  <li><strong>Email</strong>: <a href="mailto:${EMAIL}">${EMAIL}</a></li>
  <li><strong>Website</strong>: <a href="${SITE.publisher.url}">divtech.in</a></li>
</ul>
<p>For a problem the app noticed, ${ui('Report')} in the <a href="troubleshooting.html#problem-log">Problem log</a> is quickest: it opens WhatsApp with the details already filled in, private details removed.</p>
</section>

<section id="weekly">
<h2>Updates from Divtech</h2>
<p>When an update is ready, the app shows <b>Update to vX</b> in the sidebar. With an active subscription, click it and then ${ui('Update Now')}: your data is backed up first and is never changed. Without one, the window shows ${ui('Renew subscription')} instead. See <a href="update.html#in-app">Updating the app</a>.</p>
<ul>
  <li>${ui('Report a problem')} opens WhatsApp to Divtech.</li>
  <li>${ui('Ask for a feature')} opens an email to Divtech.</li>
</ul>
</section>

<section id="whats-new">
<h2>What's new</h2>
<p>The <b>What's new</b> card in the app lists the last updates, read from the changelog that comes with your copy of the app. The newest is open; click any version number to open or close it.</p>
<p>The card shows what <b>your</b> copy contains. If it stops at an older version, you have not updated yet: see <a href="update.html#in-app">Updating the app</a>.</p>
</section>

<section id="services">
<h2>Work with Divtech</h2>
<p>The team behind this app builds software for businesses too.</p>
<div class="service-grid">
${SERVICES.map(([t, d]) => `  <div class="service"><strong>${t}</strong><span>${d}</span></div>`).join('\n')}
</div>
<p>Email <a href="mailto:${EMAIL}">${EMAIL}</a> or visit <a href="${SITE.publisher.url}">divtech.in</a>.</p>
</section>

<section id="in-the-app">
<h2>In the app</h2>
<p><b>Support &amp; Subscription</b> is near the bottom of the sidebar. From top to bottom it has:</p>
<ul>
  <li><a href="#subscription">Subscription</a> and <a href="#contact">Contact Divtech</a>, side by side</li>
  <li><a href="security.html">Safe and private</a></li>
  <li><a href="#weekly">Updates from Divtech</a> and <a href="#whats-new">What's new</a></li>
  <li><a href="troubleshooting.html#problem-log">Problem log</a></li>
  <li><a href="#services">Work with Divtech</a></li>
</ul>
</section>
`,
},
];
