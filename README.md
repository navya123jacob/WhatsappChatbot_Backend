# WhatsApp Chatbot Backend

This project is the backend of a WhatsApp chatbot application that allows users to interact with the bot through various APIs. It is built using Node.js, Express, MongoDB, and Twilio. The chatbot can handle user registration, OTP verification, and daily updates through a scheduled cron job.

## Features

- **User Registration**: Allows users to register via an API.
- **OTP Verification**: Supports OTP-based verification for user registration.
- **WhatsApp Integration**: Utilizes Twilio to send messages through WhatsApp.
- **Session Management**: Manages sessions using `express-session` and MongoDB via `connect-mongo`.
- **Daily Updates**: Sends daily updates to subscribed users via a cron job.
- **Error Handling**: Basic error handling and response structure.

## Requirements

- Node.js
- MongoDB
- Twilio Account (with valid `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN`)
- Nodemailer
- bcrypt

## Environment Variables

Create a `.env` file in the root directory with the following:

```env
PORT=5000
MONGO_URI=your_mongodb_connection_string
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_WHATSAPP_NUMBER=your_twilio_whatsapp_number
frontend=http://localhost:3000
