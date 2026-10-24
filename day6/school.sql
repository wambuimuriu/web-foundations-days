-- Day 6: School database (students, courses, enrolments)
-- Runs in SQLite (e.g. sqliteonline.com)

PRAGMA foreign_keys = ON;

-- ---------- Tables ----------

CREATE TABLE students (
  id    INTEGER PRIMARY KEY,
  name  TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE
);

CREATE TABLE courses (
  id      INTEGER PRIMARY KEY,
  title   TEXT NOT NULL,
  credits INTEGER NOT NULL DEFAULT 3
);

CREATE TABLE enrolments (
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  course_id  INTEGER NOT NULL REFERENCES courses(id)  ON DELETE CASCADE,
  grade      TEXT,  -- NULL until the course has been graded
  PRIMARY KEY (student_id, course_id)  -- same student cannot enrol twice on the same course
);

-- ---------- Sample data ----------

INSERT INTO students (name, email) VALUES
  ('Amina Hassan', 'amina@example.com'),
  ('Brian Otieno', 'brian@example.com'),
  ('Cynthia Wanjiru', 'cynthia@example.com'),
  ('David Mwangi', 'david@example.com');   -- not enrolled anywhere yet

INSERT INTO courses (title, credits) VALUES
  ('Web Foundations', 4),
  ('Databases', 3),
  ('JavaScript Basics', 3);

INSERT INTO enrolments (student_id, course_id, grade) VALUES
  (1, 1, 'A'),
  (1, 2, 'B'),
  (2, 1, 'B'),
  (2, 3, NULL),
  (3, 1, 'C'),
  (3, 2, NULL);

-- ---------- Queries ----------

-- 1. All courses for one student (by name)
SELECT c.title, e.grade
FROM students s
JOIN enrolments e ON e.student_id = s.id
JOIN courses c    ON c.id = e.course_id
WHERE s.name = 'Amina Hassan';

-- 2. All students on one course
SELECT s.name, s.email, e.grade
FROM courses c
JOIN enrolments e ON e.course_id = c.id
JOIN students s   ON s.id = e.student_id
WHERE c.title = 'Web Foundations';

-- 3. Number of students per course (courses with no students show 0)
SELECT c.title, COUNT(e.student_id) AS student_count
FROM courses c
LEFT JOIN enrolments e ON e.course_id = c.id
GROUP BY c.id, c.title;

-- 4. Students who have no enrolments
SELECT s.name, s.email
FROM students s
LEFT JOIN enrolments e ON e.student_id = s.id
WHERE e.student_id IS NULL;

-- 5. Update one enrolment's grade (Brian Otieno, JavaScript Basics)
UPDATE enrolments
SET grade = 'A'
WHERE student_id = (SELECT id FROM students WHERE name = 'Brian Otieno')
  AND course_id  = (SELECT id FROM courses  WHERE title = 'JavaScript Basics');

-- Check the update
SELECT s.name, c.title, e.grade
FROM enrolments e
JOIN students s ON s.id = e.student_id
JOIN courses c  ON c.id = e.course_id
WHERE s.name = 'Brian Otieno';
