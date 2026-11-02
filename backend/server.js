require("dotenv").config();

const fs = require("fs");
const path = require("path");

const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const express = require("express");
const cors = require("cors");
const mysql = require("mysql2/promise");

const app = express();

const PORT = Number(process.env.PORT) || 3000;
const PAGE_SIZE = 3;

// ========================================
// Middleware
// ========================================

// Allowed Frontend Origins
const allowedOrigins = [
  process.env.FRONTEND_URL,
  ...(process.env.NODE_ENV !== "production"
    ? ["http://localhost:5500", "http://127.0.0.1:5500"]
    : []),
].filter(Boolean);

// CORS
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests without an Origin header (e.g. Thunder Client).
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error("Not allowed by CORS"));
    },
  }),
);

// JSON Body Parser
app.use(express.json({ limit: "10kb" }));

// Security Headers
app.use(helmet());

// API Rate Limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    message: "Too many requests. Please try again later.",
  },
});

app.use("/api", apiLimiter);

// ========================================
// MySQL Connection Pool
// ========================================

// Aiven CA Certificate
const caCertificate = fs.readFileSync(path.join(__dirname, "ca.pem"), "utf8");

// MySQL Pool
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,

  // Aiven SSL Connection
  ssl: {
    ca: caCertificate,
    rejectUnauthorized: true,
  },

  waitForConnections: true,
  connectionLimit: 5,
  queueLimit: 0,
  connectTimeout: 10000,
  enableKeepAlive: true,
  maxIdle: 5,
  idleTimeout: 60000,
});

// ========================================
// Health Check API
// ========================================

app.get("/api/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");

    res.status(200).json({
      success: true,
      message: "Application is running.",
      data: {
        server: "OK",
        database: "Connected",
      },
    });
  } catch (error) {
    console.error("Health Check Error:", error.message);

    res.status(503).json({
      success: false,
      message: "Service is temporarily unavailable.",
      data: {
        server: "OK",
        database: "Unavailable",
      },
    });
  }
});

// ========================================
// GET: Retrieve Students with Pagination
// ========================================

app.get("/api/students", async (req, res, next) => {
  try {
    const pageQuery = req.query.page;

    // Default page is 1.
    const requestedPage = pageQuery === undefined ? 1 : Number(pageQuery);

    // Validate page number.
    if (
      typeof pageQuery !== "undefined" &&
      (typeof pageQuery !== "string" ||
        !/^[1-9]\d*$/.test(pageQuery) ||
        !Number.isSafeInteger(requestedPage))
    ) {
      return res.status(400).json({
        message: "Page must be a positive integer.",
      });
    }

    const limit = PAGE_SIZE;

    // Get total number of students.
    const [countRows] = await pool.query(
      "SELECT COUNT(*) AS total FROM students",
    );

    const total = Number(countRows[0].total);
    const totalPages = Math.ceil(total / limit);

    // Keep page within the available range.
    const safePage = totalPages === 0 ? 1 : Math.min(requestedPage, totalPages);

    const offset = (safePage - 1) * limit;

    // Retrieve students for the requested page.
    const [students] = await pool.query(
      `SELECT id, name, age, created_at
       FROM students
       ORDER BY id ASC
       LIMIT ? OFFSET ?`,
      [limit, offset],
    );

    res.status(200).json({
      data: students,
      total,
      page: safePage,
      pageSize: limit,
      totalPages,
    });
  } catch (error) {
    next(error);
  }
});

// ========================================
// POST: Register a New Student
// ========================================

app.post("/api/students", async (req, res, next) => {
  try {
    const name = typeof req.body.name === "string" ? req.body.name.trim() : "";

    const age = Number(req.body.age);

    // Validate student information.
    if (
      !name ||
      name.length > 100 ||
      !Number.isInteger(age) ||
      age < 1 ||
      age > 120
    ) {
      return res.status(400).json({
        message: "Please provide a valid name and age (1-120).",
      });
    }

    // Insert student into MySQL.
    const [result] = await pool.execute(
      "INSERT INTO students (name, age) VALUES (?, ?)",
      [name, age],
    );

    res.status(201).json({
      message: "Student registered successfully.",
      student: {
        id: result.insertId,
        name,
        age,
      },
    });
  } catch (error) {
    next(error);
  }
});

// ========================================
// 404 Handler
// ========================================

app.use((req, res) => {
  res.status(404).json({
    message: "Route not found.",
  });
});

// ========================================
// Centralized Error Handler
// ========================================

app.use((error, req, res, next) => {
  console.error("Application Error:", error.message);

  if (error.type === "entity.too.large") {
    return res.status(413).json({
      message: "Request body is too large.",
    });
  }

  if (error instanceof SyntaxError && error.status === 400) {
    return res.status(400).json({
      message: "Invalid JSON request body.",
    });
  }

  if (error.message === "Not allowed by CORS") {
    return res.status(403).json({
      message: "Origin is not allowed.",
    });
  }

  if (
    error.code === "ECONNREFUSED" ||
    error.code === "ETIMEDOUT" ||
    error.code === "PROTOCOL_CONNECTION_LOST" ||
    error.code === "ECONNRESET"
  ) {
    return res.status(503).json({
      message: "Database service is temporarily unavailable.",
    });
  }

  res.status(500).json({
    message: "Internal server error.",
  });
});

// ========================================
// Export Express App for Vercel
// ========================================

module.exports = app;

// ========================================
// Local Development Server
// ========================================

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
  });
}
