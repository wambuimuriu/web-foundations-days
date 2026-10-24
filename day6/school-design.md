# School Database Design

## Tables

**students** stores one row per student: `id` (primary key), `name` (required) and `email` (required, `UNIQUE` so two students cannot share an address).

**courses** stores one row per course: `id` (primary key), `title` (required) and `credits` (required, default 3).

**enrolments** stores the fact that a student is enrolled on a course. It has `student_id` and `course_id` (both foreign keys, both `NOT NULL`) and `grade`, which is `NULL` until the course is graded. The pair `(student_id, course_id)` is the composite primary key, so the same student cannot enrol on the same course twice.

## Relationships

- **students → enrolments is one-to-many:** one student can have many enrolments, but each enrolment belongs to exactly one student.
- **courses → enrolments is one-to-many:** one course can have many enrolments, but each enrolment belongs to exactly one course.
- **students ↔ courses is many-to-many:** a student takes many courses, and a course has many students.

A relational table cannot hold a many-to-many relationship directly. Storing a list of course ids in a student row (or student ids in a course row) breaks first normal form, cannot use foreign keys, and makes queries and updates awkward. A **join table** solves this: `enrolments` turns the many-to-many into two one-to-many relationships, with one row per student-course pair. It is also the natural home for data about the relationship itself, here the grade, which belongs to neither the student nor the course alone.

## Index

I would add an index on `enrolments(course_id)`:

```sql
CREATE INDEX idx_enrolments_course_id ON enrolments(course_id);
```

The composite primary key `(student_id, course_id)` already speeds up lookups starting from a student, but queries that start from a course ("all students on this course", "students per course") would otherwise have to scan the whole table. The index makes those fast. The trade-off is slightly slower inserts and a little extra storage.

## SQL or NoSQL?

I would choose SQL (a relational database) for this system. The data is highly structured and relational: students, courses and enrolments have a fixed shape and clear links between them. Constraints matter here, such as unique emails, no duplicate enrolments, and foreign keys that stop an enrolment pointing at a student or course that does not exist, and a relational database enforces them for us. We also need queries across tables (joins, counts per course, students with no enrolments), which SQL does naturally, and updates such as changing a grade should be consistent, which transactions guarantee. NoSQL would make more sense if the data were loosely structured, changed shape often, or had to scale across many servers, but none of that applies to a school's records.
