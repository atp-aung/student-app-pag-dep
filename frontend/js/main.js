// ========================================
// API Configuration
// ========================================

//const API_BASE_URL = "http://localhost:3000";
//const API_URL = `${API_BASE_URL}/api/students`;

const API_BASE_URL = "https://student-registration-api-lake.vercel.app";
const API_URL = `${API_BASE_URL}/api/students`;

const PAGE_SIZE = 3;

// ========================================
// DOM Elements
// ========================================

const studentForm = document.getElementById("student-form");
const tableBody = document.getElementById("students-table-body");
const pagination = document.getElementById("pagination");
const listSummary = document.getElementById("list-summary");
const message = document.getElementById("message");
const submitButton = document.getElementById("submit-button");

let currentPage = 1;
let totalPages = 1;

// ========================================
// GET: Load Students
// ========================================

async function loadStudents(page = 1) {
  tableBody.innerHTML =
    '<tr><td colspan="4" class="empty">Loading...</td></tr>';

  try {
    const response = await fetch(`${API_URL}?page=${page}`);
    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || "Could not load students.");
    }

    currentPage = result.page;
    totalPages = result.totalPages;

    renderStudents(result.data);
    renderPagination();

    const start = result.total === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;

    const end = Math.min(currentPage * PAGE_SIZE, result.total);

    listSummary.textContent = `Showing ${start}-${end} of ${result.total} students`;
  } catch (error) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="4" class="empty">
          ${escapeHtml(error.message)}
        </td>
      </tr>
    `;

    pagination.innerHTML = "";
    listSummary.textContent = "Unable to load student list";
  }
}

// ========================================
// Render Students
// ========================================

function renderStudents(students) {
  if (students.length === 0) {
    tableBody.innerHTML =
      '<tr><td colspan="4" class="empty">No students registered yet.</td></tr>';

    return;
  }

  tableBody.innerHTML = students
    .map(
      (student) => `
    <tr>
      <td>${student.id}</td>
      <td>${escapeHtml(student.name)}</td>
      <td>${student.age}</td>
      <td>${new Date(student.created_at).toLocaleString()}</td>
    </tr>
  `,
    )
    .join("");
}

// ========================================
// Render Pagination
// ========================================

function renderPagination() {
  if (totalPages <= 1) {
    pagination.innerHTML = "";
    return;
  }

  let html = `
    <button
      type="button"
      data-page="${currentPage - 1}"
      ${currentPage === 1 ? "disabled" : ""}
    >
      Previous
    </button>
  `;

  for (let page = 1; page <= totalPages; page++) {
    html += `
      <button
        type="button"
        data-page="${page}"
        class="${page === currentPage ? "active" : ""}"
        ${page === currentPage ? 'aria-current="page"' : ""}
      >
        ${page}
      </button>
    `;
  }

  html += `
    <button
      type="button"
      data-page="${currentPage + 1}"
      ${currentPage === totalPages ? "disabled" : ""}
    >
      Next
    </button>
  `;

  pagination.innerHTML = html;
}

// ========================================
// Pagination Click Event
// ========================================

pagination.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-page]");

  if (!button || button.disabled) return;

  loadStudents(Number(button.dataset.page));
});

// ========================================
// POST: Register New Student
// ========================================

studentForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  message.textContent = "";
  message.className = "";

  submitButton.disabled = true;

  const formData = new FormData(studentForm);

  const student = {
    name: formData.get("name").trim(),
    age: Number(formData.get("age")),
  };

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(student),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || "Registration failed.");
    }

    studentForm.reset();

    message.textContent = result.message;
    message.className = "success";

    // Get the latest total page count.
    const countResponse = await fetch(`${API_URL}?page=1`);
    const countResult = await countResponse.json();

    if (!countResponse.ok) {
      throw new Error(countResult.message || "Could not refresh student list.");
    }

    // Display the last page containing the newly registered student.
    await loadStudents(countResult.totalPages || 1);
  } catch (error) {
    message.textContent = error.message;
    message.className = "error";
  } finally {
    submitButton.disabled = false;
  }
});

// ========================================
// Escape HTML
// ========================================

function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[char],
  );
}

// ========================================
// Initial Load
// ========================================

loadStudents();
