const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const nodemailer = require('nodemailer');
const User = require('../models/userModel');
const router = express.Router();

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});


router.post('/register', async (req, res) => {
    const { name, email, password,phoneNumber } = req.body;

    try {
        await User.deleteOne({ email,isVerified:false });
        const existingUser = await User.findOne({ email });
        if (existingUser) return res.status(400).json({ error: 'User already exists' });

        const hashedPassword = await bcrypt.hash(password, 10);

        const otp = Math.floor(1000 + Math.random() * 9000);

        const user = new User({ name, email, password: hashedPassword, otp,phoneNumber });

        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: email,
            subject: 'Your OTP Code',
            text: `Your OTP code is ${otp}`
        };

        await transporter.sendMail(mailOptions);
        await user.save();
        res.status(200).json({ message: 'OTP sent to your email.' });
    } catch (err) {
        res.status(500).json({ error: 'Error registering user' });
    }
});



router.get('/confirm/:token', async (req, res) => {
    try {
        const decoded = jwt.verify(req.params.token, process.env.JWT_SECRET);
        await User.findByIdAndUpdate(decoded.id, { isVerified: true });
        res.status(200).json({ message: 'Email confirmed. You can now log in.' });
    } catch (err) {
        res.status(400).json({ error: 'Invalid or expired token' });
    }
});


router.post('/verify-otp', async (req, res) => {
    const { email, otp } = req.body;

    try {
        const user = await User.findOne({ email });
        if (!user) return res.status(400).json({ error: 'User not found' });

        if (user.otp == otp) {
            user.isVerified = true;
            user.otp = null; 
            user.save()
            return res.status(200).json({ message: 'OTP verified successfully' });
        } else {
            return res.status(400).json({ error: 'Invalid OTP' });
        }
    } catch (err) {
        res.status(500).json({ error: 'Error verifying OTP' });
    }
});


router.post('/resend-otp', async (req, res) => {
    const { email } = req.body;

    try {
        const user = await User.findOne({ email });
        if (!user) return res.status(400).json({ error: 'User not found' });

        const otp = Math.floor(1000 + Math.random() * 9000);
        const expiresIn = 10 * 60 * 1000; 
        user.otp =otp

        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: email,
            subject: 'Your OTP Code',
            text: `Your new OTP code is ${otp}`
        };
        await transporter.sendMail(mailOptions);
        user.save()
        res.status(200).json({ message: 'OTP resent to your email.' });
    } catch (err) {
        res.status(500).json({ error: 'Error resending OTP' });
    }
});



router.post('/login', async (req, res) => {
    const { email, password} = req.body;

    try {
        await User.deleteOne({ email,isVerified:false });
        const user = await User.findOne({ email });

        if (!user || !user.isVerified) return res.status(400).json({ error: 'User not found' });

        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) return res.status(400).json({ error: 'Invalid password' });

        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '1h' });

        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production', 
            sameSite: 'strict',
        });

        res.status(200).json({ id: user._id, name: user.name, email: user.email });
    } catch (err) {
        res.status(500).json({ error: 'Error logging in' });
    }
});

module.exports = router;
