const mongoose = require("mongoose");

const JobSchema = new mongoose.Schema(
  {
    role: { type: String, required: true, trim: true },
    min_experience: { type: Number, min: 0, default: 0 }, // Default to 0 for entry-level jobs
    max_experience: { 
      type: Number, 
      min: 0, 
      validate: {
        validator: function (value) {
          return value === undefined || value >= this.min_experience;
        },
        message: "max_experience must be greater than or equal to min_experience",
      },
    },
    country: { type: String, required: true, trim: true },
    cities: { 
      type: [{ type: String, trim: true }], 
      default: [] 
    },
    remote: { type: Boolean, default: false }, // New field for remote jobs
    skills_required: { type: [String], default: [] }, // Optional for entry-level jobs
    companyId: { 
      type: mongoose.Types.ObjectId, 
      ref: "Company", 
      required: true, 
      index: true 
    },
    min_salary: { type: Number, min: 0 }, // Salary stored as numbers
    max_salary: { type: Number, min: 0 },
    currency: { type: String, trim: true, default: "INR" }, // Default currency
    applylink: { type: String, required: true, trim: true },
    last_date: { type: Date, required: true },
    description: { type: String, required: true, trim: true, maxlength: 250 }, // Extended max length
    verified: { type: Boolean, default: false }, // New field for job verification
  },
  { timestamps: true }
);

// TTL index for automatic job deletion after the last date
JobSchema.index({ last_date: 1 }, { expireAfterSeconds: 0 });

const Job = mongoose.model("Job", JobSchema);
module.exports = Job;

