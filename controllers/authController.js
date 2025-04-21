const User = require("../models/User");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const otpGenerator = require("otp-generator");
const nodemailer = require("nodemailer");
const winston = require("winston");
const { RateLimiterRedis } = require("rate-limiter-flexible");
const redis = require("../config/redis");
const validator = require("validator");
require("dotenv").config();
const crypto = require("crypto");

// Configure logger
const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: "error.log", level: "error" }),
    new winston.transports.File({ filename: "combined.log" }),
  ],
});

// Custom error class
class AppError extends Error {
  constructor(message, statusCode, code = "UNKNOWN") {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

// OTP and reset token configuration
const OTP_EXPIRY_TIME = 10 * 60; // 10 minutes in seconds
const OTP_LENGTH = 6;
const RESET_TOKEN_EXPIRY = 30 * 60; // 30 minutes in seconds

// Rate limiter configurations
const RATE_LIMIT_POINTS = 3;
const RATE_LIMIT_DURATION = 30 * 60; // 30 minutes in seconds

// OTP rate limiters (email and IP-based)
const otpEmailLimiter = new RateLimiterRedis({
  storeClient: redis,
  keyPrefix: "rl:otp:email",
  points: RATE_LIMIT_POINTS,
  duration: RATE_LIMIT_DURATION,
});

const otpIpLimiter = new RateLimiterRedis({
  storeClient: redis,
  keyPrefix: "rl:otp:ip",
  points: RATE_LIMIT_POINTS,
  duration: RATE_LIMIT_DURATION,
});

// Resend OTP rate limiters (email and IP-based)
const resendOtpEmailLimiter = new RateLimiterRedis({
  storeClient: redis,
  keyPrefix: "rl:resendotp:email",
  points: RATE_LIMIT_POINTS,
  duration: RATE_LIMIT_DURATION,
});

const resendOtpIpLimiter = new RateLimiterRedis({
  storeClient: redis,
  keyPrefix: "rl:resendotp:ip",
  points: RATE_LIMIT_POINTS,
  duration: RATE_LIMIT_DURATION,
});

// Password reset rate limiters (email and IP-based)
const passwordResetEmailLimiter = new RateLimiterRedis({
  storeClient: redis,
  keyPrefix: "rl:pwreset:email",
  points: RATE_LIMIT_POINTS,
  duration: RATE_LIMIT_DURATION,
});

const passwordResetIpLimiter = new RateLimiterRedis({
  storeClient: redis,
  keyPrefix: "rl:pwreset:ip",
  points: RATE_LIMIT_POINTS,
  duration: RATE_LIMIT_DURATION,
});

// Login rate limiters (email and IP-based)
const loginEmailLimiter = new RateLimiterRedis({
  storeClient: redis,
  keyPrefix: "rl:login:email",
  points: RATE_LIMIT_POINTS,
  duration: RATE_LIMIT_DURATION,
});

const loginIpLimiter = new RateLimiterRedis({
  storeClient: redis,
  keyPrefix: "rl:login:ip",
  points: RATE_LIMIT_POINTS,
  duration: RATE_LIMIT_DURATION,
});

// Nodemailer Config
let transporter;
try {
  transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
} catch (error) {
  logger.error("Email configuration error", { error: error.message });
  throw new AppError("Email service not configured", 500, "EMAIL_CONFIG_ERROR");
}

// Helper: Validate email format
const isValidEmail = (email) => validator.isEmail(email);

// Helper: Generate and store OTP in Redis
const generateAndStoreOTP = async (email, userData = null) => {
  const otp = otpGenerator.generate(OTP_LENGTH, {
    digits: true,
    alphabets: false,
    specialChars: false,
    upperCaseAlphabets: false,
    lowerCaseAlphabets: false,
  });
  const expiryTime = Date.now() + OTP_EXPIRY_TIME * 1000;
  const otpData = {
    otp,
    expiryTime,
    ...(userData || {}),
  };
  try {
    await redis.setEx(`otp:${email}`, OTP_EXPIRY_TIME, JSON.stringify(otpData));
    logger.info("OTP stored in Redis", { email });
  } catch (error) {
    logger.error("Failed to store OTP in Redis", { email, error: error.message });
    throw new AppError("Failed to store OTP", 500, "REDIS_ERROR");
  }
  return otp;
};

// Helper: Send OTP email
const sendOTPEmail = async (email, otp) => {
  if (!transporter) {
    throw new AppError("Email service not configured", 500, "EMAIL_CONFIG_ERROR");
  }
  try {
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Your CareerOnDoor Verification Code",
      html: `
        <html>
          <head>
            <meta charset="UTF-8" />
            <title>Verify Your Account - CareerOnDoor</title>
            <style>
              body {
                font-family: Arial, sans-serif;
                background-color: #f6f9fc;
                margin: 0;
                padding: 20px;
              }
              .container {
                max-width: 600px;
                margin: 0 auto;
                background-color: #ffffff;
                padding: 30px;
                border: 1px solid #e0e0e0;
                border-radius: 8px;
                box-shadow: 0 2px 8px rgba(0,0,0,0.05);
              }
              .header {
                text-align: center;
                color: #0d9488;
              }
              .otp-box {
                background-color: #e6fffa;
                padding: 20px;
                border-radius: 6px;
                text-align: center;
                font-size: 28px;
                font-weight: bold;
                letter-spacing: 6px;
                color: #0d9488;
                margin: 30px 0;
              }
              .footer {
                text-align: center;
                font-size: 12px;
                color: #999999;
                margin-top: 40px;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <h2 class="header">Verify Your Account</h2>
              <p>Thank you for signing up with <strong>CareerOnDoor</strong>. To complete your registration, please enter the verification code below:</p>
              <div class="otp-box">${otp}</div>
              <p>This code will expire in 10 minutes.</p>
              <p>If you didn’t request this code, you can safely ignore this email.</p>
              <div class="footer">
                CareerOnDoor © ${new Date().getFullYear()}<br />
                You are receiving this email because you registered on our platform.
              </div>
            </div>
          </body>
        </html>
      `,
    });
    logger.info("OTP email sent", { email });
    return true;
  } catch (error) {
    logger.error("Failed to send OTP email", { email, error: error.message });
    throw new AppError("Failed to send verification email", 502, "EMAIL_SEND_FAILED");
  }
};

// Helper: Generate a secure random token
const generateResetToken = () => crypto.randomBytes(32).toString("hex");

// Helper: Store reset token in Redis
const storeResetToken = async (email, token) => {
  try {
    await redis.setEx(
      `reset:${email}`,
      RESET_TOKEN_EXPIRY,
      JSON.stringify({ token, expiryTime: Date.now() + RESET_TOKEN_EXPIRY * 1000 })
    );
    logger.info("Reset token stored in Redis", { email });
  } catch (error) {
    logger.error("Failed to store reset token in Redis", { email, error: error.message });
    throw new AppError("Failed to store reset token", 500, "REDIS_ERROR");
  }
};

// Helper: Send password reset email
const sendResetEmail = async (email, token) => {
  if (!transporter) {
    throw new AppError("Email service not configured", 500, "EMAIL_CONFIG_ERROR");
  }
  const resetUrl = `${process.env.FRONTEND_URL || "https://careerondoor.tech"}/reset-password?token=${token}&email=${encodeURIComponent(email)}`;
  try {
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Here’s the link to reset your CareerOnDoor password",
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="UTF-8" />
            <title>Reset Your Password - CareerOnDoor</title>
            <style>
              body {
                font-family: Arial, sans-serif;
                background-color: #f4f4f4;
                margin: 0;
                padding: 20px;
              }
              .container {
                max-width: 600px;
                margin: 0 auto;
                background-color: #ffffff;
                padding: 30px;
                border-radius: 8px;
                border: 1px solid #e0e0e0;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
              }
              .header {
                text-align: center;
                color: #0d9488;
              }
              .button-container {
                text-align: center;
                margin: 30px 0;
              }
              .button-link {
                background: linear-gradient(to right, #0d9488, #0369a1);
                color: #0d9488;
                text-decoration: none;
                padding: 14px 28px;
                font-weight: bold;
                font-size: 16px;
                border-radius: 5px;
                display: inline-block;
              }
              .footer {
                text-align: center;
                font-size: 12px;
                color: #888888;
                margin-top: 40px;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <h2 class="header">Reset Your Password</h2>
              <p>Hello,</p>
              <p>You requested to reset your CareerOnDoor account password. Please click the button below to proceed:</p>
              <div class="button-container">
                <a href="${resetUrl}" class="button-link" target="_blank">Reset Password</a>
              </div>
              <p>This link will expire in 30 minutes.</p>
              <p>If you didn't request this, please ignore the email. No action will be taken.</p>
              <div class="footer">
                CareerOnDoor © ${new Date().getFullYear()}<br />
                <a href="https://careerondoor.com" style="color: #0d9488; text-decoration: none;">www.careerondoor.com</a>
              </div>
            </div>
          </body>
        </html>
      `,
    });
    logger.info("Reset email sent", { email });
    return true;
  } catch (error) {
    logger.error("Failed to send reset email", { email, error: error.message });
    await redis.del(`reset:${email}`);
    throw new AppError("Failed to send reset email", 502, "EMAIL_SEND_FAILED");
  }
};

// Register User & Send OTP
exports.register = async (req, res) => {
  try {
    const { firstName, lastName, username, email, password, avatar } = req.body;

    if (!firstName || !lastName || !username || !email || !password || !avatar) {
      throw new AppError("All fields are required", 400, "MISSING_FIELDS");
    }
    if (!isValidEmail(email)) {
      throw new AppError("Invalid email format", 400, "INVALID_EMAIL");
    }
    if (password.length < 6) {
      throw new AppError("Password must be at least 6 characters long", 400, "WEAK_PASSWORD");
    }

    try {
      await Promise.all([
        otpEmailLimiter.consume(email),
        otpIpLimiter.consume(req.ip),
      ]);
    } catch (error) {
      logger.warn("Rate limit exceeded for OTP generation", { email, ip: req.ip });
      throw new AppError(
        `Too many OTP requests from this ${error.key.includes("email") ? "email" : "IP"}. Try again in ${Math.round(error.msBeforeNext / 1000)} seconds.`,
        429,
        "RATE_LIMIT_EXCEEDED"
      );
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      throw new AppError("User already exists", 400, "USER_EXISTS");
    }

    const existingUsername = await User.findOne({ username });
    if (existingUsername) {
      throw new AppError("Username already taken", 400, "USERNAME_TAKEN");
    }

    const otp = await generateAndStoreOTP(email, { firstName, lastName, username, password, avatar });
    await sendOTPEmail(email, otp);

    res.status(200).json({ success: true, message: "OTP sent to email, verify to complete registration" });
  } catch (error) {
    if (error.isOperational) {
      res.status(error.statusCode).json({ success: false, message: error.message, code: error.code });
    } else {
      logger.error("Registration error", { email: req.body.email, error: error.message, stack: error.stack });
      res.status(500).json({ success: false, message: "Server error", code: "SERVER_ERROR" });
    }
  }
};

// Verify OTP & Create User
exports.verifyOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      throw new AppError("Email and OTP are required", 400, "MISSING_FIELDS");
    }

    let storedData;
    try {
      const storedDataStr = await redis.get(`otp:${email}`);
      if (!storedDataStr) {
        throw new AppError("OTP expired or not found. Request a new one.", 400, "OTP_NOT_FOUND");
      }
      storedData = JSON.parse(storedDataStr);
    } catch (error) {
      logger.error("Failed to retrieve OTP from Redis", { email, error: error.message });
      throw new AppError("Failed to verify OTP", 500, "REDIS_ERROR");
    }

    if (storedData.otp !== otp) {
      throw new AppError("Invalid OTP", 400, "INVALID_OTP");
    }

    if (!storedData.expiryTime || Date.now() > storedData.expiryTime) {
      await redis.del(`otp:${email}`);
      throw new AppError("OTP expired. Request a new one.", 400, "OTP_EXPIRED");
    }

    if (!storedData.firstName || !storedData.lastName || !storedData.username || !storedData.password) {
      await redis.del(`otp:${email}`);
      throw new AppError("Registration data missing. Sign up again.", 400, "MISSING_DATA");
    }

    const hashedPassword = await bcrypt.hash(storedData.password, 10);
    const newUser = await User.create({
      firstName: storedData.firstName,
      lastName: storedData.lastName,
      username: storedData.username,
      email,
      avatar: storedData.avatar,
      password: hashedPassword,
    });

    await redis.del(`otp:${email}`);

    const token = jwt.sign({ id: newUser._id }, process.env.JWT_SECRET, { expiresIn: "6h" });

    res.cookie("auth_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite:"none",
      maxAge: 6 * 60 * 60 * 1000, // 6 hours
    });

    expiry=Date.now() + 6 * 60 * 60 * 1000; // 6 hours
    res.status(201).json({
      success: true,
      message: "User registered successfully",
      user: {
        id: newUser._id,
        firstName: newUser.firstName,
        lastName: newUser.lastName,
        username: newUser.username,
        email: newUser.email,
        avatar: newUser.avatar,
        admin: newUser.admin,
        tokenExpiry: expiry,
      },
    });
  } catch (error) {
    if (error.isOperational) {
      res.status(error.statusCode).json({ success: false, message: error.message, code: error.code });
    } else {
      logger.error("OTP verification error", { email: req.body.email, error: error.message, stack: error.stack });
      res.status(500).json({ success: false, message: "Server error", code: "SERVER_ERROR" });
    }
  }
};

// Resend OTP
exports.resendOTP = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      throw new AppError("Email is required", 400, "MISSING_EMAIL");
    }
    if (!isValidEmail(email)) {
      throw new AppError("Invalid email format", 400, "INVALID_EMAIL");
    }

    try {
      await Promise.all([
        resendOtpEmailLimiter.consume(email),
        resendOtpIpLimiter.consume(req.ip),
      ]);
    } catch (error) {
      logger.warn("Rate limit exceeded for OTP resend", { email, ip: req.ip });
      throw new AppError(
        `Too many OTP resend requests from this ${error.key.includes("email") ? "email" : "IP"}. Try again in ${Math.round(error.msBeforeNext / 1000)} seconds.`,
        429,
        "RATE_LIMIT_EXCEEDED"
      );
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      throw new AppError("Account already verified. Please login.", 400, "ALREADY_VERIFIED");
    }

    let storedData;
    try {
      const storedDataStr = await redis.get(`otp:${email}`);
      if (!storedDataStr) {
        throw new AppError("No registration found for this email", 404, "NO_REGISTRATION");
      }
      storedData = JSON.parse(storedDataStr);
    } catch (error) {
      logger.error("Failed to retrieve OTP from Redis", { email, email: error.message });
      throw new AppError("Failed to resend OTP", 500, "REDIS_ERROR");
    }

    const otp = await generateAndStoreOTP(email, storedData);
    await sendOTPEmail(email, otp);

    res.status(200).json({ success: true, message: "New OTP sent to your email" });
  } catch (error) {
    if (error.isOperational) {
      res.status(error.statusCode).json({ success: false, message: error.message, code: error.code });
    } else {
      logger.error("Resend OTP error", { email: req.body.email, error: error.message, stack: error.stack });
      res.status(500).json({ success: false, message: "Server error", code: "SERVER_ERROR" });
    }
  }
};

// Forgot Password - Send reset link
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      throw new AppError("Email is required", 400, "MISSING_EMAIL");
    }
    if (!isValidEmail(email)) {
      throw new AppError("Invalid email format", 400, "INVALID_EMAIL");
    }

    try {
      await Promise.all([
        passwordResetEmailLimiter.consume(email),
        passwordResetIpLimiter.consume(req.ip),
      ]);
    } catch (errors) {
      logger.warn("Rate limit exceeded for password reset", { email, ip: req.ip });
      // Handle multiple errors from Promise.all
      let msBeforeNext = 0;
      let source = "source";
      if (Array.isArray(errors)) {
        // Multiple rate limit errors
        const emailError = errors.find(err => err.key?.includes("email"));
        const ipError = errors.find(err => err.key?.includes("ip"));
        msBeforeNext = Math.max(
          emailError?.msBeforeNext || 0,
          ipError?.msBeforeNext || 0
        );
        source = emailError && ipError ? "email or IP" : emailError ? "email" : "IP";
      } else {
        // Single error
        msBeforeNext = errors.msBeforeNext || RATE_LIMIT_DURATION * 1000;
        source = errors.key?.includes("email") ? "email" : "IP";
      }
      throw new AppError(
        `Too many password reset requests from this ${source}. Try again in ${Math.round(msBeforeNext / 1000)} seconds.`,
        429,
        "RATE_LIMIT_EXCEEDED"
      );
    }

    const user = await User.findOne({ email });
    if (!user) {
      logger.info("Password reset requested for non-existent email", { email, ip: req.ip });
      return res.status(200).json({
        success: true,
        message: "If your email is registered, you will receive a password reset link",
      });
    }

    const resetToken = generateResetToken();
    await storeResetToken(email, resetToken);
    await sendResetEmail(email, resetToken);

    res.status(200).json({ success: true, message: "Password reset link sent to your email" });
  } catch (error) {
    if (error.isOperational) {
      res.status(error.statusCode).json({ success: false, message: error.message, code: error.code });
    } else {
      logger.error("Forgot password error", { email: req.body.email, error: error.message, stack: error.stack });
      res.status(500).json({ success: false, message: "Server error", code: "SERVER_ERROR" });
    }
  }
};

// Validate Reset Token
exports.validateResetToken = async (req, res) => {
  try {
    const { email, token } = req.body;

    if (!email || !token) {
      throw new AppError("Email and token are required", 400, "MISSING_FIELDS");
    }

    let storedData;
    try {
      const storedDataStr = await redis.get(`reset:${email}`);
      if (!storedDataStr) {
        throw new AppError("Invalid or expired reset token", 400, "INVALID_TOKEN");
      }
      storedData = JSON.parse(storedDataStr);
    } catch (error) {
      logger.error("Failed to retrieve reset token from Redis", { email, error: error.message });
      throw new AppError("Failed to validate token", 500, "REDIS_ERROR");
    }

    if (storedData.token !== token) {
      throw new AppError("Invalid or expired reset token", 400, "INVALID_TOKEN");
    }

    if (Date.now() > storedData.expiryTime) {
      await redis.del(`reset:${email}`);
      throw new AppError("Reset token has expired", 400, "TOKEN_EXPIRED");
    }

    res.status(200).json({ success: true, message: "Token is valid" });
  } catch (error) {
    if (error.isOperational) {
      res.status(error.statusCode).json({ success: false, message: error.message, code: error.code });
    } else {
      logger.error("Validate reset token error", { email: req.body.email, error: error.message, stack: error.stack });
      res.status(500).json({ success: false, message: "Server error", code: "SERVER_ERROR" });
    }
  }
};

// Reset Password
exports.resetPassword = async (req, res) => {
  try {
    const { email, token, password } = req.body;

    if (!email || !token || !password) {
      throw new AppError("Email, token, and password are required", 400, "MISSING_FIELDS");
    }

    let storedData;
    try {
      const storedDataStr = await redis.get(`reset:${email}`);
      if (!storedDataStr) {
        throw new AppError("Invalid or expired reset token", 400, "INVALID_TOKEN");
      }
      storedData = JSON.parse(storedDataStr);
    } catch (error) {
      logger.error("Failed to retrieve reset token from Redis", { email, error: error.message });
      throw new AppError("Failed to reset password", 500, "REDIS_ERROR");
    }

    if (storedData.token !== token) {
      throw new AppError("Invalid or expired reset token", 400, "INVALID_TOKEN");
    }

    if (Date.now() > storedData.expiryTime) {
      await redis.del(`reset:${email}`);
      throw new AppError("Reset token has expired", 400, "TOKEN_EXPIRED");
    }

    const user = await User.findOne({ email });
    if (!user) {
      throw new AppError("User not found", 404, "USER_NOT_FOUND");
    }

    if (password.length < 6) {
      throw new AppError("Password must be at least 6 characters long", 400, "WEAK_PASSWORD");
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    user.password = hashedPassword;
    await user.save();

    await redis.del(`reset:${email}`);

    res.status(200).json({ success: true, message: "Password reset successful" });
  } catch (error) {
    if (error.isOperational) {
      res.status(error.statusCode).json({ success: false, message: error.message, code: error.code });
    } else {
      logger.error("Reset password error", { email: req.body.email, error: error.message, stack: error.stack });
      res.status(500).json({ success: false, message: "Server error", code: "SERVER_ERROR" });
    }
  }
};

// Login User
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      throw new AppError("Email and password are required", 400, "MISSING_FIELDS");
    }

    try {
      await Promise.all([
        loginEmailLimiter.consume(email),
        loginIpLimiter.consume(req.ip),
      ]);
    } catch (error) {
      logger.warn("Rate limit exceeded for login", { email, ip: req.ip });
      throw new AppError(
        `Too many login attempts from this ${error.key.includes("email") ? "email" : "IP"}. Try again in ${Math.round(error.msBeforeNext / 1000)} seconds.`,
        429,
        "RATE_LIMIT_EXCEEDED"
      );
    }

    const user = await User.findOne({ email });
    if (!user) {
      throw new AppError("User not found", 404, "USER_NOT_FOUND");
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      throw new AppError("Invalid credentials", 400, "INVALID_CREDENTIALS");
    }

    await Promise.all([
      loginEmailLimiter.delete(email),
      loginIpLimiter.delete(req.ip),
    ]);

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: "6h" });

    res.cookie("auth_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "none",
      maxAge: 6 * 60 * 60 * 1000, // 6 hours
    });
    expiry=Date.now() + 6 * 60 * 60 * 1000; // 6 hours

    res.status(200).json({
      success: true,
      message: "Login successful",
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        username: user.username,
        email: user.email,
        avatar: user.avatar,
        admin: user.admin,
        tokenExpiry: expiry,
      },
    });
  } catch (error) {
    if (error.isOperational) {
      res.status(error.statusCode).json({ success: false, message: error.message, code: error.code });
    } else {
      logger.error("Login error", { email: req.body.email, error: error.message, stack: error.stack });
      res.status(500).json({ success: false, message: "Server error", code: "SERVER_ERROR" });
    }
  }
};

// Logout User
exports.logout = (req, res) => {
  try {
    res.clearCookie("auth_token", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite:"none",
    });
    res.status(200).json({ success: true, message: "Logged out successfully" });
  } catch (error) {
    logger.error("Logout error", { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, message: "Server error", code: "SERVER_ERROR" });
  }
};