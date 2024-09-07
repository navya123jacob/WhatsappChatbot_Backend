const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    name: { type: String },
    email: { type: String, unique: true },
    password: { type: String },
    isVerified: { type: Boolean, default: false },
    phoneNumber: { type: String },
    otp: { type: Number },
    otpSentAt: { type: Date },  // Track when OTP was sent
    sessionId: { type: String }
});

const User = mongoose.model('User', userSchema);

module.exports = User;
