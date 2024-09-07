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
    const { From, Body } = req.body;
    const phoneNumber = From.replace('whatsapp:', '');

    // Use the phone number as the session identifier
    let userSession = req.session[phoneNumber];
console.log(req.session[phoneNumber])
    // If no session exists for this phone number, initialize a new one
    if (!userSession) {
        req.session[phoneNumber] = {};
        userSession = req.session[phoneNumber];
    }

    let user = await User.findOne({ phoneNumber });

    if (!user) {
        if (!userSession.pendingRegistration) {
            // Start registration process
            userSession.pendingRegistration = true;
            userSession.phoneNumber = phoneNumber;

            await client.messages.create({
                body: 'Welcome! Please provide your name to register.',
                from: process.env.TWILIO_WHATSAPP_NUMBER,
                to: From
            });
        } else if (!userSession.pendingPassword) {
            // Collect the user's name
            userSession.userName = Body;
            userSession.pendingPassword = true;

            await client.messages.create({
                body: 'Please provide a strong password (6+ characters with uppercase, lowercase, digits, and special characters).',
                from: process.env.TWILIO_WHATSAPP_NUMBER,
                to: From
            });
        } else {
            // Collect and validate the password
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

            // Create a new user
            user = new User({
                name: userSession.userName,
                phoneNumber: userSession.phoneNumber,
                password
            });

            await user.save();

            // Clear the session after registration is complete
            delete req.session[phoneNumber];

            await client.messages.create({
                body: `Thank you, ${user.name}! You are now registered.`,
                from: process.env.TWILIO_WHATSAPP_NUMBER,
                to: From
            });
        }
    } else {
        // User is already registered
        await client.messages.create({
            body: `Hello ${user.name}, you are already registered!`,
            from: process.env.TWILIO_WHATSAPP_NUMBER,
            to: From
        });
    }

    res.status(200).send('Message processed');
});

module.exports = router;
