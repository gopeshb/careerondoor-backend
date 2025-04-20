const mongoose = require('mongoose');

const InternshipSchema = new mongoose.Schema(
  {
    role: { type: String, required: true, trim: true },
    country: { type: String, required: true, trim: true },
    cities: { type: [{ type: String, trim: true }], default: [] },
    remote: { type: Boolean, default: false },
    skills_required: { type: [String], default: [] },
    companyId: {
      type: mongoose.Types.ObjectId,
      ref: 'Company',
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    min_stipend: { type: Number, min: 0 },
    max_stipend: {
      type: Number,
      min: 0,
      validate: {
        validator: function (value) {
          return value === undefined || !this.min_stipend || value >= this.min_stipend;
        },
        message: 'max_stipend must be greater than or equal to min_stipend',
      },
    },
    currency: { type: String, trim: true, default: 'INR' },
    duration: { type: Number, required: true, min: 1 },
    applylink: { type: String, required: true, trim: true },
    last_date: { type: Date, required: true },
    description: { type: String, required: true, trim: true, maxlength: 250 },
    verified: { type: Boolean, default: false },
  },
  { timestamps: true }
);

InternshipSchema.index({ last_date: 1 }, { expireAfterSeconds: 0 });

const Internship = mongoose.model('Internship', InternshipSchema);
module.exports = Internship;
