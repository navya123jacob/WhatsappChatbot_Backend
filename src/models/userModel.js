const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    name: { type: String },
    email: { type: String, unique: true },
    password: { type: String },
    isVerified: { type: Boolean, default: false },
    phoneNumber: { type: String },
    otp: { type: Number },
    otpSentAt: { type: Date },
    otpResendRequestedAt: { type: Date },  // Field to track resend request
    sessionId: { type: String },
    currentStep: {
        type: String,
        default: 'menu' 
      }
});

const User = mongoose.model('User', userSchema);

module.exports = User;
