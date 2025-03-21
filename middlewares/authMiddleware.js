const jwt = require("jsonwebtoken");
const dotenv = require("dotenv");
dotenv.config();

exports.protect = (req, res, next) => {
  try {
    
    const token = req.cookies.auth_token; // ✅ Token cookie से extract कर रहे हैं

    if (!token) {
      return res.status(401).json({ success: false, message: "Unauthorized: Try logging in again." });

    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // ✅ `req.user` में decoded user info डाल रहे हैं

    next();
  } catch (error) {
    return res.status(401).json({ 
      success: false, 
      message: "Unauthorized: Invalid or expired token", 
      error: error.message 
    });
  }
};
