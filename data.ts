import { createId } from "@paralleldrive/cuid2";

// Helper function to create fixed IDs (for establishing relationships)
const fixedId = (prefix: string, num: number) => `${prefix}_${num}`;

export const seedData = {
  // Users data
  users: [
    {
      id: fixedId("user", 1),
      email: "john.teacher@college.edu",
      passwordHash: "hashed_password_1",
      fullName: "John Smith",
      contactNumber: "1234567890",
      role: "teacher",
      createdAt: new Date("2024-01-01").getTime(),
    },
    {
      id: fixedId("user", 2),
      email: "mary.teacher@college.edu",
      passwordHash: "hashed_password_2",
      fullName: "Mary Johnson",
      contactNumber: "2345678901",
      role: "teacher",
      createdAt: new Date("2024-01-01").getTime(),
    },
    {
      id: fixedId("user", 3),
      email: "alice.student@college.edu",
      passwordHash: "hashed_password_3",
      fullName: "Alice Brown",
      contactNumber: "3456789012",
      role: "student",
      createdAt: new Date("2024-01-01").getTime(),
    },
    {
      id: fixedId("user", 4),
      email: "bob.student@college.edu",
      passwordHash: "hashed_password_4",
      fullName: "Bob Wilson",
      contactNumber: "4567890123",
      role: "student",
      createdAt: new Date("2024-01-01").getTime(),
    },
    {
      id: fixedId("user", 5),
      email: "admin@college.edu",
      passwordHash: "hashed_password_5",
      fullName: "Admin User",
      contactNumber: "5678901234",
      role: "admin",
      createdAt: new Date("2024-01-01").getTime(),
    },
  ],

  // Teachers data
  teachers: [
    {
      id: fixedId("teacher", 1),
      userId: fixedId("user", 1),
      department: "Computer Science",
    },
    {
      id: fixedId("teacher", 2),
      userId: fixedId("user", 2),
      department: "Information Technology",
    },
  ],

  // Students data
  students: [
    {
      id: fixedId("student", 1),
      userId: fixedId("user", 3),
      rollNumber: "CS2024001",
      pid: "P2024001",
      currentSemester: 5,
      currentYear: "TE",
      division: "A",
      academicYear: "2024-2025",
    },
    {
      id: fixedId("student", 2),
      userId: fixedId("user", 4),
      rollNumber: "CS2024002",
      pid: "P2024002",
      currentSemester: 5,
      currentYear: "TE",
      division: "A",
      academicYear: "2024-2025",
    },
  ],

  // Subjects data
  subjects: [
    {
      id: fixedId("subject", 1),
      subjectCode: "CS301",
      subjectName: "Database Management Systems",
      semester: 5,
      year: "TE",
    },
    {
      id: fixedId("subject", 2),
      subjectCode: "CS302",
      subjectName: "Web Technology",
      semester: 5,
      year: "TE",
    },
  ],

  // Teacher-Subject assignments
  teacherSubjects: [
    {
      id: fixedId("teacherSubject", 1),
      teacherId: fixedId("teacher", 1),
      subjectId: fixedId("subject", 1),
      division: "A",
      academicYear: "2024-2025",
    },
    {
      id: fixedId("teacherSubject", 2),
      teacherId: fixedId("teacher", 2),
      subjectId: fixedId("subject", 2),
      division: "A",
      academicYear: "2024-2025",
    },
  ],

  // Tasks/Assignments
  tasks: [
    {
      id: fixedId("task", 1),
      teacherSubjectId: fixedId("teacherSubject", 1),
      taskType: "ISE1",
      title: "Database Normalization Assignment",
      dueDate: new Date("2024-03-15").getTime(),
      totalMarks: 20,
      createdAt: new Date("2024-03-01").getTime(),
    },
    {
      id: fixedId("task", 2),
      teacherSubjectId: fixedId("teacherSubject", 2),
      taskType: "ISE1",
      title: "JavaScript Fundamentals",
      dueDate: new Date("2024-03-20").getTime(),
      totalMarks: 20,
      createdAt: new Date("2024-03-05").getTime(),
    },
  ],

  // Submissions
  submissions: [
    {
      id: fixedId("submission", 1),
      taskId: fixedId("task", 1),
      studentId: fixedId("student", 1),
      submissionFilePath: "/submissions/2024/CS2024001_ISE1_DBMS.pdf",
      submissionDate: new Date("2024-03-14").getTime(),
      status: "graded",
    },
    {
      id: fixedId("submission", 2),
      taskId: fixedId("task", 1),
      studentId: fixedId("student", 2),
      submissionFilePath: "/submissions/2024/CS2024002_ISE1_DBMS.pdf",
      submissionDate: new Date("2024-03-15").getTime(),
      status: "graded",
    },
  ],

  // Marks
  marks: [
    {
      id: fixedId("marks", 1),
      submissionId: fixedId("submission", 1),
      questionNumber: 1,
      marksObtained: 8.5,
      comments: "Good understanding of normalization concepts",
      markedBy: fixedId("teacher", 1),
      markedAt: new Date("2024-03-16").getTime(),
    },
    {
      id: fixedId("marks", 2),
      submissionId: fixedId("submission", 2),
      questionNumber: 1,
      marksObtained: 7.5,
      comments: "Decent attempt, needs improvement in 3NF understanding",
      markedBy: fixedId("teacher", 1),
      markedAt: new Date("2024-03-16").getTime(),
    },
  ],
};

// Insert helper function
export const insertSeedData = async (db) => {
  try {
    // Insert in order of dependencies
    await db.batch([
      db.prepare(
        "INSERT INTO users (id, email, password_hash, full_name, contact_number, role, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
        .bind(
          ...seedData.users.map(u => [u.id, u.email, u.passwordHash, u.fullName, u.contactNumber, u.role, u.createdAt]),
        ),

      db.prepare("INSERT INTO teachers (id, user_id, department) VALUES (?, ?, ?)")
        .bind(...seedData.teachers.map(t => [t.id, t.userId, t.department])),

      db.prepare(
        "INSERT INTO students (id, user_id, roll_number, pid, current_semester, current_year, division, academic_year) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      )
        .bind(
          ...seedData.students.map(
            s => [s.id, s.userId, s.rollNumber, s.pid, s.currentSemester, s.currentYear, s.division, s.academicYear]
          ),
        ),

      db.prepare("INSERT INTO subjects (id, subject_code, subject_name, semester, year) VALUES (?, ?, ?, ?, ?)")
        .bind(...seedData.subjects.map(s => [s.id, s.subjectCode, s.subjectName, s.semester, s.year])),

      db.prepare(
        "INSERT INTO teacher_subjects (id, teacher_id, subject_id, division, academic_year) VALUES (?, ?, ?, ?, ?)",
      )
        .bind(...seedData.teacherSubjects.map(ts => [ts.id, ts.teacherId, ts.subjectId, ts.division, ts.academicYear])),

      db.prepare(
        "INSERT INTO tasks (id, teacher_subject_id, task_type, title, due_date, total_marks, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
        .bind(
          ...seedData.tasks.map(
            t => [t.id, t.teacherSubjectId, t.taskType, t.title, t.dueDate, t.totalMarks, t.createdAt]
          ),
        ),

      db.prepare(
        "INSERT INTO submissions (id, task_id, student_id, submission_file_path, submission_date, status) VALUES (?, ?, ?, ?, ?, ?)",
      )
        .bind(
          ...seedData.submissions.map(
            s => [s.id, s.taskId, s.studentId, s.submissionFilePath, s.submissionDate, s.status]
          ),
        ),

      db.prepare(
        "INSERT INTO marks (id, submission_id, question_number, marks_obtained, comments, marked_by, marked_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
        .bind(
          ...seedData.marks.map(
            m => [m.id, m.submissionId, m.questionNumber, m.marksObtained, m.comments, m.markedBy, m.markedAt]
          ),
        ),
    ]);

    console.log("Seed data inserted successfully");
  } catch (error) {
    console.error("Error inserting seed data:", error);
    throw error;
  }
};


