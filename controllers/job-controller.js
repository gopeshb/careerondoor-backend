const Job = require("../models/Job")
const mongoose = require("mongoose")
const redis = require("../config/redis") // Redis client
const { ObjectId } = mongoose.Types
// Helper function to get seconds until midnight UTC for daily expiry
const getMidnightUTC = () => {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setUTCHours(0, 0, 0, 0);
  midnight.setUTCDate(now.getUTCDate() + 1);
  return Math.floor((midnight - now) / 1000);
};

exports.getJobs = async (req, res) => {
  try {
    const page = Number.parseInt(req.query.page) || 1;
    const limit = Number.parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const generateCacheKey = () => {
      const params = {
        page,
        limit,
        keyword: req.query.keyword || '',
        experience: req.query.experience || '',
        country: req.query.country || '',
        city: req.query.city || '',
        remote: req.query.remote || '',
      };
      return `jobs:v2:${JSON.stringify(params)}`;
    };

    const cacheKey = generateCacheKey();

    try {
      const cachedData = await redis.get(cacheKey);
      if (cachedData) {
        console.log(`Cache hit for key: ${cacheKey}`);
        await redis.incr('cache:jobs:hits');
        return res.json(JSON.parse(cachedData));
      }
      console.log(`Cache miss for key: ${cacheKey}`);
      await redis.incr('cache:jobs:misses');
    } catch (redisErr) {
      console.error('Redis cache read error:', redisErr);
    }

    const query = { verified: true };

    if (req.query.keyword) {
      const keyword = req.query.keyword.trim();
      query.$or = [
        { role: { $regex: keyword, $options: 'i' } },
        { skills_required: { $elemMatch: { $regex: keyword, $options: 'i' } } },
        { description: { $regex: keyword, $options: 'i' } },
      ];
    }

    if (req.query.experience) {
      if (req.query.experience === 'fresher') {
        query.min_experience = 0;
      } else if (req.query.experience === '0-2') {
        query.min_experience = { $gte: 0 };
        query.max_experience = { $lte: 2 };
      } else if (req.query.experience === '2-5') {
        query.min_experience = { $gte: 2 };
        query.max_experience = { $lte: 5 };
      } else if (req.query.experience === '5+') {
        query.min_experience = { $gte: 5 };
      }
    }

    if (req.query.country) {
      query.country = { $regex: `^${req.query.country.trim()}$`, $options: 'i' };
    }

    if (req.query.city) {
      query.cities = { $regex: `^${req.query.city.trim()}$`, $options: 'i' };
    }

    if (req.query.remote === 'true') {
      query.remote = true;
    }

    const aggregationPipeline = [
      {
        $lookup: {
          from: 'companies',
          localField: 'companyId',
          foreignField: '_id',
          as: 'companyDetails',
        },
      },
      { $unwind: '$companyDetails' },
      { $match: query },
    ];

    if (req.query.keyword) {
      aggregationPipeline[2].$match.$or = aggregationPipeline[2].$match.$or || [];
      aggregationPipeline[2].$match.$or.push({
        'companyDetails.name': { $regex: req.query.keyword.trim(), $options: 'i' },
      });
    }

    const countPipeline = [...aggregationPipeline, { $count: 'total' }];

    aggregationPipeline.push(
      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: limit },
      {
        $project: {
          _id: 1,
          role: 1,
          min_experience: 1,
          max_experience: 1,
          country: 1,
          cities: 1,
          remote: 1,
          skills_required: 1,
          min_salary: 1,
          max_salary: 1,
          currency: 1,
          applylink: 1,
          last_date: 1,
          description: 1,
          verified: 1,
          createdAt: 1,
          updatedAt: 1,
          company: {
            _id: '$companyDetails._id',
            name: '$companyDetails.name',
            workEnv: '$companyDetails.workEnv',
            jobSec: '$companyDetails.jobSec',
            salary: '$companyDetails.salary',
            avgRating: '$companyDetails.avgRating',
            TotalReviews: '$companyDetails.TotalReviews',
          },
        },
      }
    );

    const [jobs, countResult] = await Promise.all([
      Job.aggregate(aggregationPipeline).exec(),
      Job.aggregate(countPipeline).exec(),
    ]);

    const totalJobs = countResult.length > 0 ? countResult[0].total : 0;

    const response = {
      jobs,
      totalJobs,
      currentPage: page,
      totalPages: Math.ceil(totalJobs / limit),
      cachedAt: new Date().toISOString(),
    };

    try {
      const hasFilters = req.query.keyword || req.query.experience || req.query.country || req.query.city || req.query.remote;
      if (page <= 3 || !hasFilters) {
        const secondsUntilMidnight = getMidnightUTC();
        if (redis.isOpen) {
          await redis.setEx(cacheKey, secondsUntilMidnight, JSON.stringify(response));
          await redis.sAdd('jobs:cache:keys', cacheKey);
          await redis.incr('cache:jobs:hits');
          console.log(`Cached response for key: ${cacheKey}, expires in ${secondsUntilMidnight}s`);
        } else {
          console.warn('Redis not connected, skipping cache write');
        }
      }
    } catch (redisErr) {
      console.error('Redis cache write error:', redisErr);
    }

    res.json(response);
  } catch (err) {
    console.error('Error fetching jobs:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

// Controller to get all available locations for dropdown
exports.getLocations = async (req, res) => {
  try {
    // Get distinct countries
    const countries = await Job.distinct("country", { verified: true });
    
    // Get distinct cities across all jobs
    const cities = await Job.distinct("cities", { verified: true });
    
    // Filter out any null or empty values
    const filteredCities = cities.flat().filter(city => city && city.trim() !== '');
    
    res.json({
      countries: countries.sort(),
      cities: [...new Set(filteredCities)].sort() // Remove duplicates and sort
    });
  } catch (err) {
    console.error("Error fetching locations:", err);
    res.status(500).json({ message: "Server error" });
  }
};
// Create a new job

exports.getJobById = async (req, res) => {
  try {
    const jobId = req.params.id

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(jobId)) {
      return res.status(400).json({ message: "Invalid job ID format" })
    }

    // Use aggregation to get job with company details
    const job = await Job.aggregate([
      { $match: { _id: new ObjectId(jobId) } },
      {
        $lookup: {
          from: "companies",
          localField: "companyId",
          foreignField: "_id",
          as: "companyDetails",
        },
      },
      { $unwind: "$companyDetails" },
      {
        $project: {
          _id: 1,
          role: 1,
          min_experience: 1,
          max_experience: 1,
          country: 1,
          cities: 1,
          remote: 1,
          skills_required: 1,
          min_salary: 1,
          max_salary: 1,
          currency: 1,
          applylink: 1,
          last_date: 1,
          description: 1,
          verified: 1,
          createdAt: 1,
          updatedAt: 1,
          company: {
            _id: "$companyDetails._id",
            name: "$companyDetails.name",
            workEnv: "$companyDetails.workEnv",
            jobSec: "$companyDetails.jobSec",
            salary: "$companyDetails.salary",
            avgRating: "$companyDetails.avgRating",
            TotalReviews: "$companyDetails.TotalReviews",
          },
        },
      },
    ])

    if (!job || job.length === 0) {
      return res.status(404).json({ message: "Job not found" })
    }

    // Increment view count or track analytics here if needed

    res.json(job[0])
  } catch (err) {
    console.error("Error fetching job details:", err)
    res.status(500).json({ message: "Server error" })
  }
}

// Get all available locations for dropdown
exports.getLocations = async (req, res) => {
  try {
    // Get distinct countries
    const countries = await Job.distinct("country", { verified: true })

    // Get distinct cities across all jobs
    const cities = await Job.distinct("cities", { verified: true })

    // Filter out any null or empty values
    const filteredCities = cities.flat().filter((city) => city && city.trim() !== "")

    res.json({
      countries: countries.sort(),
      cities: [...new Set(filteredCities)].sort(), // Remove duplicates and sort
    })
  } catch (err) {
    console.error("Error fetching locations:", err)
    res.status(500).json({ message: "Server error" })
  }
}

// Create a new job
exports.createJob = async (req, res) => {
  try {
    const {
      role,
      min_experience,
      max_experience,
      country,
      cities,
      remote,
      skills_required,
      companyId,
      min_salary,
      max_salary,
      currency,
      applylink,
      last_date,
      description,
    } = req.body;

    // Validate required fields based on schema
    const requiredFields = {
      role: "Job role is required",
      country: "Country is required",
      companyId: "Company ID is required",
      applylink: "Application link is required",
      last_date: "Application deadline is required",
      description: "Job description is required",
    };

    const missingFields = Object.keys(requiredFields).filter(
      (field) => req.body[field] === undefined || req.body[field] === null
    );

    if (missingFields.length > 0) {
      return res.status(400).json({
        message: "Required fields are missing",
        errors: missingFields.map((field) => ({
          field,
          message: requiredFields[field],
        })),
      });
    }

    // Validate company ID format
    if (!mongoose.Types.ObjectId.isValid(companyId)) {
      return res.status(400).json({
        message: "Invalid company ID format",
        errors: [{ field: "companyId", message: "Must be a valid MongoDB ObjectId" }],
      });
    }

    // Validate description length (schema max: 250)
    if (description.length > 250) {
      return res.status(400).json({
        message: "Description too long",
        errors: [
          {
            field: "description",
            message: "Job description must not exceed 250 characters",
          },
        ],
      });
    }

    // Validate experience range
    if (
      min_experience !== undefined &&
      (min_experience < 0 || (max_experience !== undefined && max_experience < min_experience))
    ) {
      return res.status(400).json({
        message: "Invalid experience range",
        errors: [
          {
            field: "experience",
            message:
              "Minimum experience must be non-negative and less than or equal to maximum experience",
          },
        ],
      });
    }

    // Validate salary range
    if (
      min_salary !== undefined &&
      (min_salary < 0 || (max_salary !== undefined && max_salary < min_salary))
    ) {
      return res.status(400).json({
        message: "Invalid salary range",
        errors: [
          {
            field: "salary",
            message: "Minimum salary must be non-negative and less than or equal to maximum salary",
          },
        ],
      });
    }

    // Validate URL format for applylink
    const urlRegex =  /^https:\/\/[^\s/$.?#].[^\s]*$/;
    if (!urlRegex.test(applylink)) {
      return res.status(400).json({
        message: "Invalid application link",
        errors: [
          {
            field: "applylink",
            message: "Must be a valid URL",
          },
        ],
      });
    }

    // Validate last_date
    const deadline = new Date(last_date);
    if (isNaN(deadline.getTime())) {
      return res.status(400).json({
        message: "Invalid deadline format",
        errors: [
          {
            field: "last_date",
            message: "Deadline must be a valid date",
          },
        ],
      });
    }

    if (deadline < new Date()) {
      return res.status(400).json({
        message: "Invalid deadline",
        errors: [
          {
            field: "last_date",
            message: "Deadline must be a future date",
          },
        ],
      });
    }

    // Validate arrays
    const validatedCities = Array.isArray(cities) ? cities : cities ? [cities] : [];
    if (validatedCities.some((city) => typeof city !== "string" || !city.trim())) {
      return res.status(400).json({
        message: "Invalid cities format",
        errors: [
          {
            field: "cities",
            message: "Cities must be an array of non-empty strings",
          },
        ],
      });
    }

    const validatedSkills = Array.isArray(skills_required) ? skills_required : skills_required ? [skills_required] : [];
    if (validatedSkills.some((skill) => typeof skill !== "string" || !skill.trim())) {
      return res.status(400).json({
        message: "Invalid skills format",
        errors: [
          {
            field: "skills_required",
            message: "Skills must be an array of non-empty strings",
          },
        ],
      });
    }

    // Validate currency (optional, defaults to INR)
    const validCurrencies = ["INR", "USD", "EUR", "GBP", "AUD"]; // Example list
    if (currency && !validCurrencies.includes(currency)) {
      return res.status(400).json({
        message: "Invalid currency",
        errors: [
          {
            field: "currency",
            message: `Currency must be one of: ${validCurrencies.join(", ")}`,
          },
        ],
      });
    }

      // ✅ Add userId from req.user
      const userId = req.user.id;

    // Create new job
    const newJob = new Job({
      role: role.trim(),
      min_experience: min_experience || 0,
      max_experience,
      country: country.trim(),
      cities: validatedCities.map((city) => city.trim()),
      remote: Boolean(remote),
      skills_required: validatedSkills.map((skill) => skill.trim()),
      companyId,
      min_salary,
      max_salary,
      currency: currency || "INR",
      applylink: applylink.trim(),
      last_date: deadline,
      description: description.trim(),
      verified: false,
      userId, // ✅ This line adds the user ID from JWT
    });

    const savedJob = await newJob.save();

    res.status(201).json({
      message: "Job created successfully",
      job: savedJob,
    });
  } catch (err) {
    console.error("Error creating job:", err);

    // Handle Mongoose validation errors
    if (err.name === "ValidationError") {
      return res.status(400).json({
        message: "Validation failed",
        errors: Object.values(err.errors).map((e) => ({
          field: e.path,
          message: e.message,
        })),
      });
    }

    // Handle MongoDB duplicate key errors
    if (err.name === "MongoServerError" && err.code === 11000) {
      const field = Object.keys(err.keyValue)[0];
      return res.status(400).json({
        message: "Duplicate job entry",
        errors: [
          {
            field,
            message: `A job with this ${field} already exists`,
          },
        ],
      });
    }

    // Handle connection or timeout errors
    if (err.name === "MongooseError" || err.name === "MongoNetworkError") {
      return res.status(503).json({
        message: "Database connection error",
        errors: [
          {
            message: "Unable to connect to the database. Please try again later.",
          },
        ],
      });
    }

    // Generic error handling
    res.status(500).json({
      message: "An unexpected error occurred while creating the job",
      errors: [{ message: err.message }],
    });
  }
};

// Update job by ID (for admin or job owner)
exports.updateJob = async (req, res) => {
  try {
    const jobId = req.params.id

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(jobId)) {
      return res.status(400).json({ message: "Invalid job ID format" })
    }

    const job = await Job.findById(jobId)

    if (!job) {
      return res.status(404).json({ message: "Job not found" })
    }

    // Check if user has permission to update this job
    // This depends on your auth system - implement as needed

    // Update job fields
    const updateData = { ...req.body }

    // Handle arrays properly
    if (updateData.cities && !Array.isArray(updateData.cities)) {
      updateData.cities = updateData.cities ? [updateData.cities] : []
    }

    if (updateData.skills_required && !Array.isArray(updateData.skills_required)) {
      updateData.skills_required = updateData.skills_required ? [updateData.skills_required] : []
    }

    // Update the job
    const updatedJob = await Job.findByIdAndUpdate(jobId, { $set: updateData }, { new: true, runValidators: true })

    res.json({
      message: "Job updated successfully",
      job: updatedJob,
    })
  } catch (err) {
    console.error("Error updating job:", err)

    if (err.name === "ValidationError") {
      return res.status(400).json({
        message: "Validation error",
        errors: Object.values(err.errors).map((e) => e.message),
      })
    }

    res.status(500).json({ message: "Server error" })
  }
}


exports.getJobsForVerification = async (req, res) => {
  try {
    const unverifiedJobs = await Job.aggregate([
      // Match only unverified jobs
      { $match: { verified: false } },

      // Lookup to get company details
      {
        $lookup: {
          from: "companies",
          localField: "companyId",
          foreignField: "_id",
          as: "companyDetails",
        },
      },
      { $unwind: "$companyDetails" },

      // Lookup to get user details
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          as: "userDetails",
        },
      },
      { $unwind: "$userDetails" },

      // Project fields with company and user info
      {
        $project: {
          _id: 1,
          role: 1,
          min_experience: 1,
          max_experience: 1,
          country: 1,
          cities: 1,
          remote: 1,
          skills_required: 1,
          min_salary: 1,
          max_salary: 1,
          currency: 1,
          applylink: 1,
          last_date: 1,
          description: 1,
          verified: 1,
          createdAt: 1,
          updatedAt: 1,
          company: {
            _id: "$companyDetails._id",
            name: "$companyDetails.name",
          },
          user: {
            _id: "$userDetails._id",
            firstName: "$userDetails.firstName",
            lastName: "$userDetails.lastName",
            email: "$userDetails.email",
            username: "$userDetails.username",
          },
        },
      },

      // Sort by creation date (newest first)
      { $sort: { createdAt: -1 } },
    ]);

    res.json({
      count: unverifiedJobs.length,
      jobs: unverifiedJobs,
    });
  } catch (err) {
    console.error("Error fetching jobs for verification:", err);
    res.status(500).json({ message: "Server error" });
  }
};


// Delete job by ID (admin only)
exports.deleteJob = async (req, res) => {
  try {
    const jobId = req.params.id

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(jobId)) {
      return res.status(400).json({ message: "Invalid job ID format" })
    }

    const job = await Job.findById(jobId)

    if (!job) {
      return res.status(404).json({ message: "Job not found" })
    }

    // Delete the job
    await Job.findByIdAndDelete(jobId)

    res.json({
      message: "Job deleted successfully",
      jobId,
    })
  } catch (err) {
    console.error("Error deleting job:", err)
    res.status(500).json({ message: "Server error" })
  }
}

exports.verifyJob = async (req, res) => {
  try {
    const jobId = req.params.id;

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(jobId)) {
      return res.status(400).json({ message: 'Invalid job ID format' });
    }

    const job = await Job.findById(jobId);

    if (!job) {
      return res.status(404).json({ message: 'Job not found' });
    }


    job.verified = true;
    await job.save();

    // Invalidate relevant cache entries
    try {
      if (redis.isOpen) {
        const cacheKeys = await redis.sMembers('jobs:cache:keys');
        if (cacheKeys.length > 0) {
          await redis.del([...cacheKeys, 'jobs:cache:keys']);
          console.log(`Invalidated ${cacheKeys.length} cache entries`);
        }
      } else {
        console.warn('Redis not connected, skipping cache invalidation');
      }
    } catch (redisErr) {
      console.error('Redis cache invalidation error:', redisErr);
    }

    res.json({
      message: 'Job verified successfully',
      job,
    });
  } catch (err) {
    console.error('Error verifying job:', err);
    res.status(500).json({ message: 'Server error' });
  }
};