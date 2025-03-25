const mongoose = require("mongoose");

const InternshipSchema = new mongoose.Schema(
  {
    role: { type: String, required: true, trim: true },
    location: { type: String, required: true, trim: true },
    skills_required: { type: [String], required: true, default: [] },
    companyId: { 
      type: mongoose.Types.ObjectId, 
      ref: "Company", 
      required: true, 
      index: true // Optimized indexing
    },
    stipend: { type: String, required: true, trim: true }, 
    duration: { type: Number, required: true, min: 1 }, // duration in months
    applylink: { type: String, required: true, trim: true },
    last_date: { type: Date, required: true },
    description: { type: String, required: true, trim: true, maxlength: 100 }, 
  },
  { timestamps: true }
);

// TTL index for automatic internship deletion after the last date
InternshipSchema.index({ last_date: 1 }, { expireAfterSeconds: 0 });

const Internship = mongoose.model("Internship", InternshipSchema);
module.exports = Internship;
