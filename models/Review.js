const mongoose = require("mongoose");

const ReviewSchema = new mongoose.Schema(
  {
    companyId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "Company", 
      required: true, 
      index: true // Index for faster queries
    },
    userId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "User", 
      required: true, 
    },
    workEnv: { type: Number, required: true, min: 1, max: 5 },
    jobSec: { type: Number, required: true, min: 1, max: 5 },
    salary: { type: Number, required: true, min: 1, max: 5 },
    rating: { type: Number, required: true, min: 1, max: 5 }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Review", ReviewSchema);

