const mongoose = require("mongoose");

const JobSchema = new mongoose.Schema(
  {
    role: { type: String, required: true, trim: true },
    experience: { type: Number, required: true, min: 0 },
    location: { type: String, required: true, trim: true },
    skills_required: { type: [String], required: true, default: [] },
    companyId: { 
      type: mongoose.Types.ObjectId, 
      ref: "Company", 
      required: true, 
      index: true // Optimized indexing
    },
    expected_salary: { type: String, required: true, trim: true }, // Changed to String
    applylink: { type: String, required: true, trim: true },
    last_date: { type: Date, required: true },
    description: { type: String, required: true, trim: true, maxlength: 100 }, // Max 100 characters
  },
  { timestamps: true }
);

// TTL index for automatic job deletion after the last date
JobSchema.index({ last_date: 1 }, { expireAfterSeconds: 0 });

const Job = mongoose.model("Job", JobSchema);
module.exports = Job;

