const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const morgan = require("morgan");
const connectDB = require("./config/db");
const redisClient = require("./config/redis"); // Redis client
const userRoutes = require("./routes/userRoutes");
const errorHandler = require("./middlewares/errorHandler");
const reviewRoutes = require("./routes/reviewRoutes");
const authRoutes = require("./routes/authRoutes");
const companyRoutes = require("./routes/companyRoutes");
const cookieParser = require("cookie-parser");
const jobRoutes = require("./routes/jobRoutes");
const internshipRoutes = require("./routes/internshipRoutes");

// Load environment variables
dotenv.config();

// Connect to MongoDB
connectDB();

const allowedOrigins = [
  "https://www.careerondoor.tech",
  "https://careerondoor.vercel.app",
  "http://localhost:3000"
];

const app = express();

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  })
);

app.use(express.json());
app.use(morgan("dev"));
app.use(cookieParser());

app.get("/", (req, res) => {
  res.send("API is running...");
});

// Routes
app.use("/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/companies", companyRoutes);
app.use("/api/jobs", jobRoutes);
app.use("/api/internships", internshipRoutes);

// Error handling middleware
app.use(errorHandler);

// Start Server
const PORT = process.env.PORT || 5001;
app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));