// Replace with your new Firebase config from the fresh project
const firebaseConfig = {
    apiKey: "YOUR_NEW_API_KEY",
    authDomain: "your-new-project.firebaseapp.com",
    projectId: "your-new-project-id",
    storageBucket: "your-new-project.appspot.com",
    messagingSenderId: "YOUR_NEW_SENDER_ID",
    appId: "YOUR_NEW_APP_ID"
};
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// Replace with your new Stripe publishable key
const stripe = Stripe('pk_test_YOUR_NEW_PUBLISHABLE_KEY');

// Temporary config for price IDs - replace with your new Stripe price IDs
window.APP_CONFIG = {
    BASIC_PRICE_ID: 'price_YourNew5DollarPriceID',
    UNLIMITED_PRICE_ID: 'price_YourNew8DollarPriceID'
};

document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('invoice-form');
    const itemsSection = document.getElementById('items');
    const addItemBtn = document.getElementById('add-item');
    const preview = document.getElementById('preview');
    const themeToggle = document.getElementById('theme-toggle');
    const signupBtn = document.getElementById('signup');
    const loginBtn = document.getElementById('login');
    const logoutBtn = document.getElementById('logout');
    const userStatus = document.getElementById('user-status');
    const authSection = document.getElementById('auth-section');
    const subscriptionSection = document.getElementById('subscription-section');
    const emailInvoiceBtn = document.getElementById('email-invoice');
    const setupRecurringBtn = document.getElementById('setup-recurring');
    let isDarkMode = false;
    let currentUser = null;

    // Theme Toggle
    themeToggle.addEventListener('click', () => {
        isDarkMode = !isDarkMode;
        document.body.classList.toggle('dark-mode', isDarkMode);
        themeToggle.textContent = isDarkMode ? '☀️' : '🌙';
    });

    // Auth State
    auth.onAuthStateChanged(user => {
        currentUser = user;
        if (user) {
            authSection.style.display = 'none';
            form.style.display = 'block';
            logoutBtn.style.display = 'block';
            userStatus.textContent = `Logged in as ${user.email}`;
            checkSubscription(user.uid);
            emailInvoiceBtn.style.display = 'block';
        } else {
            authSection.style.display = 'block';
            form.style.display = 'none';
            logoutBtn.style.display = 'none';
            subscriptionSection.style.display = 'none';
            userStatus.textContent = '';
        }
    });

    signupBtn.addEventListener('click', () => {
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        auth.createUserWithEmailAndPassword(email, password).catch(err => alert(err.message));
    });

    loginBtn.addEventListener('click', () => {
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        auth.signInWithEmailAndPassword(email, password).catch(err => alert(err.message));
    });

    logoutBtn.addEventListener('click', () => auth.signOut());

    // Check Subscription
    async function checkSubscription(uid) {
        const userDoc = await db.collection('users').doc(uid).get();
        const data = userDoc.data() || { tier: 'free', invoicesThisMonth: 0 };
        if (data.tier === 'unlimited') {
            setupRecurringBtn.style.display = 'block';
            subscriptionSection.style.display = 'none';
        } else {
            setupRecurringBtn.style.display = 'none';
            subscriptionSection.style.display = 'block';
        }
        return data;
    }

    // Add Item
    addItemBtn.addEventListener('click', () => {
        const row = document.createElement('div');
        row.classList.add('item-row');
        row.innerHTML = `
            <input type="text" class="description" placeholder="Description" required>
            <input type="number" class="quantity" placeholder="Qty" min="1" required>
            <input type="number" class="rate" placeholder="Rate" step="0.01" required>
            <button type="button" class="remove-item">Remove</button>
        `;
        itemsSection.insertBefore(row, addItemBtn);
    });

    // Remove Item
    itemsSection.addEventListener('click', (e) => {
        if (e.target.classList.contains('remove-item')) {
            e.target.parentElement.remove();
        }
    });

    // Generate Invoice
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!currentUser) return;

        const userData = await checkSubscription(currentUser.uid);
        const maxInvoices = userData.tier === 'free' ? 2 : userData.tier === 'basic' ? 5 : Infinity;
        if (userData.invoicesThisMonth >= maxInvoices) {
            alert('Limit reached. Upgrade for more.');
            return;
        }

        const companyName = document.getElementById('company-name').value;
        const companyAddress = document.getElementById('company-address').value;
        const companyEmail = document.getElementById('company-email').value;
        const logoFile = document.getElementById('logo').files[0];
        const clientName = document.getElementById('client-name').value;
        const clientAddress = document.getElementById('client-address').value;
        const clientEmail = document.getElementById('client-email').value;
        const invoiceNumber = document.getElementById('invoice-number').value;
        const invoiceDate = document.getElementById('invoice-date').value;
        const dueDate = document.getElementById('due-date').value;
        const currency = document.getElementById('currency').value;
        const currencySymbols = { USD: '$', EUR: '€', GBP: '£', JPY: '¥', CNY: '¥', AUD: '$', CAD: '$' };
        const currSymbol = currencySymbols[currency] || '$';
        const taxRate = parseFloat(document.getElementById('tax-rate').value) || 0;
        const notes = document.getElementById('notes').value;

        const items = [];
        let subtotal = 0;
        document.querySelectorAll('.item-row').forEach(row => {
            const desc = row.querySelector('.description').value;
            const qty = parseFloat(row.querySelector('.quantity').value);
            const rate = parseFloat(row.querySelector('.rate').value);
            const amount = qty * rate;
            subtotal += amount;
            items.push({ desc, qty, rate, amount });
        });

        const tax = subtotal * (taxRate / 100);
        const total = subtotal + tax;

        // Update invoice count in DB
        await db.collection('users').doc(currentUser.uid).update({
            invoicesThisMonth: firebase.firestore.FieldValue.increment(1)
        });

        // Preview
        preview.innerHTML = `
            <h2>Preview</h2>
            <p><strong>From:</strong> ${companyName} - ${companyAddress} - ${companyEmail}</p>
            <p><strong>To:</strong> ${clientName} - ${clientAddress} - ${clientEmail}</p>
            <p><strong>#:</strong> ${invoiceNumber} | Date: ${invoiceDate} | Due: ${dueDate} | Curr: ${currency}</p>
            <table style="width:100%; border-collapse: collapse; border: 1px solid var(--border-color);">
                <tr><th>Desc</th><th>Qty</th><th>Rate</th><th>Amt</th></tr>
                ${items.map(item => `<tr><td>${item.desc}</td><td>${item.qty}</td><td>${currSymbol}${item.rate.toFixed(2)}</td><td>${currSymbol}${item.amount.toFixed(2)}</td></tr>`).join('')}
                <tr><td colspan="3">Sub</td><td>${currSymbol}${subtotal.toFixed(2)}</td></tr>
                <tr><td colspan="3">Tax (${taxRate}%)</td><td>${currSymbol}${tax.toFixed(2)}</td></tr>
                <tr><td colspan="3"><strong>Total</strong></td><td><strong>${currSymbol}${total.toFixed(2)}</strong></td></tr>
            </table>
            <p><strong>Notes:</strong> ${notes}</p>
            <button id="download-pdf">Download PDF</button>
        `;

        // PDF Download
        document.getElementById('download-pdf').addEventListener('click', () => {
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();
            let y = 10;
            if (logoFile) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    doc.addImage(e.target.result, 'PNG', 10, y, 40, 40);
                    y += 50;
                    addPdfContent(doc, y, companyName, clientName, items, subtotal, tax, total, notes, currSymbol, currency);
                };
                reader.readAsDataURL(logoFile);
            } else {
                addPdfContent(doc, y, companyName, clientName, items, subtotal, tax, total, notes, currSymbol, currency);
            }
        });
    });

    function addPdfContent(doc, y, companyName, clientName, items, subtotal, tax, total, notes, currSymbol, currency) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(18);
        doc.text('Invoice', doc.internal.pageSize.width / 2, y, { align: 'center' });
        y += 15;
        doc.setFontSize(12);
        doc.setFont('helvetica', 'normal');
        doc.text(`From: ${companyName}`, 10, y);
        y += 10;
        doc.text(`To: ${clientName}`, 10, y);
        y += 15;
        const tableData = items.map(item => [item.desc, item.qty, `${currSymbol}${item.rate.toFixed(2)}`, `${currSymbol}${item.amount.toFixed(2)}`]);
        tableData.push(['Subtotal', '', '', `${currSymbol}${subtotal.toFixed(2)}`]);
        tableData.push(['Tax', '', '', `${currSymbol}${tax.toFixed(2)}`]);
        tableData.push(['Total', '', '', `${currSymbol}${total.toFixed(2)}`]);
        doc.autoTable({
            startY: y,
            head: [['Description', 'Qty', 'Rate', 'Amount']],
            body: tableData,
            theme: 'grid',
            styles: { font: 'helvetica', fontSize: 10, textColor: [0,0,0], lineColor: [200,200,200] },
            headStyles: { fillColor: [240,240,240] },
        });
        y = doc.lastAutoTable.finalY + 10;
        doc.text(`Notes: ${notes}`, 10, y);
        y += 10;
        doc.text(`Currency: ${currency}`, 10, y);
        doc.save(`invoice_${Date.now()}.pdf`);
    }

    // Subscriptions
    document.getElementById('subscribe-5').addEventListener('click', () => subscribe(window.APP_CONFIG.BASIC_PRICE_ID));
    document.getElementById('subscribe-8').addEventListener('click', () => subscribe(window.APP_CONFIG.UNLIMITED_PRICE_ID));

    async function subscribe(priceId) {
        const response = await fetch('/create-checkout-session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ priceId, userId: currentUser.uid })
        });
        const { id } = await response.json();
        stripe.redirectToCheckout({ sessionId: id });
    }

    // Email Invoice (calls function)
    emailInvoiceBtn.addEventListener('click', async () => {
        const invoiceData = getInvoiceData(); // Helper to gather form data as object
        await fetch('/send-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                to: document.getElementById('client-email').value,
                replyTo: currentUser.email,
                invoice: invoiceData
            })
        });
        alert('Email sent!');
    });

    function getInvoiceData() {
        // Gather all form fields into an object for email
        const companyName = document.getElementById('company-name').value;
        const companyAddress = document.getElementById('company-address').value;
        const companyEmail = document.getElementById('company-email').value;
        const clientName = document.getElementById('client-name').value;
        const clientAddress = document.getElementById('client-address').value;
        const clientEmail = document.getElementById('client-email').value;
        const invoiceNumber = document.getElementById('invoice-number').value;
        const invoiceDate = document.getElementById('invoice-date').value;
        const dueDate = document.getElementById('due-date').value;
        const currency = document.getElementById('currency').value;
        const taxRate = parseFloat(document.getElementById('tax-rate').value) || 0;
        const notes = document.getElementById('notes').value;

        const items = [];
        let subtotal = 0;
        document.querySelectorAll('.item-row').forEach(row => {
            const desc = row.querySelector('.description').value;
            const qty = parseFloat(row.querySelector('.quantity').value);
            const rate = parseFloat(row.querySelector('.rate').value);
            const amount = qty * rate;
            subtotal += amount;
            items.push({ desc, qty, rate, amount });
        });

        const tax = subtotal * (taxRate / 100);
        const total = subtotal + tax;

        return {
            companyName,
            companyAddress,
            companyEmail,
            clientName,
            clientAddress,
            clientEmail,
            invoiceNumber,
            invoiceDate,
            dueDate,
            currency,
            taxRate,
            notes,
            items,
            subtotal,
            tax,
            total
        };
    }

    // Recurring (premium)
    setupRecurringBtn.addEventListener('click', async () => {
        const template = getInvoiceData(); // Save as template
        await db.collection('recurring').add({ userId: currentUser.uid, template });
        alert('Recurring set up!');
    });
});