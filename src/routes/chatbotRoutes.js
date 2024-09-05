// routes/chatbotRoutes.js
const express = require('express');
const User = require('../models/userModel');
const twilio = require('twilio');
const natural = require('natural');
const router = express.Router();

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = new twilio(accountSid, authToken);

const tokenizer = new natural.WordTokenizer();

router.post('/message', async (req, res) => {
    const { From, Body } = req.body;
    const phoneNumber = From.replace('whatsapp:', '');

    let user = await User.findOne({ phoneNumber });

    if (!user) {
        if (!req.session.pendingRegistration) {
            req.session.pendingRegistration = true;
            req.session.phoneNumber = phoneNumber;

            await client.messages.create({
                body: 'Welcome! Please provide your name to register.',
                from: process.env.TWILIO_WHATSAPP_NUMBER,
                to: From
            });
        } else {
            user = new User({
                name: Body,
                phoneNumber: req.session.phoneNumber
            });

            await user.save();

            req.session.pendingRegistration = false;
            req.session.phoneNumber = null;

            await client.messages.create({
                body: `Thank you, ${user.name}! You are now registered.`,
                from: process.env.TWILIO_WHATSAPP_NUMBER,
                to: From
            });

            await client.messages.create({
                body: 'Please choose an option:\n1. Check Order Status\n2. Product Info\n3. Business Hours',
                from: process.env.TWILIO_WHATSAPP_NUMBER,
                to: From
            });
        }
    } else {
        const tokens = tokenizer.tokenize(Body.toLowerCase());
        let response;
        
        if (tokens.includes('order') || tokens.includes('status')) {
            response = 'Your order is being processed.';
        } else if (tokens.includes('product') || tokens.includes('info')) {
            response = 'Our products include XYZ.';
        } else if (tokens.includes('hours') || tokens.includes('business')) {
            response = 'We are open from 9 AM to 9 PM.';
        } else {
            response = 'Invalid option. Please choose:\n1. Check Order Status\n2. Product Info\n3. Business Hours';
        }

        await client.messages.create({
            body: response,
            from: process.env.TWILIO_WHATSAPP_NUMBER,
            to: From
        });
    }

    res.status(200).send('Message processed');
});

module.exports = router;
