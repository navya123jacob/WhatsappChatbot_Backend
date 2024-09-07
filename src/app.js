const express = require("express");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const chatbotRoutes = require("./routes/chatbotRoutes");
const authRoutes = require("./routes/authRoutes");
const twilio = require("twilio");
const session = require("express-session");
const MongoStore = require("connect-mongo");
// const cron = require("node-cron");
dotenv.config();

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = new twilio(accountSid, authToken);

const app = express();

app.use(
  session({
    secret: "my-secret-key",
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: process.env.MONGO_URI,
      collectionName: "sessions",
    }),
    cookie: { secure: true },
  })
);
app.use(cookieParser());

app.use(
  cors({
    origin: process.env.frontend,
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  })
);
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

app.use("/api/chatbot", chatbotRoutes);
app.use("/api/auth", authRoutes);

app.all("*", (req, res) => {
  res.status(404).json({ error: "Not Found" });
});
const PORT = process.env.PORT || 5000;
mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    console.log("Connected to MongoDB");
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch((err) => {
    console.error("Connection error", err.message);
  });

// Set up cron job to send daily updates at 9:00 AM every day
// cron.schedule("0 9 * * *", async () => {
//   console.log("Running daily cron job to send updates");

//   const subscribedUsers = await User.find({ isSubscribed: true });
//   subscribedUsers.forEach(async (user) => {
//     try {
//         const weatherUpdate = 'Here is your daily weather report: Sunny, 25°C.';  
//         await client.messages.create({
//             body: `Hello ${user.name}, ${weatherUpdate}`,
//             from: process.env.TWILIO_WHATSAPP_NUMBER,
//             to: user.phoneNumber 
//         });
//         console.log(`Sent daily update to ${user.phoneNumber}`);
//     } catch (error) {
//         console.error(`Failed to send daily update to ${user.phoneNumber}: `, error);
//     }
//   });
// }).catch(err => {
//     console.error('Connection error', err.message);
// });
