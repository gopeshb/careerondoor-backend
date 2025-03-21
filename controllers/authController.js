const User = require("../models/User")
const jwt = require("jsonwebtoken")
const bcrypt = require("bcryptjs")
const otpGenerator = require("otp-generator")
const nodemailer = require("nodemailer")
require("dotenv").config()
const crypto = require("crypto")

// Enhanced OTP store with expiration
const otpStore = new Map()

// OTP configuration
const OTP_EXPIRY_TIME = 10 * 60 * 1000 // 10 minutes in milliseconds
const OTP_LENGTH = 6

// Store for password reset tokens
const resetTokenStore = new Map()

// Reset token expiry time (30 minutes)
const RESET_TOKEN_EXPIRY = 30 * 60 * 1000

// Nodemailer Config
let transporter
try {
  transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  })
} catch (error) {
  console.error("Email configuration error:", error)
}

// Helper function to validate email format
const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

// Helper function to generate and store OTP
const generateAndStoreOTP = (email, userData = null) => {
  // Generate OTP
  const otp = otpGenerator.generate(OTP_LENGTH, {
    digits: true,
    alphabets: false,
    specialChars: false,
    upperCaseAlphabets: false,
    lowerCaseAlphabets: false,
  })

  // Store OTP with expiration time
  const expiryTime = Date.now() + OTP_EXPIRY_TIME

  // Store OTP with user data if provided (for registration)
  if (userData) {
    otpStore.set(email, {
      otp,
      expiryTime,
      ...userData,
    })
  } else {
    // For resend, preserve existing user data if available
    const existingData = otpStore.get(email)
    otpStore.set(email, {
      otp,
      expiryTime,
      ...(existingData && existingData.firstName
        ? {
            firstName: existingData.firstName,
            lastName: existingData.lastName,
            username: existingData.username,
            password: existingData.password,
            avatar: existingData.avatar,
          }
        : {}),
    })
  }

  return otp
}

// Helper function to generate a secure random token
const generateResetToken = () => {
  return crypto.randomBytes(32).toString("hex")
}

// Helper function to send OTP email
const sendOTPEmail = async (email, otp) => {
  if (!transporter) {
    throw new Error("Email service not configured")
  }

  try {
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Verify Your Account - OTP",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 5px;">
          <h2 style="color: #0d9488; text-align: center;">Verify Your Account</h2>
          <p style="margin-bottom: 20px;">Thank you for registering with CareerOnDoor. Please use the following verification code to complete your registration:</p>
          <div style="background-color: #f0f9ff; padding: 15px; border-radius: 5px; text-align: center; font-size: 24px; letter-spacing: 5px; font-weight: bold; color: #0d9488; margin-bottom: 20px;">
            ${otp}
          </div>
          <p style="margin-bottom: 5px;">This code will expire in 10 minutes.</p>
          <p style="color: #666; font-size: 12px; margin-top: 30px; text-align: center;">If you didn't request this code, please ignore this email.</p>
        </div>
      `,
    })
    return true
  } catch (error) {
    console.error("Error sending email:", error)
    throw new Error("Failed to send verification email")
  }
}

// Helper function to send password reset email
const sendResetEmail = async (email, token) => {
  if (!transporter) {
    throw new Error("Email service not configured")
  }

  const resetUrl = `${process.env.FRONTEND_URL || "http://localhost:3000"}/reset-password?token=${token}&email=${encodeURIComponent(email)}`

  try {
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Reset Your Password - CareerOnDoor",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 5px;">
          <h2 style="color: #0d9488; text-align: center;">Reset Your Password</h2>
          <p style="margin-bottom: 20px;">You requested a password reset for your CareerOnDoor account. Click the button below to set a new password:</p>
          <div style="text-align: center; margin-bottom: 20px;">
            <a href="${resetUrl}" style="background: linear-gradient(to right, #0d9488, #0369a1); color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">Reset Password</a>
          </div>
          <p style="margin-bottom: 5px;">This link will expire in 30 minutes.</p>
          <p style="margin-bottom: 20px;">If you didn't request this password reset, you can safely ignore this email.</p>
          <p style="color: #666; font-size: 12px; margin-top: 30px; text-align: center;">CareerOnDoor - Find your dream job</p>
        </div>
      `,
    })
    return true
  } catch (error) {
    console.error("Error sending reset email:", error)
    throw new Error("Failed to send password reset email")
  }
}

// Register User & Send OTP
exports.register = async (req, res) => {
  try {
    const { firstName, lastName, username, email, password, avatar } = req.body

    // Validate required fields
    if (!firstName || !lastName || !username || !email || !password || !avatar) {
      return res.status(400).json({ message: "All fields are required" })
    }

    // Validate email format
    if (!isValidEmail(email)) {
      return res.status(400).json({ message: "Invalid email format" })
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email })
    if (existingUser) {
      return res.status(400).json({ message: "User already exists" })
    }

    // Check if username is taken
    const existingUsername = await User.findOne({ username })
    if (existingUsername) {
      return res.status(400).json({ message: "Username already taken, try another one" })
    }

    // Password strength validation
    if (password.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters long" })
    }

    // Generate OTP and store user data
    const otp = generateAndStoreOTP(email, { firstName, lastName, username, password, avatar })

    // Send OTP email
    await sendOTPEmail(email, otp)

    res.status(200).json({ message: "OTP sent to email, verify to complete registration" })
  } catch (error) {
    console.error("Registration error:", error)
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

// Verify OTP & Create User
exports.verifyOTP = async (req, res) => {
  try {
    const { email, otp } = req.body

    // Validate required fields
    if (!email || !otp) {
      return res.status(400).json({ message: "Email and OTP are required" })
    }

    // Check if OTP exists for this email
    const storedData = otpStore.get(email)
    if (!storedData) {
      return res.status(400).json({ message: "OTP expired or not found. Please request a new one." })
    }

    // Check if OTP is correct
    if (storedData.otp !== otp) {
      return res.status(400).json({ message: "Invalid OTP. Please try again." })
    }

    // Check if OTP is expired
    if (Date.now() > storedData.expiryTime) {
      otpStore.delete(email)
      return res.status(400).json({ message: "OTP expired. Please request a new one." })
    }

    // Check if we have all required user data
    if (!storedData.firstName || !storedData.lastName || !storedData.username || !storedData.password) {
      return res.status(400).json({ message: "Registration data missing. Please sign up again." })
    }

    // Hash password and create user
    const hashedPassword = await bcrypt.hash(storedData.password, 10)
    const newUser = await User.create({
      firstName: storedData.firstName,
      lastName: storedData.lastName,
      username: storedData.username,
      email,
      avatar: storedData.avatar,
      password: hashedPassword,
    })

    // Remove OTP after successful verification
    otpStore.delete(email)

    // Generate JWT token
    const token = jwt.sign({ id: newUser._id }, process.env.JWT_SECRET, {
      expiresIn: "2h",
    })

    // Set HTTP-only cookie
    res.cookie("auth_token", token, {
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
      maxAge: 2 * 60 * 60 * 1000, // 1 hour
    })

    // Return user data
    res.status(201).json({
      message: "User registered successfully",
      user: {
        id: newUser._id,
        firstName: newUser.firstName,
        lastName: newUser.lastName,
        username: newUser.username,
        email: newUser.email,
        avatar: newUser.avatar,
        admin: newUser.admin,
      },
    })
  } catch (error) {
    console.error("OTP verification error:", error)
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

// Resend OTP
exports.resendOTP = async (req, res) => {
  try {
    const { email } = req.body

    // Validate email
    if (!email) {
      return res.status(400).json({ message: "Email is required" })
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ message: "Invalid email format" })
    }

    // Check if user exists in database (for existing users)
    const existingUser = await User.findOne({ email })

    // Check if we have stored data for this email (for new registrations)
    const storedData = otpStore.get(email)

    // If neither exists, user hasn't started registration
    if (!existingUser && !storedData) {
      return res.status(404).json({ message: "No registration found for this email" })
    }

    // If user already exists in database but not in OTP store, they're already verified
    if (existingUser && !storedData) {
      return res.status(400).json({ message: "Account already verified. Please login." })
    }

    // Generate new OTP (this will preserve existing user data)
    const otp = generateAndStoreOTP(email)

    // Send OTP email
    await sendOTPEmail(email, otp)

    res.status(200).json({ message: "New OTP sent to your email" })
  } catch (error) {
    console.error("Resend OTP error:", error)
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

// Forgot Password - Send reset link
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body

    // Validate email
    if (!email) {
      return res.status(400).json({ message: "Email is required" })
    }

    // Check if user exists
    const user = await User.findOne({ email })
    if (!user) {
      // For security reasons, don't reveal that the user doesn't exist
      return res.status(200).json({ message: "If your email is registered, you will receive a password reset link" })
    }

    // Generate reset token
    const resetToken = generateResetToken()

    // Store token with expiry time
    resetTokenStore.set(email, {
      token: resetToken,
      expiryTime: Date.now() + RESET_TOKEN_EXPIRY,
    })

    // Send reset email
    await sendResetEmail(email, resetToken)

    // Return success message
    res.status(200).json({ message: "Password reset link sent to your email" })
  } catch (error) {
    console.error("Forgot password error:", error)
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

// Validate Reset Token
exports.validateResetToken = async (req, res) => {
  try {
    const { email, token } = req.body

    // Validate required fields
    if (!email || !token) {
      return res.status(400).json({ message: "Email and token are required" })
    }

    // Check if token exists and is valid
    const storedData = resetTokenStore.get(email)
    if (!storedData || storedData.token !== token) {
      return res.status(400).json({ message: "Invalid or expired reset token" })
    }

    // Check if token is expired
    if (Date.now() > storedData.expiryTime) {
      resetTokenStore.delete(email)
      return res.status(400).json({ message: "Reset token has expired" })
    }

    // Token is valid
    res.status(200).json({ message: "Token is valid" })
  } catch (error) {
    console.error("Validate reset token error:", error)
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

// Reset Password
exports.resetPassword = async (req, res) => {
  try {
    const { email, token, password } = req.body

    // Validate required fields
    if (!email || !token || !password) {
      return res.status(400).json({ message: "Email, token, and password are required" })
    }

    // Check if token exists and is valid
    const storedData = resetTokenStore.get(email)
    if (!storedData || storedData.token !== token) {
      return res.status(400).json({ message: "Invalid or expired reset token" })
    }

    // Check if token is expired
    if (Date.now() > storedData.expiryTime) {
      resetTokenStore.delete(email)
      return res.status(400).json({ message: "Reset token has expired" })
    }

    // Find user
    const user = await User.findOne({ email })
    if (!user) {
      return res.status(404).json({ message: "User not found" })
    }

    // Validate password
    if (password.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters long" })
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(password, 10)

    // Update user's password
    user.password = hashedPassword
    await user.save()

    // Remove token after successful reset
    resetTokenStore.delete(email)

    // Return success message
    res.status(200).json({ message: "Password reset successful" })
  } catch (error) {
    console.error("Reset password error:", error)
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

// Login User
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body

    // Validate required fields
    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" })
    }

    // Find user
    const user = await User.findOne({ email })
    if (!user) {
      return res.status(404).json({ message: "User not found" })
    }

    // Verify password
    const isMatch = await bcrypt.compare(password, user.password)
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid credentials" })
    }

    // Generate JWT token
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: "1h",
    })

    // Set HTTP-only cookie
    res.cookie("auth_token", token, {
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
      maxAge: 2 * 60 * 60 * 1000, // 2 hour
    })

    // Return user data
    res.status(200).json({
      message: "Login successful",
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        username: user.username,
        email: user.email,
        avatar: user.avatar,
        admin: user.admin,
      },
    })
  } catch (error) {
    console.error("Login error:", error)
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

// Logout User
exports.logout = (req, res) => {
  try {
    // Clear auth cookie
    res.clearCookie("auth_token")
    res.status(200).json({ message: "Logged out successfully" })
  } catch (error) {
    console.error("Logout error:", error)
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

// Cleanup expired OTPs periodically
setInterval(
  () => {
    const now = Date.now()
    for (const [email, data] of otpStore.entries()) {
      if (data.expiryTime && now > data.expiryTime) {
        otpStore.delete(email)
      }
    }
  },
  15 * 60 * 1000,
) // Run every 15 minutes

// Cleanup expired reset tokens periodically
setInterval(
  () => {
    const now = Date.now()
    for (const [email, data] of resetTokenStore.entries()) {
      if (data.expiryTime && now > data.expiryTime) {
        resetTokenStore.delete(email)
      }
    }
  },
  15 * 60 * 1000,
) // Run every 15 minutes

