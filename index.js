require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { connectToDatabase } = require("./config/db.config");

const messageRoutes = require("./routes/message.route");
const sessionRoutes = require("./routes/session.routes");
const { restoreSessions } = require("./helpers/create-client-helper");

const app = express();
connectToDatabase();

app.use(
  cors({
    origin: "http://localhost:3000",
    credentials: true,
  })
);
app.use(express.json());

restoreSessions();

// Routes
app.use("/messages", messageRoutes);
app.use("/", sessionRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
