const Company = require("../models/Company");
const Review = require("../models/Review");


// Get a company by ID
exports.getAllCompanyNamesAndIds = async (req, res) => {
  try {
    const companies = await Company.find({}, { _id: 1, name: 1 }); // Fetch only _id and name

    res.status(200).json(companies);
  } catch (error) {
    console.error("Error fetching company names and IDs:", error);
    res.status(500).json({ message: "Server error", error });
  }
};

exports.getAllNotVerifiedCompanies = async (req, res) => {
  try {
    const companies = await Company.find(
      { verified: false }, // Only fetch unverified companies
      { reviews: 0 }       // Exclude the reviews array
    );

    res.status(200).json(companies);
  } catch (error) {
    console.error("Error fetching unverified companies:", error);
    res.status(500).json({ message: "Server error", error });
  }
};


// Get top 4 companies by average rating
exports.getTopCompaniesByRating = async (req, res) => {
  try {
    const companies = await Company.aggregate([
      { $match: { verified: true } }, // Only verified companies
      { $sort: { avgRating: -1, TotalReviews: -1 } }, // Sort by avgRating, then by TotalReviews
      { $limit: 4 }, // Limit to top 4 companies
      { 
        $project: { 
          _id: 1, 
          name: 1, 
          website: 1, 
          avgRating: 1, 
          TotalReviews: 1, 
          salary: 1, 
          workEnv: 1, 
          jobSec: 1 
        } 
      } // Project required fields
    ]);

    res.json(companies);
  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
};



// Get top 4 companies by salary
exports.getTopCompaniesBySalary = async (req, res) => {
  try {
    const companies = await Company.aggregate([
      { $match: { verified: true } }, // Only include verified companies
      { $sort: { salary: -1,avgRating: -1,TotalReviews :-1 } },       // Sort by salary in descending order
      { $limit: 4 },                   // Limit to the top 4 companies
      { 
        $project: {                   // Project only required fields
          _id: 1,
          name: 1,
          website: 1,
          salary: 1,
          avgRating: 1,
          TotalReviews: 1,
          workEnv: 1,
          jobSec: 1
        } 
      }
    ]);

    res.status(200).json(companies);
  } catch (error) {
    console.error("Error fetching top companies by salary:", error);
    res.status(500).json({ message: "Server error", error });
  }
};


// Get top 4 companies by job security
exports.getTopCompaniesByJobSecurity = async (req, res) => {
  try {
    const companies = await Company.aggregate([
      { $match: { verified: true } }, // Only include verified companies
      { $sort: { jobSec: -1 ,avgRating: -1,TotalReviews :-1} },       // Sort by jobSec in descending order
      { $limit: 4 },                   // Limit to top 4 companies
      { 
        $project: {                   // Project only the required fields
          _id: 1,
          name: 1,
          website: 1,
          jobSec: 1,
          avgRating: 1,
          TotalReviews: 1,
          salary: 1,
          workEnv: 1
        }
      }
    ]);

    res.status(200).json(companies);
  } catch (error) {
    console.error("Error fetching top companies by job security:", error);
    res.status(500).json({ message: "Server error", error });
  }
};


// Get top 4 companies by work environment
exports.getTopCompaniesByWorkEnv = async (req, res) => {
  try {
    const companies = await Company.aggregate([
      { $match: { verified: true } }, // Only include verified companies
      { $sort: { workEnv: -1,avgRating: -1,TotalReviews :-1 } },       // Sort by workEnv in descending order
      { $limit: 4 },                   // Limit to top 4 companies
      { 
        $project: {                   // Project only required fields
          _id: 1,
          name: 1,
          website: 1,
          workEnv: 1,
          avgRating: 1,
          TotalReviews: 1,
          salary: 1,
          jobSec: 1
        }
      }
    ]);

    res.status(200).json(companies);
  } catch (error) {
    console.error("Error fetching top companies by work environment:", error);
    res.status(500).json({ message: "Server error", error });
  }
};


exports.searchCompanies = async (req, res) => {
  try {
    const { search } = req.query;
    if (!search) {
      return res.status(400).json({ message: "Search query is required" });
    }

    // Case-insensitive search using regex
    const companies = await Company.find({
      name: { $regex: search, $options: "i" }
    }).limit(10); // Limit to 10 results

    res.json(companies);
  } catch (error) {
    console.error("Error searching companies:", error);
    res.status(500).json({ message: "Server error" });
  }
};


// company delete kardo
exports.deleteCompany = async (req, res) => {
  try {
    const { id } = req.params;

    // Find the company and check if it exists
    const company = await Company.findById(id);
    if (!company) {
      return res.status(404).json({ message: "Company not found" });
    }

    // Delete all reviews referenced in the company's reviews array
    if (company.reviews.length > 0) {
      await Review.deleteMany({ _id: { $in: company.reviews } });
    }

    // Delete the company
    await Company.findByIdAndDelete(id);

    res.status(200).json({ message: "Company and associated reviews deleted successfully" });
  } catch (error) {
    console.error("Error deleting company:", error);
    res.status(500).json({ message: "Server error", error });
  }
};

// update verification of a company
exports.verifyCompany = async (req, res) => {
  try {
    const { id } = req.params;

    const updatedCompany = await Company.findByIdAndUpdate(
      id,
      { verified: true }, // Set verified to true
      { new: true } // Return updated document
    );

    if (!updatedCompany) {
      return res.status(404).json({ message: "Company not found" });
    }

    res.status(200).json({ message: "Company verified successfully", updatedCompany });
  } catch (error) {
    console.error("Error verifying company:", error);
    res.status(500).json({ message: "Server error", error });
  }
};

