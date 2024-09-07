const express = require('express');
const twilio = require('twilio');
const QRCode = require('qrcode');
const User = require('../models/userModel');
const router = express.Router();
const natural = require('natural');
const nodemailer = require('nodemailer');
const tokenizer = new natural.WordTokenizer();
const bcrypt = require('bcrypt');

// Twilio setup
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = new twilio(accountSid, authToken);

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
}); 

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
    const phoneNumber = From.replace('whatsapp:', '');  // Extract phone number from WhatsApp message

    // Find or create user associated with the phone number
    let user = await User.findOne({ phoneNumber });

    if (Body.toLowerCase() === 'start over') {
        // Step 1: Delete the existing user and start the process over
        if (user) {
            await User.deleteOne({ phoneNumber });
        }

        // Ask for the user's name to start the registration process again
        await client.messages.create({
            body: 'Starting over. Please provide your name to register.',
            from: process.env.TWILIO_WHATSAPP_NUMBER,
            to: From
        });
        return;
    }

    if (!user) {
        // Step 2: Create a new user and ask for name
        user = new User({
            phoneNumber,
            isVerified: false,
        });
        await user.save();

        // Ask for the user's name
        await client.messages.create({
            body: 'Welcome! Please provide your name to register.',
            from: process.env.TWILIO_WHATSAPP_NUMBER,
            to: From
        });
        return;
    }

    if (!user.name) {
        // Step 3: Collect the user's name
        user.name = Body;
        await user.save();

        // Ask for a strong password
        await client.messages.create({
            body: 'Please provide a strong password (6+ characters, including uppercase, lowercase, digits, and special characters).',
            from: process.env.TWILIO_WHATSAPP_NUMBER,
            to: From
        });
        return;
    } else if (!user.password) {
        // Step 4: Collect and validate the password
        const password = Body;
        const strongPasswordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{6,}$/;

        if (!strongPasswordRegex.test(password)) {
            await client.messages.create({
                body: 'Password must be strong. Please try again.',
                from: process.env.TWILIO_WHATSAPP_NUMBER,
                to: From
            });
            return;
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        user.password = hashedPassword;
        await user.save();

        // Ask for email
        await client.messages.create({
            body: 'Please provide your email to receive the OTP for verification.',
            from: process.env.TWILIO_WHATSAPP_NUMBER,
            to: From
        });
        return;
    } else if (!user.email) {
        // Step 5: Collect the email, generate OTP, and send email
        user.email = Body;

        const otp = Math.floor(1000 + Math.random() * 9000);
        user.otp = otp;
        user.otpSentAt = new Date();  // Store the time the OTP was sent
        await user.save();

        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: user.email,
            subject: 'Your OTP Code',
            text: `Your OTP code is ${otp}. Please enter it in WhatsApp to complete your registration.`
        };

        await transporter.sendMail(mailOptions);

        await client.messages.create({
            body: 'An OTP has been sent to your email. Please enter it to verify your registration.',
            from: process.env.TWILIO_WHATSAPP_NUMBER,
            to: From
        });
        return;
    } else if (!user.isVerified && user.otp && user.otp.toString() === Body) {
        // Step 6: Verify OTP
        user.isVerified = true;
        user.otp = null;  // Clear the OTP after verification
        await user.save();

        await client.messages.create({
            body: `Thank you, ${user.name}! Your registration is complete, and you are now verified.`,
            from: process.env.TWILIO_WHATSAPP_NUMBER,
            to: From
        });
        return;
    } else if (!user.isVerified && user.otp && user.otp.toString() !== Body) {
        // Step 7: Resend OTP if it's been more than 1 minute
        const now = new Date();
        const oneMinuteAgo = new Date(now.getTime() - 1 * 60 * 1000);  // 1 minute ago

        if (user.otpSentAt && user.otpSentAt < oneMinuteAgo) {
            // Regenerate and resend OTP if more than 1 minute has passed
            const otp = Math.floor(1000 + Math.random() * 9000);
            user.otp = otp;
            user.otpSentAt = new Date();  // Update OTP sent time
            await user.save();

            const mailOptions = {
                from: process.env.EMAIL_USER,
                to: user.email,
                subject: 'Your New OTP Code',
                text: `Your new OTP code is ${otp}. Please enter it in WhatsApp to complete your registration.`
            };

            await transporter.sendMail(mailOptions);

            await client.messages.create({
                body: 'A new OTP has been sent to your email. Please check and enter it.',
                from: process.env.TWILIO_WHATSAPP_NUMBER,
                to: From
            });
        } else {
            // If less than 1 minute, just ask to retry OTP
            await client.messages.create({
                body: 'Incorrect OTP. Please try again or wait for a new OTP.',
                from: process.env.TWILIO_WHATSAPP_NUMBER,
                to: From
            });
        }
        return;
    } else if (user.isVerified) {
        // User is already registered and verified
        await client.messages.create({
            body: `Hello ${user.name}, you are already registered! How can I assist you today?`,
            from: process.env.TWILIO_WHATSAPP_NUMBER,
            to: From
        });
    }

    res.status(200).send('Message processed');
});

module.exports = router;
