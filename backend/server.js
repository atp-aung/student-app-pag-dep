require("dotenv").config();

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

const allowedOrigins = [
  process.env.FRONTEND_URL,
  ...(process.env.NODE_ENV !== "production"
    ? ["http://localhost:5500", "http://127.0.0.1:5500"]
    : []),
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests without an Origin header (e.g. Postman).
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error("Not allowed by CORS"));
    },
  }),
);

app.use(express.json({ limit: "10kb" }));

// Security Headers
app.use(helmet());

// API Rate Limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
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

const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "student_db",

  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  connectTimeout: 10000,
  enableKeepAlive: true,
  maxIdle: 10,
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
    error.code === "PROTOCOL_CONNECTION_LOST"
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
// Start Server
// ========================================

let server;

async function startServer() {
  try {
    await pool.query("SELECT 1");

    console.log("MySQL connection successful!");

    server = app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
    });
  } catch (error) {
    console.error("Unable to connect to MySQL:", error.message);

    await pool.end();
    process.exit(1);
  }
}

// ========================================
// Graceful Shutdown
// ========================================

async function shutdown(signal) {
  console.log(`${signal} received. Shutting down...`);

  if (server) {
    server.close(async () => {
      try {
        await pool.end();
        console.log("Server and database pool closed.");
        process.exit(0);
      } catch (error) {
        console.error("Shutdown error:", error.message);
        process.exit(1);
      }
    });
  } else {
    await pool.end();
    process.exit(0);
  }
}

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));

startServer();
