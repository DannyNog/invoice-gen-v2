require('dotenv').config();

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const express = require('express');
const cors = require('cors');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const mailgun = require('mailgun.js');
const mg = new mailgun({ apiKey: process.env.MAILGUN_API_KEY, domain: process.env.MAILGUN_DOMAIN });

admin.initializeApp();
const db = admin.firestore();

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());
app.use(express.raw({ type: 'application/json' })); // For webhook raw body

app.post('/create-checkout-session', async (req, res) => {
    const { priceId, userId } = req.body;
    try {
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [{ price: priceId, quantity: 1 }],
            mode: 'subscription',
            success_url: 'https://yourapp.com/success', // Replace with your deployed URL later
            cancel_url: 'https://yourapp.com/cancel',
            client_reference_id: userId,
        });
        res.json({ id: session.id });
    } catch (err) {
        res.status(500).send(err.message);
    }
});

app.post('/stripe-webhook', async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;
    try {
        event = stripe.webhooks.constructEvent(req.rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === 'checkout.session.completed') {
        const userId = event.data.object.client_reference_id;
        const priceId = event.data.object.line_items.data[0].price.id;
        const tier = priceId === 'price_YOUR_5_DOLLAR_ID' ? 'basic' : 'unlimited'; // Replace with your actual price IDs or use env
        await db.collection('users').doc(userId).set({ tier }, { merge: true });
    }

    res.json({ received: true });
});

app.post('/send-email', async (req, res) => {
    const { to, replyTo, invoice } = req.body;
    const currSymbol = { USD: '$', EUR: '€', GBP: '£', JPY: '¥', CNY: '¥', AUD: '$', CAD: '$' }[invoice.currency] || '$';
    const data = {
        from: 'Invoice Generator <no-reply@yourdomain.com>',
        to,
        'h:Reply-To': replyTo,
        subject: 'Your Invoice',
        text: `Invoice Details:\n\nFrom: ${invoice.companyName} (${invoice.companyAddress}, ${invoice.companyEmail})\nTo: ${invoice.clientName} (${invoice.clientAddress}, ${invoice.clientEmail})\nInvoice #: ${invoice.invoiceNumber}\nDate: ${invoice.invoiceDate}\nDue: ${invoice.dueDate}\nCurrency: ${invoice.currency}\n\nItems:\n${invoice.items.map(item => `${item.desc} - Qty: ${item.qty} - Rate: ${currSymbol}${item.rate.toFixed(2)} - Amount: ${currSymbol}${item.amount.toFixed(2)}`).join('\n')}\n\nSubtotal: ${currSymbol}${invoice.subtotal.toFixed(2)}\nTax (${invoice.taxRate}%): ${currSymbol}${invoice.tax.toFixed(2)}\nTotal: ${currSymbol}${invoice.total.toFixed(2)}\n\nNotes: ${invoice.notes}`,
        html: `<h1>Invoice</h1><p><strong>From:</strong> ${invoice.companyName} (${invoice.companyAddress}, ${invoice.companyEmail})</p><p><strong>To:</strong> ${invoice.clientName} (${invoice.clientAddress}, ${invoice.clientEmail})</p><p><strong>Invoice #:</strong> ${invoice.invoiceNumber} | Date: ${invoice.invoiceDate} | Due: ${invoice.dueDate} | Currency: ${invoice.currency}</p><table style="width:100%; border-collapse: collapse; border: 1px solid #ddd;"><tr><th>Description</th><th>Qty</th><th>Rate</th><th>Amount</th></tr>${invoice.items.map(item => `<tr><td>${item.desc}</td><td>${item.qty}</td><td>${currSymbol}${item.rate.toFixed(2)}</td><td>${currSymbol}${item.amount.toFixed(2)}</td></tr>`).join('')}<tr><td colspan="3">Subtotal</td><td>${currSymbol}${invoice.subtotal.toFixed(2)}</td></tr><tr><td colspan="3">Tax (${invoice.taxRate}%)</td><td>${currSymbol}${invoice.tax.toFixed(2)}</td></tr><tr><td colspan="3"><strong>Total</strong></td><td><strong>${currSymbol}${invoice.total.toFixed(2)}</strong></td></tr></table><p><strong>Notes:</strong> ${invoice.notes}</p>`,
    };

    try {
        await mg.messages.create(process.env.MAILGUN_DOMAIN, data);
        res.send('Email sent');
    } catch (err) {
        res.status(500).send(err.message);
    }
});

exports.api = functions.https.onRequest(app);

// Monthly Reset Invoice Counts (runs 1st of every month at midnight UTC)
exports.monthlyReset = functions.pubsub.schedule('0 0 1 * *').onRun(async () => {
    const usersSnapshot = await db.collection('users').get();
    const batch = db.batch();
    usersSnapshot.forEach(doc => {
        batch.update(doc.ref, { invoicesThisMonth: 0 });
    });
    await batch.commit();
});

exports.processRecurring = functions.pubsub.schedule('0 0 * * *').onRun(async () => {
    const recurringSnapshot = await db.collection('recurring').get();
    recurringSnapshot.forEach(async (doc) => {
        const { userId, template } = doc.data();
        // Stub for now; expand to generate/send invoice
    });
});