# Student Registration App (with Pagination)

A simple full-stack student registration app using HTML, CSS, Vanilla JavaScript, Node.js, Express, and MySQL.

## Features
- Register a student (POST API)
- View students (GET API)
- Pagination: exactly 3 students per page
- Previous, Next, and numbered page buttons
- Students are listed by ascending ID

There are intentionally no UPDATE or DELETE API routes.

## Project structure

```text
student-app/
├── frontend/
│   ├── index.html
│   ├── css/style.css
│   └── js/main.js
├── backend/
│   ├── server.js
│   ├── package.json
│   └── .env.example
├── database/schema.sql
├── .gitignore
└── README.md
```

## 1. Create the database

Open MySQL Workbench or the MySQL command line and run the SQL in `database/schema.sql`.

## 2. Configure the backend

Open a terminal in the `backend` folder and run:

```bash
npm install
```

Copy `.env.example` to `.env`, then update `DB_USER` and `DB_PASSWORD` with your MySQL credentials.

Start the API:

```bash
npm run dev
```

The API runs at `http://localhost:3000`.

## 3. Open the frontend

Open `frontend/index.html` with VS Code Live Server.

## API endpoints

### GET `/api/students?page=1&limit=3`

The backend fixes the page size at 3, regardless of the `limit` query parameter. Example response:

```json
{
  "data": [
    { "id": 1, "name": "Aung Aung", "age": 20, "created_at": "2026-11-01T..." }
  ],
  "total": 7,
  "page": 1,
  "pageSize": 3,
  "totalPages": 3
}
```

### POST `/api/students`

Request body:

```json
{ "name": "Aung Aung", "age": 20 }
```

The API validates the input and inserts the student using a parameterized SQL query.

## How pagination works

The backend calculates the SQL offset with `(page - 1) * 3`, then uses `LIMIT 3 OFFSET ?`. It also runs `COUNT(*)` to calculate the total number of pages. The frontend uses that metadata to draw the page buttons.
