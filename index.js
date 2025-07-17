const express = require("express");
const cors = require("cors");

const app = express();

// Allow all origins
app.use(cors());
app.use(express.json());

// Test Route: Echoes back request body and logs it
app.post("/test-request", (req, res) => {
  console.log("📥 Incoming Request Body:", req.body);
  res.json(req.body);
});

// Start Server
const PORT = process.env.PORT || 5001;
app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));
