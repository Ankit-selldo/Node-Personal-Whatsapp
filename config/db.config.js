const { mongoose } = require("mongoose");

let isConnected = false;
async function connectToDatabase() {
  if (!isConnected) {
    await mongoose
      .connect(process.env.MONGO_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
      })
      .then(() => {
        isConnected = true;
        console.log("Connected to MongoDB");
      })
      .catch((err) => {
        isConnected = false;
        console.error("MongoDB connection error:", err);
      });
  }
}

module.exports = {
  connectToDatabase,
};
