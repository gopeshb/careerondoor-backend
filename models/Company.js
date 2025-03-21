const mongoose = require("mongoose");

const CompanySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true, index: true },
    website: { type: String, trim: true },
    workEnv: { type: Number, default: 0, min: 0, max: 5 },
    jobSec: { type: Number, default: 0, min: 0, max: 5 },
    salary: { type: Number, default: 0, min: 0, max: 5 },
    avgRating: { type: Number, default: 0, min: 0, max: 5 },
    TotalReviews: { 
      type: Number, 
      default: 0, 
      validate: {
        validator: (value) => Number.isInteger(value) && value >= 0,
        message: "TotalReviews must be a non-negative whole number."
      }
    },
    verified: { type: Boolean, default: false },
    reviews: { 
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: "Review" }], 
      default: [] 
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Company", CompanySchema);
