const express = require("express");
const router = express.Router();
const {
  getAllCompanyNamesAndIds,
  getAllNotVerifiedCompanies,
  getTopCompaniesByRating,
  getTopCompaniesBySalary,
  getTopCompaniesByJobSecurity,
  getTopCompaniesByWorkEnv,
  searchCompanies,
  deleteCompany, 
  verifyCompany
} = require("../controllers/companyController");

const { protect } = require("../middlewares/authMiddleware");
// Get a company by ID
router.get("/all", getAllCompanyNamesAndIds);

router.get("/verify", getAllNotVerifiedCompanies);
// Get top 4 companies by average rating
router.get("/top/rating", getTopCompaniesByRating);

// Get top 4 companies by salary
router.get("/top/salary", getTopCompaniesBySalary);

// Get top 4 companies by job security
router.get("/top/job-security", getTopCompaniesByJobSecurity);

// Get top 4 companies by work environment
router.get("/top/work-environment", getTopCompaniesByWorkEnv);

// 🔍 Search for companies by name (New Route)
router.get("/", searchCompanies);

 // Delete a company by ID
router.delete("/:id", protect ,deleteCompany);    
// update verify          
router.put("/verify/:id/", protect ,verifyCompany);
module.exports = router;
