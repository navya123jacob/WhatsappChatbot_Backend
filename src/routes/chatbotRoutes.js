const express = require('express');
const twilio = require('twilio');
const QRCode = require('qrcode');
const User = require('../models/userModel');
const router = express.Router();
const natural = require('natural');
const nodemailer = require('nodemailer');
const tokenizer = new natural.WordTokenizer();
const bcrypt = require('bcrypt');

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


router.post('/message', async (req, res) => {
    const { From, Body } = req.body;
    const phoneNumber = From.replace('whatsapp:', '');  

    let user = await User.findOne({ phoneNumber });

    if (!user) {
        await client.messages.create({
            body: 'To start the registration process, please provide your name. If you wish to start over during registration, type "START OVER".',
            from: process.env.TWILIO_WHATSAPP_NUMBER,
            to: From
        });
        return;
    }

    if (Body.toLowerCase() === 'start over') {
        if (user) {
            await User.deleteOne({ phoneNumber });
        }

        await client.messages.create({
            body: 'Starting over. Please provide your name to register.',
            from: process.env.TWILIO_WHATSAPP_NUMBER,
            to: From
        });
        return;
    }

    if (!user.name) {
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
        return;
    }

    if (!user.password) {
        user.name = Body;
        await user.save();

        await client.messages.create({
            body: 'Please provide a strong password (6+ characters, including uppercase, lowercase, digits, and special characters).',
            from: process.env.TWILIO_WHATSAPP_NUMBER,
            to: From
        });
        return;
    } else if (!user.email) {
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

        await client.messages.create({
            body: 'Please provide your email address to receive the OTP for verification.',
            from: process.env.TWILIO_WHATSAPP_NUMBER,
            to: From
        });
        return;
    } else if (!user.email) {
        const email = Body;
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if (!emailRegex.test(email)) {
            await client.messages.create({
                body: 'The email address you provided is not valid. Please provide a valid email address.',
                from: process.env.TWILIO_WHATSAPP_NUMBER,
                to: From
            });
            return;
        }

        user.email = email;

        const otp = Math.floor(1000 + Math.random() * 9000);
        user.otp = otp;
        user.otpSentAt = new Date(); 
        await user.save();

        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: user.email,
            subject: 'Your OTP Code',
            text: `Your OTP code is ${otp}. Please enter it in WhatsApp to complete your registration.`
        };

        await transporter.sendMail(mailOptions);

        await client.messages.create({
            body: 'An OTP has been sent to your email. Please enter it to verify your registration. If you do not receive the OTP within 1 minute, type "RESEND OTP" to request a new one.',
            from: process.env.TWILIO_WHATSAPP_NUMBER,
            to: From
        });
        return;
    } else if (!user.isVerified && user.otp && user.otp.toString() === Body) {
        user.isVerified = true;
        user.otp = null; 
        await user.save();

        await client.messages.create({
            body: `Thank you, ${user.name}! Your registration is complete, and you are now verified.`,
            from: process.env.TWILIO_WHATSAPP_NUMBER,
            to: From
        });
        return;
    } else if (!user.isVerified && user.otp && user.otp.toString() !== Body) {
        const now = new Date();
        const oneMinuteAgo = new Date(now.getTime() - 1 * 60 * 1000);  

        if (user.otpSentAt && user.otpSentAt < oneMinuteAgo) {
            const otp = Math.floor(1000 + Math.random() * 9000);
            user.otp = otp;
            user.otpSentAt = new Date();  
            await user.save();

            const mailOptions = {
                from: process.env.EMAIL_USER,
                to: user.email,
                subject: 'Your New OTP Code',
                text: `Your new OTP code is ${otp}. Please enter it in WhatsApp to complete your registration.`
            };

            await transporter.sendMail(mailOptions);

            await client.messages.create({
                body: 'A new OTP has been sent to your email. Please check and enter it. If you do not receive it within 1 minute, type "RESEND OTP" to request another one.',
                from: process.env.TWILIO_WHATSAPP_NUMBER,
                to: From
            });
        } else {
            await client.messages.create({
                body: 'Incorrect OTP. Please try again. If you need a new OTP, wait 1 minute and then type "RESEND OTP".',
                from: process.env.TWILIO_WHATSAPP_NUMBER,
                to: From
            });
        }
        return;
    } else if (user.isVerified) {
        await client.messages.create({
            body: `Hello ${user.name}, you are already registered! How can I assist you today?`,
            from: process.env.TWILIO_WHATSAPP_NUMBER,
            to: From
        });
    }

    res.status(200).send('Message processed');
});

module.exports = router;
