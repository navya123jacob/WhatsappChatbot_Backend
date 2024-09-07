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

    let user = await User.findOne({ phoneNumber });

    if (!user) {
        
        user = new User({
            phoneNumber,
            isVerified: false, 
        });
        await user.save();

        await client.messages.create({
            body: 'Welcome! Please provide your name to register.',
            from: process.env.TWILIO_WHATSAPP_NUMBER,
            to: From
        });
    } else if (!user.name) {
        user.name = Body;
        await user.save();

        await client.messages.create({
            body: 'Please provide a strong password (6+ characters, including uppercase, lowercase, digits, and special characters).',
            from: process.env.TWILIO_WHATSAPP_NUMBER,
            to: From
        });
    } else if (!user.password) {

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

        const hashedPassword = await bcrypt.hash(password, 10);
        user.password = hashedPassword;

        // Step 5: Generate OTP for verification and send via WhatsApp
        const otp = Math.floor(1000 + Math.random() * 9000);
        user.otp = otp;
        await user.save();

        await client.messages.create({
            body: `Your OTP code is ${otp}. Please send it to verify your registration.`,
            from: process.env.TWILIO_WHATSAPP_NUMBER,
            to: From
        });

    } else if (!user.isVerified && user.otp && user.otp.toString() === Body) {
        // Step 6: Verify the OTP
        user.isVerified = true;
        user.otp = null;  // Clear the OTP after verification
        await user.save();

        await client.messages.create({
            body: `Thank you, ${user.name}! Your registration is complete, and you are now verified.`,
            from: process.env.TWILIO_WHATSAPP_NUMBER,
            to: From
        });
    } else if (!user.isVerified && user.otp && user.otp.toString() !== Body) {
        // Step 7: Handle incorrect OTP
        await client.messages.create({
            body: 'Incorrect OTP. Please try again or request a new OTP.',
            from: process.env.TWILIO_WHATSAPP_NUMBER,
            to: From
        });
    } else if (user.isVerified) {
        // The user is already registered and verified
        await client.messages.create({
            body: `Hello ${user.name}, you are already registered! How can I assist you today?`,
            from: process.env.TWILIO_WHATSAPP_NUMBER,
            to: From
        });
    }

    res.status(200).send('Message processed');
});

module.exports = router;
