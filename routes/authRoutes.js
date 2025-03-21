const express = require("express")
const router = express.Router()
const authController = require("../controllers/authController")

// Auth routes
router.post("/register", authController.register)
router.post("/verify-otp", authController.verifyOTP)
router.post("/resend-otp", authController.resendOTP) // New route for resending OTP
router.post("/login", authController.login)
router.post("/logout", authController.logout)
router.post("/forgot-password", authController.forgotPassword)
router.post("/validate-reset-token", authController.validateResetToken)
router.post("/reset-password", authController.resetPassword)

module.exports = router


