const User = require("../models/User");

// Get all users
exports.getUsers = async (req, res) => {
  try {
    const users = await User.find().populate("reviewIds").lean();
    res.status(200).json(users);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Create a user
exports.createUser = async (req, res) => {
  try {
    const { firstName, lastName, username, email, avatar } = req.body;

    // Validate input fields
    if (!firstName || !lastName || !username || !email) {
      return res.status(400).json({ message: "All required fields must be provided." });
    }

    // Trim inputs
    const trimmedFirstName = firstName.trim();
    const trimmedLastName = lastName.trim();
    const trimmedUsername = username.trim();
    const trimmedEmail = email.trim().toLowerCase();

    // Check if email or username already exists
    const existingUser = await User.findOne({ 
      $or: [{ email: trimmedEmail }, { username: trimmedUsername }] 
    });

    if (existingUser) {
      return res.status(400).json({ message: "Email or username already exists" });
    }

    // Create new user
    const user = new User({ 
      firstName: trimmedFirstName, 
      lastName: trimmedLastName, 
      username: trimmedUsername, 
      email: trimmedEmail, 
      avatar, 
      reviewIds: []
    });

    await user.save();
    res.status(201).json({ message: "User created successfully", user });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

