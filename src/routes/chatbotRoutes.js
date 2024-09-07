const express = require('express');
const twilio = require('twilio');
const QRCode = require('qrcode');
const User = require('../models/userModel');
const router = express.Router();
const natural = require('natural');
const tokenizer = new natural.WordTokenizer();
const session = require('express-session');

// Twilio setup
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = new twilio(accountSid, authToken);


router.get('/generate-qr', async (req, res) => {
    try {
        const whatsappNumber = process.env.TWILIO_WHATSAPP_NUMBER;
        const message = "Hello, I want to register.";
        const url = `https://wa.me/${whatsappNumber.replace('whatsapp:', '')}?text=${encodeURIComponent(message)}`;

        const qrCodeDataURL = await QRCode.toDataURL(url);

        res.status(200).json({ qrCodeDataURL });
    } catch (error) {
        console.error('Error generating QR code:', error);
        res.status(500).send('Failed to generate QR code');
    }
});

// Chatbot interaction
router.post('/message', async (req, res) => {
    console.log('in')
    const { From, Body } = req.body;
    console.log(req.body,'body')
    const phoneNumber = From.replace('whatsapp:', '');

    let user = await User.findOne({ phoneNumber });
    console.log('Session ID:', req.sessionID);
    console.log('Session Data:', req.session);

    if (!user) {
        if (!req.session.pendingRegistration) {
            req.session.pendingRegistration = true;
            req.session.phoneNumber = phoneNumber;

            await client.messages.create({
                body: 'Welcome! Please provide your name to register.',
                from: process.env.TWILIO_WHATSAPP_NUMBER,
                to: From
            });
        } else if (!req.session.pendingPassword) {
            req.session.userName = Body;
            req.session.pendingPassword = true;

            await client.messages.create({
                body: 'Please provide a strong password (6+ characters with uppercase, lowercase, digits, and special characters).',
                from: process.env.TWILIO_WHATSAPP_NUMBER,
                to: From
            });
        } else {
            const password = Body;
            const strongPasswordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{6,}$/;

            if (!strongPasswordRegex.test(password)) {
                await client.messages.create({
                    body: 'Password must be strong (6+ characters with uppercase, lowercase, digits, and special characters). Please try again.',
                    from: process.env.TWILIO_WHATSAPP_NUMBER,
                    to: From
                });
                return;
            }

            user = new User({
                name: req.session.userName,
                phoneNumber: req.session.phoneNumber,
                password
            });

            await user.save();

            req.session.pendingRegistration = false;
            req.session.pendingPassword = false;
            req.session.phoneNumber = null;
            req.session.userName = null;

            await client.messages.create({
                body: `Thank you, ${user.name}! You are now registered.`,
                from: process.env.TWILIO_WHATSAPP_NUMBER,
                to: From
            });
        }
    } else {
        await client.messages.create({
            body: `Hello ${user.name}, you are already registered!`,
            from: process.env.TWILIO_WHATSAPP_NUMBER,
            to: From
        });
    }

    res.status(200).send('Message processed');
});

module.exports = router;
