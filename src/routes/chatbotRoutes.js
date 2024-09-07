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

    if (Body.toLowerCase() === 'start over') {
        if(user.isVerified){
            await client.messages.create({
                body: `Hello ${user.name},registartion complete,this code is invalid`,
                from: process.env.TWILIO_WHATSAPP_NUMBER,
                to: From
            });
            return; 
        }
        if (user) {
            await User.deleteOne({ phoneNumber });
        }

        await client.messages.create({
            body: 'Starting over. Please type something.',
            from: process.env.TWILIO_WHATSAPP_NUMBER,
            to: From
        });
        return;
    }

    if (Body.toLowerCase() === 'resend otp') {
        if (user && !user.isVerified && user.otp) {
            const now = new Date();
            const oneMinuteAgo = new Date(now.getTime() - 1 * 60 * 1000); 

            if (!user.otpResendRequestedAt || user.otpResendRequestedAt < oneMinuteAgo) {
                
                const otp = Math.floor(1000 + Math.random() * 9000);
                user.otp = otp;
                user.otpSentAt = new Date();  
                user.otpResendRequestedAt = new Date();  
                await user.save();

                const mailOptions = {
                    from: process.env.EMAIL_USER,
                    to: user.email,
                    subject: 'Your New OTP Code',
                    text: `Your new OTP code is ${otp}. Please enter it in WhatsApp to complete your registration.`
                };

                await transporter.sendMail(mailOptions);

                await client.messages.create({
                    body: 'Your old OTP expires,a new OTP has been sent to your email. Please check and enter it.',
                    from: process.env.TWILIO_WHATSAPP_NUMBER,
                    to: From
                });
            } else {
                await client.messages.create({
                    body: 'You must wait for 1 minute before requesting a new OTP. Please try again later.',
                    from: process.env.TWILIO_WHATSAPP_NUMBER,
                    to: From
                });
            }
        } else {
            await client.messages.create({
                body: 'You are not currently in the registration process or already verified.',
                from: process.env.TWILIO_WHATSAPP_NUMBER,
                to: From
            });
        }
        return;
    }

    if (!user) {
        user = new User({
            phoneNumber,
            isVerified: false,
        });
        await user.save();
        await client.messages.create({
            body: 'Welcome! I am Navya and this is a test version of Twilio! Please provide your name to register.',
            from: process.env.TWILIO_WHATSAPP_NUMBER,
            to: From
        });
        return;
    }

    if (!user.name) {
        user.name = Body;
        await user.save();

        await client.messages.create({
            body: 'Please provide a strong password (6+ characters, including uppercase, lowercase, digits, and special characters).',
            from: process.env.TWILIO_WHATSAPP_NUMBER,
            to: From
        });
        return;
    } else if (!user.password) {
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
            body: 'Please provide your email to receive the OTP for verification.',
            from: process.env.TWILIO_WHATSAPP_NUMBER,
            to: From
        });
        return;
    } else if (!user.email) {
        user.email = Body;
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if (!emailRegex.test(user.email)) {
            await client.messages.create({
                body: 'The email address you provided is not valid. Please provide a valid email address.',
                from: process.env.TWILIO_WHATSAPP_NUMBER,
                to: From
            });
            return;
        }
        const otp = Math.floor(1000 + Math.random() * 9000);
        user.otp = otp;
        user.otpSentAt = new Date(); 
        await user.save();

        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: user.email,
            subject: 'Your OTP Code',
            text: `Your OTP code is ${otp}. Please enter it in WhatsApp to complete your registration. `
        };

        await transporter.sendMail(mailOptions);

        await client.messages.create({
            body: 'An OTP has been sent to your email. Please enter it to verify your registration. Type "RESEND OTP" if you need another new OTP and "START OVER" if you want to start over the registration process.',
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
                body: 'A new OTP has been sent to your email. Please check and enter it.Type "RESEND OTP" if you need another new OTP and "START OVER" if you want to start over the registration process.',
                from: process.env.TWILIO_WHATSAPP_NUMBER,
                to: From
            });
        } else {

            await client.messages.create({
                body: 'Incorrect OTP. Please try again or wait for a new OTP.',
                from: process.env.TWILIO_WHATSAPP_NUMBER,
                to: From
            });
        }
        return;
    } else if(user.isVerified) {
        if (user.currentStep === 'menu') {
          const menu = `Hello ${user.name}, you are already registered! Please choose an option:
    1. Order Status
    2. Product Info
    3. Check Weather
    4. Get News
    5. Subscribe to Daily Updates (Type "subscribe")`;
    
          await client.messages.create({
            body: menu,
            from: process.env.TWILIO_WHATSAPP_NUMBER,
            to: From
          });
    
          user.currentStep = 'awaitingMenuSelection';  
          await user.save();
          return;
        } else if (user.currentStep === 'awaitingMenuSelection') {
   
          switch (Body.trim()) {
            case '1':
              await client.messages.create({
                body: 'You selected Order Status. Please provide your order number.',
                from: process.env.TWILIO_WHATSAPP_NUMBER,
                to: From
              });
              user.currentStep = 'awaitingOrderNumber'; 
              break;
    
            case '2':
              await client.messages.create({
                body: 'You selected Product Info. Please provide product details.',
                from: process.env.TWILIO_WHATSAPP_NUMBER,
                to: From
              });
              user.currentStep = 'awaitingProductInfo'; // Update step
              break;
    
            case '3':
              await client.messages.create({
                body: 'You selected Check Weather. Please provide your location.',
                from: process.env.TWILIO_WHATSAPP_NUMBER,
                to: From
              });
              user.currentStep = 'awaitingWeatherLocation'; // Update step
              break;
    
            case '4':
              await client.messages.create({
                body: 'You selected Get News. Fetching the latest news...',
                from: process.env.TWILIO_WHATSAPP_NUMBER,
                to: From
              });
              user.currentStep = 'menu';  // After fetching news, return to the menu
              break;
    
            case '5':
            case 'subscribe':
              await client.messages.create({
                body: 'You are now subscribed to daily updates.',
                from: process.env.TWILIO_WHATSAPP_NUMBER,
                to: From
              });
              user.currentStep = 'menu';  // Return to the menu after subscription
              break;
    
            default:
              await client.messages.create({
                body: 'Invalid selection. Please choose a valid option from the menu.',
                from: process.env.TWILIO_WHATSAPP_NUMBER,
                to: From
              });
              break;
          }
    
          await user.save();
        }
    
        // Additional steps (e.g., awaiting order number, weather location) can be handled similarly.
      }
    
      res.status(200).send('Message processed');
    });


module.exports = router;
