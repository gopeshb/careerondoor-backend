const Internship = require("../models/Internship")
const mongoose = require("mongoose")
const redis = require("../config/redis") // Redis client
const { ObjectId } = mongoose.Types;
// Get all internships with filtering, searching, and pagination


// Helper function to get seconds until midnight UTC for daily expiry
const getMidnightUTC = () => {
  const now = new Date();
  const midnight = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)
  );
  return Math.floor((midnight - now) / 1000); // Seconds until midnight
};

exports.getInternships = async (req, res) => {
  try {
    const page = Number.parseInt(req.query.page) || 1;
    const limit = Number.parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Generate dynamic cache key based on query parameters
    const generateCacheKey = () => {
      const params = {
        page,
        limit,
        keyword: req.query.keyword || '',
        duration: req.query.duration || '',
        country: req.query.country || '',
        city: req.query.city || '',
        remote: req.query.remote || '',
      };
      return `internships:v2:${JSON.stringify(params)}`;
    };

    const cacheKey = generateCacheKey();

    // Try to get cached data
    try {
      const cachedData = await redis.get(cacheKey);
      if (cachedData) {
        console.log(`Cache hit for key: ${cacheKey}`);
        await redis.incr('cache:internships:hits');
        return res.json(JSON.parse(cachedData));
      }
      console.log(`Cache miss for key: ${cacheKey}`);
      await redis.incr('cache:internships:misses');
    } catch (redisErr) {
      console.error('Redis cache read error:', redisErr);
    }

    // Base query
    const query = {};

    // Keyword search (role, skills, description)
    if (req.query.keyword) {
      const keyword = req.query.keyword.trim();
      query.$or = [
        { role: { $regex: keyword, $options: 'i' } },
        { skills_required: { $elemMatch: { $regex: keyword, $options: 'i' } } },
        { description: { $regex: keyword, $options: 'i' } },
      ];
    }

    // Duration filter
    if (req.query.duration) {
      const duration = Number.parseInt(req.query.duration);
      if (!isNaN(duration)) {
        query.duration = duration;
      }
    }

    // Location filter (case-insensitive)
    if (req.query.country) {
      query.country = { $regex: `^${req.query.country.trim()}$`, $options: 'i' };
    }

    if (req.query.city) {
      query.cities = { $regex: `^${req.query.city.trim()}$`, $options: 'i' };
    }

    // Remote filter
    if (req.query.remote === 'true') {
      query.remote = true;
    }

    // Aggregation pipeline
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

    // Add company name search if keyword is provided
    if (req.query.keyword) {
      aggregationPipeline[2].$match.$or = aggregationPipeline[2].$match.$or || [];
      aggregationPipeline[2].$match.$or.push({
        'companyDetails.name': { $regex: req.query.keyword.trim(), $options: 'i' },
      });
    }

    // Add sorting, counting, pagination
    const countPipeline = [...aggregationPipeline, { $count: 'total' }];

    aggregationPipeline.push(
      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: limit },
      {
        $project: {
          _id: 1,
          role: 1,
          country: 1,
          cities: 1,
          remote: 1,
          skills_required: 1,
          min_stipend: 1,
          max_stipend: 1,
          currency: 1,
          duration: 1,
          applylink: 1,
          description: 1,
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

    // Execute queries
    const [internships, countResult] = await Promise.all([
      Internship.aggregate(aggregationPipeline).exec(),
      Internship.aggregate(countPipeline).exec(),
    ]);

    const totalInternships = countResult.length > 0 ? countResult[0].total : 0;

    const response = {
      internships,
      totalInternships,
      currentPage: page,
      totalPages: Math.ceil(totalInternships / limit),
      cachedAt: new Date().toISOString(),
    };

    // Cache the response only for popular queries (page <= 3 or no filters)
    try {
      const hasFilters = req.query.keyword || req.query.duration || req.query.country || req.query.city || req.query.remote;
      if (page <= 3 || !hasFilters) {
        const secondsUntilMidnight = getMidnightUTC();
        if (redis.isOpen) {
          await redis.setEx(cacheKey, secondsUntilMidnight, JSON.stringify(response));
          await redis.sAdd('internships:cache:keys', cacheKey);
          await redis.incr('cache:internships:hits');
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
    console.error('Error fetching internships:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get internship by ID

exports.getInternshipById = async (req, res) => {
  try {
    const internshipId = req.params.id;

    // Validate ObjectId
    if (!ObjectId.isValid(internshipId)) {
      return res.status(400).json({ message: "Invalid internship ID format" });
    }

    // Aggregation to join company details
    const internship = await Internship.aggregate([
      { $match: { _id: new ObjectId(internshipId) } },
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
          country: 1,
          cities: 1,
          remote: 1,
          skills_required: 1,
          min_stipend: 1,
          max_stipend: 1,
          currency: 1,
          duration: 1,
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
    ]);

    if (!internship || internship.length === 0) {
      return res.status(404).json({ message: "Internship not found" });
    }

    res.json(internship[0]);
  } catch (err) {
    console.error("Error fetching internship:", err);
    res.status(500).json({ message: "Server error" });
  }
};


exports.getLocations = async (req, res) => {
  try {
    // Get distinct countries
    const countries = await Internship.distinct("country", { verified: true });
    
    // Get distinct cities across all internships
    const cities = await Internship.distinct("cities", { verified: true });
    
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

// Create a new internship
exports.createInternship = async (req, res) => {
  try {
    const {
      role,
      country,
      cities,
      remote,
      skills_required,
      companyId,
      min_stipend,
      max_stipend,
      currency,
      duration,
      applylink,
      last_date,
      description,
    } = req.body;

    const requiredFields = {
      role: "Job role is required",
      country: "Country is required",
      companyId: "Company ID is required",
      duration: "Duration is required",
      applylink: "Application link is required",
      last_date: "Application deadline is required",
      description: "Internship description is required",
    };

    const missingFields = Object.keys(requiredFields).filter(
      (field) => !req.body[field]
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

    if (!mongoose.Types.ObjectId.isValid(companyId)) {
      return res.status(400).json({
        message: "Invalid company ID format",
        errors: [{ field: "companyId", message: "Must be a valid MongoDB ObjectId" }],
      });
    }

    const durationValue = Number.parseInt(duration);
    if (isNaN(durationValue) || durationValue < 1) {
      return res.status(400).json({
        message: "Invalid duration",
        errors: [{ field: "duration", message: "Duration must be a positive number" }],
      });
    }

    const parsedDate = new Date(last_date);
    if (isNaN(parsedDate.getTime())) {
      return res.status(400).json({
        message: "Invalid deadline format",
        errors: [{ field: "last_date", message: "Deadline must be a valid date (YYYY-MM-DD)" }],
      });
    }
    if (parsedDate <= new Date()) {
      return res.status(400).json({
        message: "Invalid deadline",
        errors: [{ field: "last_date", message: "Deadline must be a future date" }],
      });
    }

    const urlRegex = /^https:\/\/[^\s/$.?#].[^\s]*$/;
    if (!urlRegex.test(applylink)) {
      return res.status(400).json({
        message: "Invalid application link",
        errors: [{ field: "applylink", message: "Must be a valid URL" }],
      });
    }

    if (min_stipend !== undefined && (isNaN(min_stipend) || min_stipend < 0)) {
      return res.status(400).json({
        message: "Invalid stipend range",
        errors: [{ field: "min_stipend", message: "Minimum stipend must be a non-negative number" }],
      });
    }

    if (max_stipend !== undefined) {
      if (isNaN(max_stipend) || max_stipend < 0) {
        return res.status(400).json({
          message: "Invalid stipend range",
          errors: [{ field: "max_stipend", message: "Maximum stipend must be a non-negative number" }],
        });
      }
      if (min_stipend !== undefined && max_stipend < min_stipend) {
        return res.status(400).json({
          message: "Invalid stipend range",
          errors: [{ field: "stipend", message: "Maximum stipend must be greater than or equal to minimum stipend" }],
        });
      }
    }

    let cleanedCities = [];
    if (cities) {
      if (!Array.isArray(cities)) {
        return res.status(400).json({
          message: "Invalid cities format",
          errors: [{ field: "cities", message: "Cities must be an array" }],
        });
      }
      cleanedCities = cities.map((city) => city.trim()).filter((city) => city);
      
    }

    let cleanedSkills = [];
    if (skills_required) {
      if (!Array.isArray(skills_required)) {
        return res.status(400).json({
          message: "Invalid skills format",
          errors: [{ field: "skills_required", message: "Skills required must be an array" }],
        });
      }
      cleanedSkills = skills_required.map((skill) => skill.trim()).filter((skill) => skill);
      if (cleanedSkills.length === 0) {
        return res.status(400).json({
          message: "Invalid skills format",
          errors: [{ field: "skills_required", message: "Skills required must contain at least one non-empty string" }],
        });
      }
    }

    const remoteValue = remote !== undefined ? Boolean(remote) : false;

    const validCurrencies = ["INR", "USD", "EUR", "GBP", "AUD"];
    const currencyValue = currency && currency.trim() ? currency.trim() : "INR";
    if (!validCurrencies.includes(currencyValue)) {
      return res.status(400).json({
        message: "Invalid currency",
        errors: [{ field: "currency", message: `Currency must be one of: ${validCurrencies.join(", ")}` }],
      });
    }

    // ✅ Add userId from req.user
    const userId = req.user.id;

    const newInternship = new Internship({
      role: role.trim(),
      country: country.trim(),
      cities: cleanedCities,
      remote: remoteValue,
      skills_required: cleanedSkills,
      companyId,
      min_stipend: min_stipend !== undefined ? min_stipend : undefined,
      max_stipend: max_stipend !== undefined ? max_stipend : undefined,
      currency: currencyValue,
      duration: durationValue,
      applylink: applylink.trim(),
      last_date: parsedDate,
      description: description.trim(),
      verified: false,
      userId, // ✅ This line adds the user ID from JWT
    });

    const savedInternship = await newInternship.save();

    res.status(201).json({
      message: "Internship created successfully",
      internship: savedInternship,
    });
  } catch (error) {
    console.error("Error creating internship:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};





// Delete internship
exports.deleteInternship = async (req, res) => {
  try {
    const internship = await Internship.findByIdAndDelete(req.params.id)

    if (!internship) {
      return res.status(404).json({ message: "Internship not found" })
    }

    res.json({ message: "Internship deleted successfully" })
  } catch (err) {
    console.error("Error deleting internship:", err)
    res.status(500).json({ message: "Server error" })
  }
}


exports.verifyInternship = async (req, res) => {
  try {
    const internshipId = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(internshipId)) {
      return res.status(400).json({ message: 'Invalid internship ID format' });
    }

    const internship = await Internship.findById(internshipId);

    if (!internship) {
      return res.status(404).json({ message: 'Internship not found' });
    }

    if (!req.user ) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    internship.verified = true;
    await internship.save();

    try {
      const cacheKeys = await redis.smembers('internships:cache:keys');
      if (cacheKeys.length > 0) {
        await redis.del([...cacheKeys, 'internships:cache:keys']);
        console.log(`Invalidated ${cacheKeys.length} cache entries`);
      }
    } catch (redisErr) {
      console.error('Redis cache invalidation error:', redisErr);
    }

    res.json({
      message: 'Internship verified successfully',
      internship,
    });
  } catch (err) {
    console.error('Error verifying internship:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.getInternshipsForVerification = async (req, res) => {
  try {
    const unverifiedInternships = await Internship.aggregate([
      // Match only unverified internships
      { $match: { verified: false } },

      // Lookup to get company details
      {
        $lookup: {
          from: 'companies',
          localField: 'companyId',
          foreignField: '_id',
          as: 'companyDetails',
        },
      },
      { $unwind: '$companyDetails' },

      // Lookup to get user details
      {
        $lookup: {
          from: 'users',
          localField: 'userId',
          foreignField: '_id',
          as: 'userDetails',
        },
      },
      { $unwind: '$userDetails' },

      // Project fields with company and user info
      {
        $project: {
          _id: 1,
          role: 1,
          country: 1,
          cities: 1,
          remote: 1,
          skills_required: 1,
          min_stipend: 1,
          max_stipend: 1,
          currency: 1,
          duration: 1,
          applylink: 1,
          last_date: 1,
          description: 1,
          verified: 1,
          createdAt: 1,
          updatedAt: 1,
          company: {
            _id: '$companyDetails._id',
            name: '$companyDetails.name',
          },
          user: {
            _id: '$userDetails._id',
            firstName: '$userDetails.firstName',
            lastName: '$userDetails.lastName',
            email: '$userDetails.email',
            username: '$userDetails.username',
          },
        },
      },

      // Sort by creation date (newest first)
      { $sort: { createdAt: -1 } },
    ]);

    res.json({
      count: unverifiedInternships.length,
      internships: unverifiedInternships,
    });
  } catch (err) {
    console.error('Error fetching internships for verification:', err);
    res.status(500).json({ message: 'Server error' });
  }
};



exports.verifyInternship = async (req, res) => {
  try {
    const internshipId = req.params.id;

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(internshipId)) {
      return res.status(400).json({ message: 'Invalid internship ID format' });
    }

    const internship = await Internship.findById(internshipId);

    if (!internship) {
      return res.status(404).json({ message: 'Internship not found' });
    }

   
    internship.verified = true;
    await internship.save();

    // Invalidate relevant cache entries
    try {
      if (redis.isOpen) {
        const cacheKeys = await redis.sMembers('internships:cache:keys');
        if (cacheKeys.length > 0) {
          await redis.del([...cacheKeys, 'internships:cache:keys']);
          console.log(`Invalidated ${cacheKeys.length} cache entries for internship ${internshipId}`);
        }
      } else {
        console.warn('Redis not connected, skipping cache invalidation');
      }
    } catch (redisErr) {
      console.error('Redis cache invalidation error:', redisErr);
    }

    res.json({
      message: 'Internship verified successfully',
      internship,
    });
  } catch (err) {
    console.error('Error verifying internship:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

