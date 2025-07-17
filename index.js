const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors()); // Allow all origins
app.use(express.json()); // To handle JSON
app.use(express.urlencoded({ extended: true })); // ✅ To handle HTML form data

// Root route
app.get("/", (req, res) => {
  res.send("✅ Backend is live!");
});

// Form handler
app.post("/test-request", (req, res) => {
  console.log("📥 Incoming Form Data:", req.body); // Show in backend logs
  res.json(req.body); // Echo back form data
});

// Start server
const PORT = process.env.PORT || 5001;
app.listen(PORT, () =>
  console.log(`🚀 Server running on port ${PORT}`)
);
