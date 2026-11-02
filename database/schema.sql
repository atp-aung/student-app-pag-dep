CREATE DATABASE IF NOT EXISTS student_page_db;
USE student_page_db;

CREATE TABLE IF NOT EXISTS students (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    age INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

//AVNS_XmoN1F3QylX4z4ItHnN
//mysql://avnadmin:AVNS_XmoN1F3QylX4z4ItHnN@student-db-atp-28c9.c.aivencloud.com:28788/defaultdb?ssl-mode=REQUIRED